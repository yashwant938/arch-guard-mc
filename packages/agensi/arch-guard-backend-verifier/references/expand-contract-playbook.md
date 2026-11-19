# Zero-Downtime SQL Migration Playbook (Expand-Contract)

## PostgreSQL Lock-Level Hazard Reference

| Rule | Dangerous Statement | Lock Acquired | Safe Zero-Downtime Replacement |
| :--- | :--- | :--- | :--- |
| **MIG-001** | `CREATE INDEX idx ON t(col);` | `SHARE` (blocks all writes) | `CREATE INDEX CONCURRENTLY idx ON t(col);` (outside `BEGIN/COMMIT`) |
| **MIG-002** | `ALTER TABLE t DROP COLUMN c;` / `RENAME COLUMN` | `ACCESS EXCLUSIVE` + breaks rolling pods | Expand-Contract: add new column → dual-write → backfill → switch reads → drop in later PR |
| **MIG-003** | `ALTER TABLE t ADD COLUMN c UUID NOT NULL;` | `ACCESS EXCLUSIVE` + breaks old pod INSERTs | Add nullable column → backfill batches → `ADD CONSTRAINT ... CHECK (c IS NOT NULL) NOT VALID` → `VALIDATE CONSTRAINT` |
| **MIG-004** | `ALTER TABLE t ALTER COLUMN c TYPE ...;` | `ACCESS EXCLUSIVE` (full table rewrite) | Add `c_v2` with target type → dual-write → throttled backfill → flip reads → drop `c` |
| **MIG-005** | `ADD CONSTRAINT fk FOREIGN KEY (...)` | `SHARE ROW EXCLUSIVE` (full scan) | Append `NOT VALID`, then execute `ALTER TABLE t VALIDATE CONSTRAINT fk;` online |
| **MIG-006** | `TRUNCATE` or `UPDATE`/`DELETE` without `WHERE` | Full table / all-row locks + WAL spike | Run batched keyset loops (1,000–5,000 rows) outside DDL migrations |
| **MIG-007** | Any PostgreSQL DDL without `lock_timeout` | Lock queue pileup blocks all reads/writes | Prefix migration with `SET lock_timeout = '3s'; SET statement_timeout = '30s';` |
| **MIG-008** | `CREATE TABLE t (id SERIAL PRIMARY KEY ...)` | Overflows at 2.14B rows | Use `BIGINT GENERATED ALWAYS AS IDENTITY` or time-ordered `UUIDv7` |

## Canonical 3-Phase Expand-Contract Sequence

1. **Phase 1 — Expand (Backward-Compatible)**: Add nullable columns, new tables, `CONCURRENTLY` indexes, and `NOT VALID` constraints. Safe while old app pods are still serving traffic.
2. **Phase 2 — Dual-Write & Throttled Backfill**: Deploy application code writing both legacy and new schema fields, backfill historical rows in 1,000–5,000 row primary-key batches, run `VALIDATE CONSTRAINT`, then flip reads to the new schema.
3. **Phase 3 — Contract (Cleanup)**: Deploy application code removing all legacy column references, wait through your rollback window, then drop legacy columns with `SET lock_timeout = '3s';`.
