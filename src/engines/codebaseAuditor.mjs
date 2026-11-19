/**
 * ArchGuard Static Codebase & Architecture Drift Auditor (Runtime-agnostic ESM)
 *
 * Works identically in Node.js (local repo audits via fsScanner) and Cloudflare Workers
 * (remote multi-file snippet audits). Zero external runtime dependencies.
 *
 * Capabilities:
 *  - Multi-language import graph extraction (JS/TS/ESM/CJS, Python, Go, Java, C/C++)
 *  - Tarjan's O(V + E) Strongly Connected Components algorithm for circular dependencies
 *  - Robert C. Martin Coupling & Instability metrics (Ca, Ce, I = Ce / (Ca + Ce))
 *  - 12 production reliability, scalability, security & SOLID anti-pattern detectors
 *  - Clean Mermaid dependency graph output highlighting cycles
 */

import {
  classifyLayer,
  extractImports,
  findDependencyCycles,
  normalizePath,
  resolveInternalImport,
} from './dependencyGraph.mjs';

export { extractImports, findDependencyCycles };

const SEVERITY_WEIGHT = {
  CRITICAL: 18,
  HIGH: 10,
  MEDIUM: 5,
  LOW: 2,
};

function stripCommentsAndStringsForPattern(line) {
  return line.replace(/\/\/.*$/, '').replace(/#.*$/, '');
}

function detectFileFindings(filePath, content, options = {}) {
  const findings = [];
  const lines = content.split(/\r?\n/);
  const maxFileLines = options.maxFileLines ?? 500;
  const maxClassMethods = options.maxClassMethods ?? 12;

  const isTestFile = /(^|\/)(tests?|__tests__|spec)\/|(\.(test|spec)\.[a-z]+$)/i.test(filePath);
  if (isTestFile && !options.includeTests) {
    return findings;
  }

  // 1. SOLID-001: God File (> maxFileLines LOC)
  if (lines.length > maxFileLines) {
    findings.push({
      id: 'SOLID-001',
      category: 'Maintainability',
      severity: 'MEDIUM',
      file: filePath,
      line: 1,
      title: `God Module (${lines.length} lines > ${maxFileLines} threshold)`,
      detail: `Large files accumulate multiple responsibilities (violating Single Responsibility Principle) and create merge hotspots.`,
      remediation: 'Split into focused cohesive modules separated by domain responsibility or layer.',
    });
  }

  // 2. SOLID-001B: God Class (> maxClassMethods methods)
  const classMatches = [...content.matchAll(/\bclass\s+([A-Za-z0-9_]+)/g)];
  if (classMatches.length > 0) {
    const methodMatches = content.match(/^\s*(?:public|private|protected|async|static|\s)*[a-zA-Z_][a-zA-Z0-9_]*\s*\([^)]*\)\s*(?::\s*[^{]+)?\{/gm) || [];
    const filteredMethods = methodMatches.filter((m) => !/^\s*(if|for|while|switch|catch|constructor)\b/.test(m));
    if (filteredMethods.length > maxClassMethods * classMatches.length) {
      findings.push({
        id: 'SOLID-001',
        category: 'Maintainability',
        severity: 'MEDIUM',
        file: filePath,
        line: 1,
        title: `God Class detected (${filteredMethods.length} methods across ${classMatches.length} class${classMatches.length > 1 ? 'es' : ''})`,
        detail: `Excessive method count signals tangled responsibilities and high coupling.`,
        remediation: 'Extract collaborating Strategy, Facade, or Service classes with narrow interfaces (ISP/SRP).',
      });
    }
  }

  // 3. MEM-001: Unbounded module-level Map/Set cache without eviction
  const mapDeclRe = /^(?:export\s+)?(?:const|let|var)\s+([a-zA-Z0-9_]*(?:cache|store|memo|map|sessions|registry|buffer)[a-zA-Z0-9_]*)\s*=\s*new\s+(?:Map|Set)\s*\(/gim;
  let mm;
  while ((mm = mapDeclRe.exec(content)) !== null) {
    const varName = mm[1];
    const hasEviction = new RegExp(`\\b${varName}\\.(delete|clear)\\b|maxSize|MAX_|LRU|ttl|evict`, 'i').test(content);
    const hasGrowth = new RegExp(`\\b${varName}\\.(set|add)\\b`).test(content);
    if (hasGrowth && !hasEviction) {
      const lineNo = content.slice(0, mm.index).split(/\r?\n/).length;
      findings.push({
        id: 'MEM-001',
        category: 'Scalability',
        severity: 'HIGH',
        file: filePath,
        line: lineNo,
        title: `Unbounded in-memory collection '${varName}' without eviction`,
        detail: `Module-level Map/Set grows monotonically with traffic until the Node/Worker process crashes with OOM.`,
        remediation: 'Cap cardinality with an O(1) LRU cache + TTL (e.g., max entries check + delete oldest key) or externalize to Redis.',
      });
    }
  }

  // Track simple loop scope for N+1 detection and line-by-line reliability/security checks
  let loopBraceDepth = 0;
  let insideLoop = false;
  let braceDepth = 0;
  let inMutatingRoute = false;
  let mutatingRouteLine = 0;
  let mutatingRouteBuffer = '';

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const line = stripCommentsAndStringsForPattern(rawLine);
    const lineNo = i + 1;
    const opens = (line.match(/\{/g) || []).length;
    const closes = (line.match(/\}/g) || []).length;

    const startsLoop = /\b(for|while)\s*\(|\.(forEach|map)\s*\(\s*async\b/.test(line);
    if (startsLoop && !insideLoop) {
      insideLoop = true;
      loopBraceDepth = braceDepth;
    }

    // 4. REL-002: N+1 DB / HTTP call inside loop
    if (insideLoop) {
      const hasAwaitedIo =
        /\bawait\b[\s\S]*\b(findOne|findUnique|findFirst|findById|query|execute|select|fetch|axios\.(?:get|post|put|delete)|requests\.(?:get|post)|getUser|getItem|load)\s*\(/i.test(rawLine);
      if (hasAwaitedIo) {
        findings.push({
          id: 'REL-002',
          category: 'Scalability',
          severity: 'HIGH',
          file: filePath,
          line: lineNo,
          title: 'N+1 Database / Network I/O inside loop',
          detail: `Sequential awaited I/O inside a loop turns O(1) network round-trips into O(N) tail-latency amplification.`,
          remediation: 'Batch with SQL `WHERE id IN (...)` / DataLoader, or bound concurrency with `Promise.all` + chunking.',
        });
      }
    }

    // 5. REL-001: External HTTP call missing timeout
    const isFetchDecl = /\b(?:async\s+|function\s+)fetch\s*\(/.test(rawLine);
    const httpCallMatch = !isFetchDecl
      ? /\b(fetch|axios\.(?:get|post|put|patch|delete)|requests\.(?:get|post|put|delete))\s*\(/.exec(rawLine)
      : null;
    if (httpCallMatch) {
      const windowSlice = lines.slice(i, Math.min(lines.length, i + 6)).join('\n');
      const hasTimeout = /\b(signal|timeout|AbortSignal\.timeout|AbortController)\b/i.test(windowSlice);
      if (!hasTimeout) {
        findings.push({
          id: 'REL-001',
          category: 'Reliability',
          severity: 'HIGH',
          file: filePath,
          line: lineNo,
          title: `Outbound HTTP call (${httpCallMatch[1]}) without explicit timeout`,
          detail: 'Without an explicit timeout/AbortSignal, a degraded downstream service hangs sockets indefinitely and exhausts worker/thread pools.',
          remediation: 'Pass `signal: AbortSignal.timeout(5000)` (Node/Web) or `timeout=5.0` (Python requests) plus bounded retries with jitter.',
        });
      }
    }

    // 6. SEC-001: SQL / Shell Command Injection via interpolation
    const sqlInjection =
      /(`[^`]*(?:\bSELECT\b|\bINSERT\b|\bUPDATE\b|\bDELETE\b)[^`]*\$\{[^}]+\}[^`]*`)|((?:query|execute)\s*\(\s*['"][^'"]*(?:SELECT|INSERT|UPDATE|DELETE)[^'"]*['"]\s*\+)/i.test(
        rawLine
      );
    if (sqlInjection) {
      findings.push({
        id: 'SEC-001',
        category: 'Security',
        severity: 'CRITICAL',
        file: filePath,
        line: lineNo,
        title: 'Potential SQL Injection via string interpolation/concatenation',
        detail: 'Interpolating dynamic variables directly into SQL text allows attackers to alter query logic or exfiltrate tables.',
        remediation: 'Use parameterized prepared statements (`$1`, `?`) or typed ORM query builders.',
      });
    }

    const cmdInjection = /\b(exec|execSync)\s*\(\s*`[^`]*\$\{/.test(rawLine);
    if (cmdInjection) {
      findings.push({
        id: 'SEC-001',
        category: 'Security',
        severity: 'CRITICAL',
        file: filePath,
        line: lineNo,
        title: 'Potential OS Command Injection via shell interpolation',
        detail: 'Passing interpolated strings into a shell invocation (`exec`/`execSync`) enables arbitrary command execution.',
        remediation: 'Use `execFile`/`spawn` with an explicit argument array and `shell: false`.',
      });
    }

    // 7. SEC-002: Hardcoded secrets or Math.random() for security tokens
    const hardcodedSecret =
      /\b(api[_-]?key|jwt[_-]?secret|private[_-]?key|db[_-]?password|client[_-]?secret)\b\s*[:=]\s*['"][A-Za-z0-9_\-/+=]{12,}['"]/i.test(
        rawLine
      );
    if (hardcodedSecret && !/process\.env|import\.meta\.env|example|placeholder|dummy|test/i.test(rawLine)) {
      findings.push({
        id: 'SEC-002',
        category: 'Security',
        severity: 'CRITICAL',
        file: filePath,
        line: lineNo,
        title: 'Hardcoded secret / credential literal in source code',
        detail: 'Committed secrets leak permanently in Git history and cannot be rotated cleanly.',
        remediation: 'Move to environment variables / secret manager (KMS, Vault, Wrangler Secrets) and rotate immediately.',
      });
    }

    const weakTokenRng =
      !/\/[^/]*Math\\\.random/.test(rawLine) &&
      /[a-zA-Z0-9_]*(token|secret|session|nonce|otp|apiKey|password)[a-zA-Z0-9_]*[\s\S]{0,40}Math\.random\s*\(/i.test(line);
    if (weakTokenRng) {
      findings.push({
        id: 'SEC-002',
        category: 'Security',
        severity: 'HIGH',
        file: filePath,
        line: lineNo,
        title: 'Non-cryptographic Math.random() used for security-sensitive identifier',
        detail: 'V8 Math.random() (xorshift128+) is predictable and unsafe for tokens, sessions, or nonces.',
        remediation: 'Use `crypto.randomUUID()` or `crypto.getRandomValues()` / `crypto.randomBytes()`.',
      });
    }

    // 8. REL-003: Swallowed exception / empty catch block
    const emptyCatch = /\bcatch\s*(?:\([^)]*\))?\s*\{\s*\}/.test(rawLine);
    if (emptyCatch) {
      findings.push({
        id: 'REL-003',
        category: 'Reliability',
        severity: 'MEDIUM',
        file: filePath,
        line: lineNo,
        title: 'Silent empty catch block swallows errors',
        detail: 'Empty catch blocks hide production failures, corrupt state silently, and blind observability alerts.',
        remediation: 'Log structured error context (correlation ID, operation, error) or rethrow a typed domain error.',
      });
    }

    // 9. DATA-002: Unbounded SELECT * or OFFSET pagination at scale
    if (/\bSELECT\s+\*\s+FROM\b/i.test(rawLine) && !/\bLIMIT\b/i.test(lines.slice(i, i + 4).join(' '))) {
      findings.push({
        id: 'DATA-002',
        category: 'Scalability',
        severity: 'LOW',
        file: filePath,
        line: lineNo,
        title: 'Unbounded `SELECT *` query without LIMIT',
        detail: 'Fetching all columns & unbounded rows increases network I/O, prevents covering-index scans, and risks OOM as tables grow.',
        remediation: 'Project only needed columns and enforce cursor/keyset pagination (`WHERE id > $cursor LIMIT $n`).',
      });
    }

    // 10. DATA-001: Payment/Order/Transfer POST endpoint missing Idempotency Key
    if (/\.(post|put)\s*\(\s*['"][^'"]*(payment|charge|order|transfer|checkout|refund|withdraw)[^'"]*['"]/i.test(rawLine)) {
      inMutatingRoute = true;
      mutatingRouteLine = lineNo;
      mutatingRouteBuffer = rawLine;
    } else if (inMutatingRoute) {
      mutatingRouteBuffer += '\n' + rawLine;
      if (mutatingRouteBuffer.split('\n').length >= 18 || /^\}\);?\s*$/.test(rawLine.trim())) {
        if (!/idempotency|idempotent|dedup|dedupe|request[_-]?id/i.test(mutatingRouteBuffer)) {
          findings.push({
            id: 'DATA-001',
            category: 'Reliability',
            severity: 'HIGH',
            file: filePath,
            line: mutatingRouteLine,
            title: 'Critical mutating route missing Idempotency-Key guard',
            detail: 'Network timeouts + client retries on payment/order/transfer POST endpoints cause double-charges without an idempotency key.',
            remediation: 'Require an `Idempotency-Key` header stored atomically with the DB transaction (Stripe Recovery Point pattern).',
          });
        }
        inMutatingRoute = false;
        mutatingRouteBuffer = '';
      }
    }

    // 11. CONC-001: Check-then-act race on balance/inventory across await boundary
    if (/\b(balance|inventory|stock|seats|quota)\b.*(>=|>|<|<=)/.test(rawLine)) {
      const nearby = lines.slice(Math.max(0, i - 6), Math.min(lines.length, i + 8)).join('\n');
      const hasAwaitUpdate = /\bawait\b[\s\S]*\b(update|save|decrement|set|deduct|charge|reserve)\b/i.test(nearby);
      const hasLock = /\b(FOR UPDATE|SKIP LOCKED|transaction|mutex|lock|version|optimistic|atomic|cas|decrby|lua)\b/i.test(nearby);
      if (hasAwaitUpdate && !hasLock) {
        findings.push({
          id: 'CONC-001',
          category: 'Reliability',
          severity: 'HIGH',
          file: filePath,
          line: lineNo,
          title: 'Potential check-then-act race condition on contested resource',
          detail: 'Checking inventory/balance/quota in application code before an awaited write without locking or conditional SQL permits overselling/double-spend.',
          remediation: 'Use atomic conditional SQL (`UPDATE ... SET qty = qty - $1 WHERE id = $2 AND qty >= $1`), `FOR UPDATE SKIP LOCKED`, or Redis Lua.',
        });
      }
    }

    braceDepth += opens - closes;
    if (insideLoop && braceDepth <= loopBraceDepth && closes > 0) {
      insideLoop = false;
    }
  }

  return findings;
}

/**
 * Audit an array of `{ path, content }` files and compute full architecture health report.
 */
export function auditCodeFiles(rawFiles, options = {}) {
  const files = rawFiles.map((f) => ({
    path: normalizePath(f.path),
    content: String(f.content ?? ''),
  }));

  const fileSet = new Set(files.map((f) => f.path));
  const edgesMap = new Map();
  const inDegree = new Map();
  const findings = [];

  for (const f of files) {
    edgesMap.set(f.path, []);
    inDegree.set(f.path, 0);
  }

  // Build internal dependency graph + layer boundary checks
  for (const f of files) {
    const rawImports = extractImports(f.path, f.content);
    const resolvedTargets = new Set();
    const fromLayer = classifyLayer(f.path);

    for (const spec of rawImports) {
      const target = resolveInternalImport(f.path, spec, fileSet);
      if (target) {
        resolvedTargets.add(target);
        const toLayer = classifyLayer(target);
        // ARCH-002: Presentation layer importing persistence directly
        if (fromLayer === 'presentation' && toLayer === 'persistence') {
          findings.push({
            id: 'ARCH-002',
            category: 'Maintainability',
            severity: 'MEDIUM',
            file: f.path,
            line: 1,
            title: `Layer violation: presentation module imports persistence directly (${target})`,
            detail: 'UI/presentation code tightly coupled to database/repository modules breaks clean boundaries and testability.',
            remediation: 'Route data access through an explicit domain service or API transport boundary.',
          });
        }
      }
    }

    const targetsArr = [...resolvedTargets];
    edgesMap.set(f.path, targetsArr);
    for (const t of targetsArr) {
      inDegree.set(t, (inDegree.get(t) || 0) + 1);
    }

    // Run code smell & reliability detectors
    findings.push(...detectFileFindings(f.path, f.content, options));
  }

  // Tarjan's Strongly Connected Components for Circular Dependencies
  const nodes = files.map((f) => f.path);
  const cycles = findDependencyCycles(nodes, edgesMap);
  const cycleNodeSet = new Set();

  for (const cycle of cycles) {
    for (const n of cycle) cycleNodeSet.add(n);
    const chain = [...cycle, cycle[0]].join(' -> ');
    findings.push({
      id: 'ARCH-001',
      category: 'Maintainability',
      severity: 'HIGH',
      file: cycle[0],
      line: 1,
      title: `Circular module dependency detected (${cycle.length} modules)`,
      detail: `Cycle path: ${chain}. Circular imports cause undefined initialization order bugs, tangled testing, and blocked modular extraction.`,
      remediation: 'Apply Dependency Inversion (DIP): extract shared types/interfaces into a leaf module or invert via callback/event bus.',
    });
  }

  // Coupling & Instability Metrics (Robert C. Martin: Ca, Ce, I = Ce / (Ca + Ce))
  const moduleMetrics = files.map((f) => {
    const ca = inDegree.get(f.path) || 0;
    const ce = (edgesMap.get(f.path) || []).length;
    const instability = ca + ce === 0 ? 0 : Number((ce / (ca + ce)).toFixed(2));
    const lines = f.content.split(/\r?\n/).length;
    return { file: f.path, lines, afferentCa: ca, efferentCe: ce, instability, layer: classifyLayer(f.path) };
  });

  // Sort findings by severity
  const order = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  findings.sort((a, b) => order[a.severity] - order[b.severity] || a.file.localeCompare(b.file));

  // Score calculation (0-100)
  const penalty = findings.reduce((acc, f) => acc + (SEVERITY_WEIGHT[f.severity] || 2), 0);
  const score = Math.max(0, Math.min(100, 100 - penalty));
  const grade =
    score >= 95 ? 'A+' : score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F';

  // Build Mermaid Dependency Graph (capped to top 35 connected nodes for readability)
  const connectedNodes = moduleMetrics
    .filter((m) => m.afferentCa > 0 || m.efferentCe > 0)
    .slice(0, 35)
    .map((m) => m.file);
  const idMap = new Map(connectedNodes.map((n, idx) => [n, `M${idx}`]));
  const mermaidLines = ['graph LR'];
  for (const n of connectedNodes) {
    const label = n.split('/').slice(-2).join('/');
    mermaidLines.push(`  ${idMap.get(n)}["${label}"]`);
  }
  for (const n of connectedNodes) {
    for (const t of edgesMap.get(n) || []) {
      if (idMap.has(t)) {
        const isCycleEdge = cycleNodeSet.has(n) && cycleNodeSet.has(t);
        mermaidLines.push(isCycleEdge ? `  ${idMap.get(n)} -.->|CYCLE| ${idMap.get(t)}` : `  ${idMap.get(n)} --> ${idMap.get(t)}`);
      }
    }
  }
  if (cycleNodeSet.size > 0) {
    const cycleIds = [...cycleNodeSet].filter((n) => idMap.has(n)).map((n) => idMap.get(n));
    if (cycleIds.length > 0) {
      mermaidLines.push('  classDef cycle fill:#fee2e2,stroke:#dc2626,stroke-width:2px,color:#7f1d1d;');
      mermaidLines.push(`  class ${cycleIds.join(',')} cycle;`);
    }
  }

  const severityCounts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
  for (const f of findings) severityCounts[f.severity]++;

  const hotspots = [...moduleMetrics]
    .sort((a, b) => b.afferentCa + b.efferentCe - (a.afferentCa + a.efferentCe) || b.lines - a.lines)
    .slice(0, 8);

  return {
    summary: {
      filesScanned: files.length,
      totalLines: files.reduce((s, f) => s + f.content.split(/\r?\n/).length, 0),
      healthScore: score,
      grade,
      circularDependencies: cycles.length,
      severityCounts,
      verdict:
        severityCounts.CRITICAL > 0
          ? 'BLOCK_RELEASE'
          : severityCounts.HIGH >= 3
            ? 'NEEDS_REMEDIATION'
            : score >= 85
              ? 'HEALTHY'
              : 'REVIEW_RECOMMENDED',
    },
    cycles,
    findings,
    hotspots,
    mermaidGraph: connectedNodes.length > 0 ? mermaidLines.join('\n') : 'graph LR\n  NoInternalEdges["No internal relative module imports detected"]',
  };
}
