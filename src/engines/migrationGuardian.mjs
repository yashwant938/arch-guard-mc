/**
 * ArchGuard Zero-Downtime SQL Migration & Expand-Contract Guardian (Pure ESM)
 *
 * Analyzes PostgreSQL / MySQL / SQLite DDL scripts for table-locking and
 * rolling-deploy breaking changes, then generates an actionable 3-phase
 * Expand-Contract deployment plan.
 */

function splitStatements(sql) {
  const cleaned = String(sql || '')
    .replace(/--[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');

  const stmts = [];
  let current = '';
  let inSingle = false;
  let inDouble = false;

  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (ch === "'" && !inDouble) inSingle = !inSingle;
    else if (ch === '"' && !inSingle) inDouble = !inDouble;

    if (ch === ';' && !inSingle && !inDouble) {
      if (current.trim()) stmts.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) stmts.push(current.trim());
  return stmts;
}

export function analyzeSqlMigration(sql, options = {}) {
  const dialect = (options.dialect || 'postgres').toLowerCase();
  const rawSql = String(sql || '');
  const statements = splitStatements(rawSql);
  const findings = [];
  const expandContractPhases = {
    phase1Expand: [],
    phase2BackfillAndDualWrite: [],
    phase3Contract: [],
  };

  const hasLockTimeout = /\bSET\s+(?:LOCAL\s+)?lock_timeout\b/i.test(rawSql);
  const hasStatementTimeout = /\bSET\s+(?:LOCAL\s+)?statement_timeout\b/i.test(rawSql);
  const hasDdl = statements.some((s) => /^\s*(ALTER|CREATE|DROP|TRUNCATE)\b/i.test(s));

  if (dialect === 'postgres' && hasDdl && !hasLockTimeout) {
    findings.push({
      id: 'MIG-007',
      severity: 'MEDIUM',
      lockLevel: 'QUEUE_PILEUP_RISK',
      statement: '(migration header)',
      title: 'Missing `SET lock_timeout` guard before DDL',
      impact:
        'If an active transaction holds a lock on the target table, an unbounded `ALTER TABLE` waits for ACCESS EXCLUSIVE and queues EVERY subsequent SELECT/UPDATE behind it — causing an immediate site-wide outage.',
      fix: "Add `SET lock_timeout = '3s';` (and retry with backoff in your migration runner) at the top of the migration.",
    });
  }

  for (const stmt of statements) {
    const normalized = stmt.replace(/\s+/g, ' ').trim();

    // MIG-001: CREATE INDEX without CONCURRENTLY (Postgres)
    if (/^CREATE\s+(?:UNIQUE\s+)?INDEX\b/i.test(normalized) && !/\bCONCURRENTLY\b/i.test(normalized)) {
      if (dialect === 'postgres') {
        const safeStmt = normalized.replace(/^CREATE\s+(UNIQUE\s+)?INDEX\b/i, 'CREATE $1INDEX CONCURRENTLY');
        findings.push({
          id: 'MIG-001',
          severity: 'CRITICAL',
          lockLevel: 'SHARE (blocks all INSERT/UPDATE/DELETE)',
          statement: normalized,
          title: 'Blocking `CREATE INDEX` without `CONCURRENTLY`',
          impact: 'Acquires a SHARE lock for the entire index build duration, blocking all writes on the table.',
          fix: `Run outside a transaction block using: \`${safeStmt};\``,
        });
        expandContractPhases.phase1Expand.push(`${safeStmt}; -- run outside explicit BEGIN/COMMIT`);
      } else if (dialect === 'mysql' && !/\bALGORITHM\s*=\s*INPLACE\b|\bLOCK\s*=\s*NONE\b/i.test(normalized)) {
        findings.push({
          id: 'MIG-001',
          severity: 'HIGH',
          lockLevel: 'ONLINE_DDL_UNSPECIFIED',
          statement: normalized,
          title: 'MySQL `CREATE INDEX` missing explicit `ALGORITHM=INPLACE, LOCK=NONE`',
          impact: 'Without explicit online DDL clauses, MySQL may silently fall back to table copy blocking writes.',
          fix: 'Append `ALGORITHM=INPLACE, LOCK=NONE` so MySQL fails fast instead of locking production.',
        });
      }
    }

    // MIG-002: DROP COLUMN / DROP TABLE / RENAME COLUMN / RENAME TABLE
    const dropCol = /\bALTER\s+TABLE\s+([^\s]+)\s+[\s\S]*?\bDROP\s+COLUMN\s+(?:IF\s+EXISTS\s+)?([^\s,;]+)/i.exec(normalized);
    if (dropCol) {
      const [, table, col] = dropCol;
      findings.push({
        id: 'MIG-002',
        severity: 'CRITICAL',
        lockLevel: 'ACCESS EXCLUSIVE + BREAKING_ROLLING_DEPLOY',
        statement: normalized,
        title: `Destructive \`DROP COLUMN ${col}\` on \`${table}\` breaks running pods`,
        impact: 'During a rolling deploy, older app instances still SELECT/INSERT this column and immediately throw 500 errors.',
        fix: 'Stop reading/writing the column in app code first, deploy everywhere, verify zero queries, THEN drop column in a follow-up migration.',
      });
      expandContractPhases.phase2BackfillAndDualWrite.push(`Deploy app release removing all reads/writes to ${table}.${col}.`);
      expandContractPhases.phase3Contract.push(`SET lock_timeout = '3s'; ALTER TABLE ${table} DROP COLUMN IF EXISTS ${col};`);
    }

    const renameCol = /\bALTER\s+TABLE\s+([^\s]+)\s+[\s\S]*?\bRENAME\s+(?:COLUMN\s+)?([^\s]+)\s+TO\s+([^\s;]+)/i.exec(normalized);
    if (renameCol) {
      const [, table, oldCol, newCol] = renameCol;
      findings.push({
        id: 'MIG-002',
        severity: 'CRITICAL',
        lockLevel: 'ACCESS EXCLUSIVE + BREAKING_ROLLING_DEPLOY',
        statement: normalized,
        title: `In-place \`RENAME COLUMN ${oldCol} TO ${newCol}\` breaks active app instances`,
        impact: 'No app version can simultaneously query the old and new name atomically across all Kubernetes pods.',
        fix: 'Use Expand-Contract: add nullable new column → dual-write + backfill → switch reads → drop old column.',
      });
      expandContractPhases.phase1Expand.push(`ALTER TABLE ${table} ADD COLUMN ${newCol} <same_type>;`);
      expandContractPhases.phase2BackfillAndDualWrite.push(
        `Dual-write ${oldCol} and ${newCol} in application, backfill existing rows in batches of 5,000, then switch reads to ${newCol}.`
      );
      expandContractPhases.phase3Contract.push(`ALTER TABLE ${table} DROP COLUMN ${oldCol};`);
    }

    if (/^DROP\s+TABLE\b/i.test(normalized)) {
      findings.push({
        id: 'MIG-002',
        severity: 'CRITICAL',
        lockLevel: 'ACCESS EXCLUSIVE + IRREVERSIBLE_DATA_LOSS',
        statement: normalized,
        title: 'Irreversible `DROP TABLE` statement',
        impact: 'Immediately destroys data and breaks rollback paths if a deployment must be reverted.',
        fix: 'Verify zero traffic via pg_stat_user_tables for >= 7 days, snapshot backup, and drop in an isolated contract PR.',
      });
    }

    // MIG-003: ADD COLUMN NOT NULL without DEFAULT
    const addNotNull = /\bALTER\s+TABLE\s+([^\s]+)\s+[\s\S]*?\bADD\s+(?:COLUMN\s+)?([^\s]+)\s+([^,;]+?)\bNOT\s+NULL\b/i.exec(normalized);
    if (addNotNull && !/\bDEFAULT\b/i.test(normalized)) {
      const [, table, col, typeDef] = addNotNull;
      findings.push({
        id: 'MIG-003',
        severity: 'CRITICAL',
        lockLevel: 'ACCESS EXCLUSIVE + ROLLING_INSERT_FAILURE',
        statement: normalized,
        title: `\`ADD COLUMN ${col} NOT NULL\` without DEFAULT on \`${table}\``,
        impact: 'Fails immediately on non-empty tables AND breaks older app pods whose INSERTs omit the new column.',
        fix: `Add nullable first, backfill in batches, add \`CHECK (${col} IS NOT NULL) NOT VALID\`, then \`VALIDATE CONSTRAINT\`.`,
      });
      expandContractPhases.phase1Expand.push(`ALTER TABLE ${table} ADD COLUMN ${col} ${typeDef.trim()}; -- nullable`);
      expandContractPhases.phase2BackfillAndDualWrite.push(
        `Deploy app writing ${table}.${col}, then backfill NULL rows in 5,000-row batches with throttling.`
      );
      expandContractPhases.phase3Contract.push(
        `ALTER TABLE ${table} ADD CONSTRAINT chk_${col}_not_null CHECK (${col} IS NOT NULL) NOT VALID;\nALTER TABLE ${table} VALIDATE CONSTRAINT chk_${col}_not_null;`
      );
    }

    // MIG-004: ALTER COLUMN TYPE (table rewrite!)
    const alterType = /\bALTER\s+TABLE\s+([^\s]+)\s+[\s\S]*?\bALTER\s+(?:COLUMN\s+)?([^\s]+)\s+(?:SET\s+DATA\s+)?TYPE\s+([^\s,;]+)/i.exec(normalized);
    if (alterType) {
      const [, table, col, newType] = alterType;
      findings.push({
        id: 'MIG-004',
        severity: 'HIGH',
        lockLevel: 'ACCESS EXCLUSIVE (Full Table Rewrite)',
        statement: normalized,
        title: `\`ALTER COLUMN ${col} TYPE ${newType}\` triggers full table rewrite lock`,
        impact: 'Rewrites every heap page and index under ACCESS EXCLUSIVE lock, blocking all reads and writes for minutes to hours.',
        fix: 'Use Expand-Contract: add a new column with target type, dual-write + batch backfill, swap reads, then drop old column.',
      });
      expandContractPhases.phase1Expand.push(`ALTER TABLE ${table} ADD COLUMN ${col}_v2 ${newType};`);
      expandContractPhases.phase2BackfillAndDualWrite.push(`Dual-write ${col} and ${col}_v2; batch-backfill historical rows; migrate reads to ${col}_v2.`);
      expandContractPhases.phase3Contract.push(`Drop legacy ${table}.${col} after rollback window expires.`);
    }

    // MIG-005: ADD CONSTRAINT CHECK / FOREIGN KEY without NOT VALID
    if (/\bALTER\s+TABLE\b[\s\S]*?\bADD\s+CONSTRAINT\b[\s\S]*?\b(CHECK|FOREIGN\s+KEY)\b/i.test(normalized) && !/\bNOT\s+VALID\b/i.test(normalized)) {
      findings.push({
        id: 'MIG-005',
        severity: 'HIGH',
        lockLevel: 'SHARE ROW EXCLUSIVE / ACCESS EXCLUSIVE (Full Table Scan)',
        statement: normalized,
        title: 'Constraint added without `NOT VALID` scans entire table while locking writes',
        impact: 'Forces synchronous full-table validation under an exclusive table lock.',
        fix: 'Append `NOT VALID` so only new rows are checked immediately, then run `ALTER TABLE ... VALIDATE CONSTRAINT ...` (uses SHARE UPDATE EXCLUSIVE — non-blocking!).',
      });
      expandContractPhases.phase1Expand.push(`${normalized} NOT VALID;`);
      expandContractPhases.phase2BackfillAndDualWrite.push('Run `ALTER TABLE <table> VALIDATE CONSTRAINT <name>;` (online SHARE UPDATE EXCLUSIVE lock).');
    }

    // MIG-006: TRUNCATE or unguarded UPDATE/DELETE without WHERE
    if (/^TRUNCATE\b/i.test(normalized)) {
      findings.push({
        id: 'MIG-006',
        severity: 'HIGH',
        lockLevel: 'ACCESS EXCLUSIVE',
        statement: normalized,
        title: 'Destructive `TRUNCATE` acquires ACCESS EXCLUSIVE lock and wipes table',
        impact: 'Blocks all traffic and is non-reversible without backup restore.',
        fix: 'Avoid TRUNCATE in application migrations; archive or batch-delete with keyset predicates.',
      });
    } else if (/^(?:UPDATE|DELETE)\b/i.test(normalized) && !/\bWHERE\b/i.test(normalized)) {
      findings.push({
        id: 'MIG-006',
        severity: 'HIGH',
        lockLevel: 'FULL_TABLE_ROW_LOCKS',
        statement: normalized,
        title: 'Full-table `UPDATE`/`DELETE` without `WHERE` clause',
        impact: 'Locks every row in the table simultaneously, causes massive WAL/replication lag, and bloats dead tuples (MVCC).',
        fix: 'Run backfills/deletes outside DDL migrations in throttled primary-key batches of 1,000–5,000 rows.',
      });
    }

    // MIG-008: 32-bit INT/SERIAL primary key overflow warning
    if (/\bCREATE\s+TABLE\b/i.test(normalized) && /\b(SERIAL|INTEGER|INT)\s+PRIMARY\s+KEY\b/i.test(normalized)) {
      findings.push({
        id: 'MIG-008',
        severity: 'MEDIUM',
        lockLevel: 'NONE (Future Scale Hazard)',
        statement: normalized,
        title: '32-bit `INT`/`SERIAL` primary key overflows at 2.14 billion rows',
        impact: 'Migrating an INT PK to BIGINT on a billion-row production table is one of the hardest zero-downtime migrations in engineering.',
        fix: 'Use `BIGINT GENERATED ALWAYS AS IDENTITY` (or `BIGSERIAL` / time-ordered `UUIDv7`) from Day 1.',
      });
    }
  }

  const counts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
  for (const f of findings) counts[f.severity]++;

  const verdict =
    counts.CRITICAL > 0 ? 'BLOCK_DEPLOY' : counts.HIGH > 0 ? 'RISKY_NEEDS_EXPAND_CONTRACT' : counts.MEDIUM > 0 ? 'SAFE_WITH_WARNINGS' : 'SAFE_ZERO_DOWNTIME';

  return {
    dialect,
    statementsAnalyzed: statements.length,
    guards: {
      hasLockTimeout,
      hasStatementTimeout,
    },
    verdict,
    severityCounts: counts,
    findings,
    expandContractPlan: {
      recommendedHeader:
        dialect === 'postgres' ? "SET lock_timeout = '3s';\nSET statement_timeout = '30s';" : '-- Use ALGORITHM=INPLACE, LOCK=NONE where supported',
      phase1Expand: expandContractPhases.phase1Expand.length > 0 ? expandContractPhases.phase1Expand : ['No breaking DDL detected — safe to apply directly.'],
      phase2BackfillAndDualWrite:
        expandContractPhases.phase2BackfillAndDualWrite.length > 0
          ? expandContractPhases.phase2BackfillAndDualWrite
          : ['No dual-write or backfill phase required.'],
      phase3Contract:
        expandContractPhases.phase3Contract.length > 0
          ? expandContractPhases.phase3Contract
          : ['No destructive cleanup phase required.'],
    },
  };
}
