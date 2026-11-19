---
name: arch-guard-backend-verifier
description: >-
  Audits backend codebases for architectural drift and production reliability anti-patterns
  (circular dependencies, N+1 loops, missing HTTP timeouts, unbounded caches, check-then-act
  races, missing idempotency keys), validates PostgreSQL/MySQL/SQLite SQL migrations for
  zero-downtime Expand-Contract safety, and verifies distributed-systems capacity, quorum,
  tail-latency, and consistent-hashing math using ArchGuard MCP. Use when reviewing backend
  architecture, writing or auditing SQL DDL migrations, preparing services for production,
  or designing scalable distributed systems.
version: "1.0.0"
category: backend-architecture
tags:
  - architecture
  - sql-migrations
  - expand-contract
  - distributed-systems
  - mcp
  - reliability
---

# ArchGuard Backend Architecture & Reliability Verifier

Follow this structured Staff-level verification workflow whenever auditing backend services, reviewing database migrations, or drafting distributed system designs.

## Connecting the ArchGuard MCP Server (Optional Supercharge)

If the **ArchGuard MCP** tools are available in your toolset, call them directly for deterministic static analysis, graph cycle detection (Tarjan's SCC), DDL lock verification, and exact capacity math.

To connect the free hosted Streamable HTTP endpoint (zero auth, zero install):

```json
{
  "mcpServers": {
    "arch-guard": {
      "url": "https://arch-guard-mcp.yashwant938.workers.dev/mcp"
    }
  }
}
```

For full local repository scanning (`audit_codebase_architecture`), clone `https://github.com/yashwant938/arch-guard-mc` and run `node bin/arch-guard-mcp.mjs` over stdio. If the MCP server is not connected, apply the manual rules in the bundled `references/` guides below.

---

## Workflow 1: Codebase Architecture & Production Reliability Audit

1. **Run deterministic analysis**:
   - Local stdio MCP: call `audit_codebase_architecture({ directoryPath })`.
   - Remote HTTP MCP: call `audit_code_snippet({ files: [{ path, content }, ...] })`.
2. **Triage by severity** (see [reliability-rules-catalog.md](./references/reliability-rules-catalog.md) for exact before/after remediation patterns):
   - **CRITICAL (`SEC-001`, `SEC-002`)**: Replace interpolated SQL with parameterized queries, replace shell string interpolation with argument arrays, and remove hardcoded secrets.
   - **HIGH (`ARCH-001`, `REL-001`, `REL-002`, `MEM-001`, `CONC-001`, `DATA-001`)**: Break circular dependencies with Dependency Inversion (leaf interface modules), add explicit HTTP timeouts (`AbortSignal.timeout`), eliminate N+1 awaited queries inside loops, cap in-memory `Map`/`Set` caches with LRU+TTL, guard contested balance/inventory writes with atomic SQL or `FOR UPDATE SKIP LOCKED`, and enforce `Idempotency-Key` headers on payment/order mutations.
   - **MEDIUM / LOW (`SOLID-001`, `ARCH-002`, `REL-003`, `DATA-002`)**: Split God modules, enforce clean layer boundaries, log/rethrow caught errors, and replace `SELECT *` with explicit projections and keyset pagination.
3. **Verify**: Re-run the audit after fixes and confirm `circularDependencies === 0`, `CRITICAL === 0`, and `healthScore >= 85`. Include the Mermaid dependency graph in the review summary.

---

## Workflow 2: Zero-Downtime SQL Migration Gate (Expand-Contract)

1. **Analyze every DDL migration before commit**:
   - Call `check_migration_safety({ sql, dialect })` (`postgres`, `mysql`, or `sqlite`).
2. **Enforce zero-downtime rules** (see [expand-contract-playbook.md](./references/expand-contract-playbook.md)):
   - Always guard PostgreSQL DDL with `SET lock_timeout = '3s';` so a blocked migration fails fast rather than queuing all production traffic.
   - Rewrite blocking `CREATE INDEX` to `CREATE INDEX CONCURRENTLY` (outside an explicit transaction block) or MySQL `ALGORITHM=INPLACE, LOCK=NONE`.
   - Never apply `DROP COLUMN`, `RENAME COLUMN`, `ALTER COLUMN TYPE`, or `ADD COLUMN NOT NULL` (without default) in one deployment; split into **Phase 1 (Expand) → Phase 2 (Dual-Write & Batch Backfill) → Phase 3 (Contract)**.
   - Add `CHECK` and `FOREIGN KEY` constraints with `NOT VALID` first, then run `VALIDATE CONSTRAINT` online.
3. **Verify**: Re-run `check_migration_safety` on the rewritten Phase 1 SQL and confirm `verdict === "SAFE_ZERO_DOWNTIME"`.

---

## Workflow 3: Deterministic Distributed Systems & Capacity Math

Never estimate QPS, storage TB, bandwidth Gbps, quorum overlap, or fanout tail latency mentally (see [distributed-math-cheatsheet.md](./references/distributed-math-cheatsheet.md)):

1. **Capacity & Bottleneck Sizing**: Call `estimate_system_capacity` (supports presets `tinyurl`, `twitter`, `whatsapp`, `uber`, `youtube`, `stripe`, or custom `dau`, `writesPerUserPerDay`, `readWriteRatio`, `avgWriteBytes`, `retentionYears`, `cacheHitRatio`). Always report the dominant sharding bottleneck (Write-QPS, Cache-Miss Read-QPS, or Storage) and Little's Law peak concurrency.
2. **Quorum & Tail Latency**: Call `simulate_quorum_and_tail_latency` to prove Dynamo `W + R > N`, Raft odd-cluster fault tolerance, and Jeff Dean fanout tail amplification (`1 - (1 - p)^K`) with hedged-RPC improvement.
3. **Partitioning & Stack Blueprint**: Call `simulate_consistent_hashing` to quantify shard skew vs virtual nodes, and `recommend_architecture` to validate DB, caching, contention control, CDC/messaging, and real-time transport trade-offs.
