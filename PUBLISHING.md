# Publishing & Distribution Guide — ArchGuard MCP

This repository ships ready for distribution across **Agensi.io (Free Skill Listing)**, the **Official MCP Registry**, **Glama**, **Smithery**, **npm**, and **awesome-mcp-servers**.

---

## 1. List FREE on Agensi.io (5 Minutes)

Generate the security-clean ZIP package:

```bash
npm run package:agensi
```

This creates `dist/arch-guard-backend-verifier.zip` (clean Markdown + `references/`, zero binaries, zero secrets, folder name matches YAML `name` exactly).

Open https://www.agensi.io/sell, upload `dist/arch-guard-backend-verifier.zip`, and paste:

- **Title**: `ArchGuard — Backend Architecture Drift, Zero-Downtime SQL & Distributed Systems Verifier`
- **Price**: **Free** (drives installs, reviews, and GitHub stars with zero payout/tax friction)
- **Category**: `Backend / Architecture & DevOps`
- **Tags**: `architecture`, `sql-migrations`, `expand-contract`, `distributed-systems`, `mcp`, `code-review`, `postgres`
- **Short Summary**:
  > Stop coding agents from shipping circular dependencies, N+1 loops, missing HTTP timeouts, table-locking SQL migrations, and hallucinated QPS/quorum math. Pairs with the free hosted ArchGuard MCP (`https://arch-guard-mcp.yashwant938.workers.dev/mcp`).
- **Full Description**:
  > **ArchGuard** turns your AI coding agent (Claude Code, Cursor, Copilot, Antigravity, Codex) into a Staff-level backend reviewer backed by deterministic tooling:
  > - **Codebase Architecture Drift & Reliability Audit**: Detects circular module dependencies via Tarjan's SCC, computes Robert C. Martin coupling (`Ca/Ce/I`), generates Mermaid dependency graphs, and flags 12 production reliability/security smells (N+1 loops, missing HTTP timeouts, unbounded in-memory caches, check-then-act races, missing `Idempotency-Key` guards, SQL/command injection).
  > - **Zero-Downtime SQL Migration Guardian**: Audits PostgreSQL, MySQL, and SQLite DDL for `ACCESS EXCLUSIVE` / `SHARE` locks and rolling-deploy breaks (`CREATE INDEX` without `CONCURRENTLY`, `DROP/RENAME COLUMN`, `ADD COLUMN NOT NULL` without default, `ALTER COLUMN TYPE` rewrites, missing `lock_timeout`) and generates a 3-phase **Expand-Contract** plan.
  > - **Deterministic Distributed Systems Math**: Exact QPS, 5-year storage, ingress/egress Gbps, Redis RAM, shard bottlenecks, Little's Law concurrency, Dynamo `W+R>N` / Raft quorums, Jeff Dean fanout tail-latency amplification, and FNV-1a consistent hashing simulations.
  >
  > Works standalone via the bundled Staff-level playbooks or supercharged with the free hosted Streamable HTTP MCP endpoint (`https://arch-guard-mcp.yashwant938.workers.dev/mcp`) and open-source local stdio server (`https://github.com/yashwant938/arch-guard-mc`).

---

## 2. Publish to npm (Unlocks `npx arch-guard-mcp`)

`package.json` already includes `"mcpName": "io.github.yashwant938/arch-guard-mc"` for Official MCP Registry verification:

```bash
npm login
npm publish --access public
```

---

## 3. Publish to the Official MCP Registry

`server.json` is already configured with both your live Cloudflare Streamable HTTP remote (`https://arch-guard-mcp.yashwant938.workers.dev/mcp`) and your `npm` stdio package:

```bash
# Install official publisher CLI (https://github.com/modelcontextprotocol/registry)
mcp-publisher login github
mcp-publisher publish
```

---

## 4. Claim on Glama & Index on Smithery

- **Glama**: `glama.json` is already in the repo root (`maintainers: ["yashwant938"]`). Submit `https://github.com/yashwant938/arch-guard-mc` at https://glama.ai/mcp/servers to verify ownership and get analytics + inspection badges.
- **Smithery**: `smithery.yaml` is already in the repo root. Submit `https://github.com/yashwant938/arch-guard-mc` (or remote URL `https://arch-guard-mcp.yashwant938.workers.dev/mcp`) at https://smithery.ai.

---

## 5. Submit to `awesome-mcp-servers` (Copy-Paste Entry)

```markdown
- [yashwant938/arch-guard-mc](https://github.com/yashwant938/arch-guard-mc) - Zero-dependency MCP server (local stdio + live Cloudflare Streamable HTTP) for codebase architecture drift auditing (Tarjan SCC + 12 reliability/security rules), zero-downtime SQL Expand-Contract migration guarding, and deterministic distributed-systems capacity, quorum, tail-latency & consistent-hashing math.
```
