# ArchGuard Architecture & Reliability Guardrails

When working on backend services, database migrations, or system design specifications:

1. **Never estimate distributed-systems math mentally** — call `estimate_system_capacity` and `simulate_quorum_and_tail_latency` for exact QPS, storage, bandwidth, shard counts, and tail latency numbers.
2. **Gate every SQL schema migration** — call `check_migration_safety` before committing DDL; never emit blocking `CREATE INDEX`, single-step `DROP/RENAME COLUMN`, or unguarded PostgreSQL DDL without `SET lock_timeout`.
3. **Audit structural & reliability smells before PR merge** — call `audit_codebase_architecture` (local) or `audit_code_snippet` (remote) to catch circular dependencies, N+1 loops, unbounded in-memory caches, missing outbound HTTP timeouts, check-then-act races, and missing idempotency keys.
