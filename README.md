# ArchGuard MCP — Architecture Drift, Zero-Downtime SQL & Distributed Systems Verifier

**Official MCP Registry (`active`):** [`io.github.yashwant938/arch-guard-mc@1.0.0`](https://registry.modelcontextprotocol.io/v0.1/servers/io.github.yashwant938%2Farch-guard-mc/versions/latest)  
**Live Remote MCP Endpoint (Streamable HTTP · Zero Auth):** `https://arch-guard-mcp.yashwant938.workers.dev/mcp`  
**Live Interactive Explorer:** https://arch-guard-mcp.yashwant938.workers.dev

**ArchGuard** is a zero-dependency **Model Context Protocol (MCP `2025-03-26`) server**, **Agent Skills suite**, and **installable Plugin** built from scratch to eliminate the three biggest blind spots of AI coding agents:

1. **Silent Architectural & Production Reliability Drift** — Coding agents introduce circular imports, N+1 DB loops, outbound HTTP calls without timeouts, unbounded in-memory `Map` caches, check-then-act race conditions, and missing idempotency keys.
2. **Table-Locking SQL Migrations** — Agents write `CREATE INDEX` (blocking writes), `DROP/RENAME COLUMN` (breaking rolling pods), `ADD COLUMN NOT NULL` without defaults, and `ALTER COLUMN TYPE` rewrites instead of safe 3-phase **Expand-Contract** migrations.
3. **Hallucinated Distributed-Systems Math** — LLMs routinely get bytes-to-TB, bits-to-Gbps, shard bottlenecks, Dynamo/Raft quorums, consistent hashing skew, and Jeff Dean fanout tail-latency amplification (`1 - (1 - p)^K`) wrong.

ArchGuard replaces guesswork with **deterministic static analysis, graph algorithms (Tarjan's SCC), mathematical proofs, and live edge simulations**.

---

## Quick Connect (Works in Antigravity, Claude Code, Cursor, Windsurf, Codex)

### Option A — Hosted Remote MCP (Instant, Zero Install)

Add to your `mcp_config.json` / `.cursor/mcp.json` / Claude MCP config:

```json
{
  "mcpServers": {
    "arch-guard": {
      "url": "https://arch-guard-mcp.yashwant938.workers.dev/mcp"
    }
  }
}
```

### Option B — Local Stdio MCP (Unlocks Full Local Repository Scanning)

```json
{
  "mcpServers": {
    "arch-guard-local": {
      "command": "node",
      "args": ["/absolute/path/to/arch-guard-mc/bin/arch-guard-mcp.mjs"]
    }
  }
}
```

### Option C — Standalone CLI / CI Gate

```bash
# Audit any codebase locally (exits 1 if CRITICAL findings exist)
node bin/cli.mjs audit .

# Guard a SQL migration before deploy
node bin/cli.mjs migrate migrations/004_orders.sql postgres

# Print deterministic capacity math for Big Tech presets
node bin/cli.mjs capacity uber
```

---

## MCP Primitives Implemented (Tools + Resources + Prompts)

### 7 Deterministic MCP Tools

| Tool | Transport | What It Computes |
| :--- | :---: | :--- |
| `audit_codebase_architecture` | Local `stdio` | Walks a repo on disk → builds multi-language import graph → runs **Tarjan's $O(V+E)$ SCC** for circular deps → computes **Robert C. Martin $C_a / C_e / I$ coupling** → runs **12 reliability/security/SOLID rules** → outputs 0–100 health score + Mermaid dependency graph |
| `audit_code_snippet` | Remote & Local | Runs the exact same Tarjan SCC + 12-rule architecture auditor on any set of files passed over Remote HTTP |
| `check_migration_safety` | Remote & Local | Audits PostgreSQL / MySQL / SQLite DDL for lock levels (`ACCESS EXCLUSIVE`, `SHARE`) and rolling-deploy breaks (`MIG-001`–`MIG-008`), generating an actionable **3-phase Expand-Contract plan** |
| `estimate_system_capacity` | Remote & Local | Exact Write/Read QPS, peak QPS, cache-adjusted DB QPS, N-year raw & replicated storage, ingress/egress Gbps, Redis RAM, dominant shard bottleneck, and **Little's Law** concurrency (`tinyurl`, `twitter`, `whatsapp`, `uber`, `youtube`, `stripe`, or custom) |
| `simulate_quorum_and_tail_latency` | Remote & Local | Proves Dynamo `W + R > N`, split-brain write safety `W > N/2`, Raft odd-cluster fault tolerance, and **Jeff Dean tail-latency amplification** $1 - (1 - p)^K$ with hedged-request comparison |
| `simulate_consistent_hashing` | Remote & Local | Real **FNV-1a 32-bit** hash ring simulation measuring exact load skew (min/max/std-dev) and key remap % on scale-out vs naive modulo hashing |
| `recommend_architecture` | Remote & Local | Maps workload traits (consistency, R/W ratio, contention, real-time need, latency SLO) to a Staff-level stack + matching Big Tech *In-The-Wild* case studies (Shopify, Slack, Figma, Meta, Stripe) |

### 4 MCP Resources (`resources/list`, `resources/read`)
- `arch-guard://cheatsheet/latency-numbers` — Jeff Dean latency ladder & powers of 2
- `arch-guard://cheatsheet/core-patterns` — 6 Core System Design Patterns Matrix
- `arch-guard://cheatsheet/expand-contract` — Zero-Downtime SQL Migration Playbook
- `arch-guard://cheatsheet/interview-rubrics` — Microsoft (L60–L65), Google, Amazon & Meta hiring rubrics

### 3 MCP Prompts (`prompts/list`, `prompts/get`)
- `staff-architecture-review` — End-to-end codebase reliability & structural review workflow
- `zero-downtime-migration-plan` — DDL safety check + 3-phase Expand-Contract rewrite
- `system-design-interview-sim` — Calibrated 45-minute Staff HLD/LLD mock interview

---

## Bundled Agent Skills & Plugin

This repository is also a ready-to-install **Agent Plugin** (`plugin.json` + `mcp_config.json` + `rules/AGENTS.md`) containing 3 progressive-disclosure skills:

- [`skills/architecture-audit/SKILL.md`](./skills/architecture-audit/SKILL.md) — Automated repo auditing, DIP cycle breaking, and reliability remediation loop
- [`skills/zero-downtime-migration/SKILL.md`](./skills/zero-downtime-migration/SKILL.md) — Enforces Expand-Contract verification before committing SQL migrations
- [`skills/distributed-capacity-check/SKILL.md`](./skills/distributed-capacity-check/SKILL.md) — Enforces exact capacity, quorum, tail-latency, and consistent-hashing math in design docs & interviews

---

## Architecture Overview

```text
arch-guard-mcp/
├── bin/
│   ├── arch-guard-mcp.mjs      # Local stdio MCP server (Node >= 20, zero deps)
│   └── cli.mjs                 # Standalone CI/developer CLI
├── src/
│   ├── engines/
│   │   ├── codebaseAuditor.mjs # Multi-lang import graph, Tarjan SCC, Ca/Ce/I, 12 smell rules
│   │   ├── fsScanner.mjs       # Local repository walker
│   │   ├── migrationGuardian.mjs # PostgreSQL/MySQL/SQLite Expand-Contract DDL guardian
│   │   ├── capacityMath.mjs    # Exact QPS, storage, bandwidth, shards & Little's Law
│   │   ├── distributedSim.mjs  # Dynamo/Raft quorum, tail latency, FNV-1a consistent hashing
│   │   └── architectureAdvisor.mjs # Staff-level blueprint advisor & cheatsheet resources
│   └── mcp/
│       └── protocol.mjs        # Transport-agnostic MCP 2025-03-26 JSON-RPC 2.0 dispatcher
├── worker/
│   └── index.mjs               # Cloudflare Workers Remote Streamable HTTP MCP (/mcp, /health, /)
├── skills/                     # 3 cross-agent progressive-disclosure SKILL.md workflows
├── rules/AGENTS.md             # Always-on plugin safety rules
├── tests/                      # Engine unit tests + stdio & HTTP end-to-end MCP tests
├── plugin.json                 # Antigravity / agent plugin manifest
└── wrangler.jsonc              # Cloudflare Workers deployment config
```

---

## Development & Verification

```bash
# Run full unit + stdio MCP + Streamable HTTP Worker tests
npm test

# Self-audit ArchGuard's own source code
npm run audit:self

# Build zero-dependency Cloudflare Worker bundle (dist/worker.mjs)
npm run build:worker

# Package Agensi-ready SKILL.md ZIP (dist/arch-guard-backend-verifier.zip)
npm run package:agensi
```

### Registry & Marketplace Metadata Included
- **Official MCP Registry**: [`server.json`](./server.json) (`io.github.yashwant938/arch-guard-mc`)
- **Glama**: [`glama.json`](./glama.json)
- **Smithery**: [`smithery.yaml`](./smithery.yaml)
- **Agensi.io Skill Package & Submission Guide**: [`packages/agensi/arch-guard-backend-verifier/`](./packages/agensi/arch-guard-backend-verifier/SKILL.md) & [`PUBLISHING.md`](./PUBLISHING.md)

Related project: [System Design Complete Guide (Interactive HLD & LLD Atlas)](https://system-design-guide.yashwant938.workers.dev)
