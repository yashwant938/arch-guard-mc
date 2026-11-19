# ArchGuard Production Reliability & Architecture Rules Catalog

Use this reference when remediating findings reported by `audit_codebase_architecture` or `audit_code_snippet`.

| Rule ID | Severity | Smell | Production Failure Mode | Staff-Level Fix |
| :--- | :---: | :--- | :--- | :--- |
| **ARCH-001** | HIGH | Circular Module Dependency (Tarjan SCC) | Undefined module initialization order, blocked testing, tangled service extraction | Apply Dependency Inversion (DIP): extract shared types/contracts into a leaf module or communicate via events/callbacks |
| **ARCH-002** | MEDIUM | Layer Boundary Violation (`ui` → `db`) | Presentation code tightly coupled to persistence schema | Route through a domain service or API transport boundary |
| **REL-001** | HIGH | Outbound HTTP Call Without Timeout | Slow downstream hangs sockets indefinitely and exhausts thread/worker pools | Pass `signal: AbortSignal.timeout(5000)` (JS/Web) or `timeout=5.0` (Python) + bounded retries with full jitter |
| **REL-002** | HIGH | N+1 DB / Network Call Inside Loop | Turns O(1) round-trips into O(N) tail-latency amplification | Batch with `WHERE id IN (...)`, DataLoader, or chunked `Promise.all` |
| **REL-003** | MEDIUM | Empty `catch` Block | Silently drops errors and blinds observability alerts | Log structured error + correlation ID or rethrow a typed domain exception |
| **MEM-001** | HIGH | Unbounded Module-Level `Map`/`Set` Cache | Monotonic heap growth leads to OOM crash after hours/days of uptime | Enforce max cardinality with O(1) LRU eviction + TTL or externalize to Redis |
| **CONC-001** | HIGH | Check-Then-Act Race Across `await` | Concurrent checkouts oversell inventory or double-spend balances | Use conditional SQL (`UPDATE ... SET qty = qty - $1 WHERE id = $2 AND qty >= $1`), `FOR UPDATE SKIP LOCKED`, or Redis Lua |
| **DATA-001** | HIGH | Mutating Payment/Order Route Missing Idempotency | Client retries after network timeouts cause duplicate charges | Persist `Idempotency-Key` + response atomically inside the DB transaction (Stripe Recovery Point pattern) |
| **DATA-002** | LOW | Unbounded `SELECT *` Without `LIMIT` | Excess network I/O, prevents covering-index scans, risks OOM | Project explicit columns and use keyset/cursor pagination (`WHERE id > $cursor LIMIT $n`) |
| **SEC-001** | CRITICAL | SQL / OS Command Injection | Arbitrary query tampering or shell execution | Use parameterized queries (`$1`, `?`) and `execFile`/`spawn` with explicit argument arrays (`shell: false`) |
| **SEC-002** | CRITICAL / HIGH | Hardcoded Secret or `Math.random()` Token | Credential leakage in Git history; predictable session/OTP tokens | Load secrets from env/KMS; generate tokens with `crypto.randomUUID()` or `crypto.getRandomValues()` |
| **SOLID-001** | MEDIUM | God Module (>500 LOC) or God Class (>12 methods) | Violates Single Responsibility Principle; high merge contention | Decompose into cohesive domain services or Strategy/Facade collaborators |
