---
name: zero-downtime-migration
description: >-
  Review PostgreSQL, MySQL, or SQLite DDL migrations for production table locks and
  rolling-deployment breaking changes, and rewrite risky schema changes into safe
  3-phase Expand-Contract migrations. Use before writing, reviewing, or running any
  SQL schema migration.
---

# Zero-Downtime SQL Migration Workflow (Expand-Contract)

Never approve or execute destructive DDL directly against a live database without running **ArchGuard**.

## Step 1: Analyze Proposed SQL
Call `check_migration_safety` with `{ "sql": "<migration SQL>", "dialect": "postgres" | "mysql" | "sqlite" }`.

## Step 2: Enforce Deployment Gate
- **`BLOCK_DEPLOY` (`CRITICAL` findings)**: Do NOT apply as a single migration.
  - Blocking `CREATE INDEX` → rewrite to `CREATE INDEX CONCURRENTLY` outside any explicit `BEGIN`/`COMMIT` transaction.
  - `DROP COLUMN` / `RENAME COLUMN` / `ADD COLUMN NOT NULL` without `DEFAULT` → split into the **3-phase Expand-Contract plan** returned by `expandContractPlan`.
- **`RISKY_NEEDS_EXPAND_CONTRACT` (`HIGH` findings)**:
  - `ALTER COLUMN TYPE` → add `_v2` column, dual-write, batch-backfill, swap reads, then drop legacy column.
  - `ADD CONSTRAINT CHECK / FOREIGN KEY` → append `NOT VALID`, then run `VALIDATE CONSTRAINT` separately (online `SHARE UPDATE EXCLUSIVE` lock).
  - Full-table `UPDATE`/`DELETE` → move backfill out of DDL into throttled 1,000–5,000 row primary-key batches.
- **PostgreSQL Guard Header**: Always prefix DDL migrations with `SET lock_timeout = '3s';` so blocked statements fail fast instead of stalling all production reads behind a lock queue.

## Step 3: Re-verify
Re-run `check_migration_safety` on the rewritten Phase 1 (Expand) SQL and verify `verdict` is `SAFE_ZERO_DOWNTIME` before committing.
