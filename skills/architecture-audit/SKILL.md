---
name: architecture-audit
description: >-
  Audit a codebase or pull request for architectural drift, circular module dependencies,
  coupling hotspots, and production reliability/security anti-patterns (N+1 queries in loops,
  missing HTTP timeouts, unbounded caches, check-then-act races, missing idempotency keys,
  SQL/command injection). Use when reviewing architecture, preparing for production launch,
  or refactoring a messy codebase.
---

# Architecture & Production Reliability Audit Workflow

Run deterministic static analysis with **ArchGuard MCP** instead of eyeballing large repositories.

## Step 1: Execute the Audit
- **Local repository**: Call `audit_codebase_architecture` with `{ "directoryPath": "<project-root>" }`.
- **Specific files / remote mode**: Call `audit_code_snippet` with `{ "files": [{ "path": "...", "content": "..." }] }`.

## Step 2: Triage Findings by Risk
Always resolve findings in strict priority order:
1. **CRITICAL (`SEC-001`, `SEC-002`)**: Fix SQL/command injection with parameterized queries/`execFile` arrays; remove hardcoded secrets immediately.
2. **HIGH (`ARCH-001`, `REL-001`, `REL-002`, `MEM-001`, `CONC-001`, `DATA-001`)**:
   - Break circular dependencies using **Dependency Inversion (DIP)** (extract shared contracts into a leaf module).
   - Add `AbortSignal.timeout(...)` / explicit `timeout` to every outbound HTTP call.
   - Replace awaited DB/HTTP calls inside loops with batched `WHERE id IN (...)` or bounded `Promise.all`.
   - Cap module-level `Map`/`Set` caches with an O(1) LRU limit + TTL or move to Redis.
   - Replace check-then-act balance/inventory updates with atomic conditional SQL (`UPDATE ... WHERE qty >= $1`) or `FOR UPDATE SKIP LOCKED`.
   - Require `Idempotency-Key` headers on payment/order/transfer `POST` routes.
3. **MEDIUM / LOW (`SOLID-001`, `ARCH-002`, `REL-003`, `DATA-002`)**: Split God modules, enforce layer boundaries, log/rethrow caught errors, and replace `SELECT *` with explicit projections + cursor pagination.

## Step 3: Verify Score Improvement
After applying fixes, re-run `audit_codebase_architecture` (or `audit_code_snippet`) and confirm:
- `summary.circularDependencies === 0`
- `summary.severityCounts.CRITICAL === 0`
- `summary.healthScore >= 85` (verdict: `HEALTHY`)
- Include the updated Mermaid dependency graph in the PR summary.
