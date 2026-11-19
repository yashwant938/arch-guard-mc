/**
 * ArchGuard Staff-Level Architecture Advisor & Reference Knowledge Base (Pure ESM)
 *
 * Deterministic workload-to-architecture decision engine + curated Staff-level
 * cheatsheets, Big Tech In-The-Wild blueprints, and hiring rubrics.
 */

export const CHEATSHEET_RESOURCES = {
  'arch-guard://cheatsheet/latency-numbers': {
    name: 'Jeff Dean Latency Numbers & Powers of 2',
    mimeType: 'text/markdown',
    content: `# Latency Numbers Every Staff Engineer Should Know

| Operation | Typical Latency | Notes |
| :--- | :---: | :--- |
| L1 cache reference | 1 ns | CPU core local |
| Branch mispredict / L2 cache | 3–4 ns | Pipeline flush |
| Mutex lock / unlock (uncontended) | 15–25 ns | Futex fast-path |
| Main memory (RAM) reference | 100 ns | ~100x slower than L1 |
| NVMe SSD 4KB random read | 16–50 µs | Modern cloud GP3/io2 |
| Same-datacenter network round trip | 0.5 ms | 500 µs inside one AZ |
| Cross-AZ same-region RTT | 1–2 ms | Synchronous replication sweet spot |
| Redis GET (same AZ) | 0.5–1 ms | In-memory single-threaded event loop |
| Postgres indexed PK lookup | 1–5 ms | Hot buffer pool |
| Packet US-East ↔ EU-West | 75–85 ms | Speed-of-light fiber floor |
| Packet US-West ↔ APAC | 150–200 ms | Requires CDN / Edge PoPs |

## Powers of 2 & Time Constants
- $2^{10}$ = 1 KB · $2^{20}$ = 1 MB · $2^{30}$ = 1 GB · $2^{40}$ = 1 TB · $2^{50}$ = 1 PB
- 1 day = **86,400 s** (~$10^5$ s for mental napkin math) · 1 year ≈ **31.5M s**
- 1M requests/day ≈ **12 QPS** · 100M requests/day ≈ **1,157 QPS**
`,
  },
  'arch-guard://cheatsheet/core-patterns': {
    name: '6 Core System Design Patterns Matrix',
    mimeType: 'text/markdown',
    content: `# 6 Core System Design Patterns Matrix

| Core Challenge | Primary Pattern | Production Building Blocks | Key Pitfall to Avoid |
| :--- | :--- | :--- | :--- |
| **1. Real-Time Updates** | Push over persistent connection | SSE (1-way), WebSockets (2-way), WebRTC (media), Redis Pub/Sub / Kafka fanout | Unbounded fanout on celebrity rooms → use 2-tier fanout tree |
| **2. Scaling Reads** | Multi-tier caching + Read Replicas | CDN Edge → Redis/Memcached → Read Replicas → CQRS denormalized projections | Cache Stampede (Thundering Herd) → use Single-Flight Mutex / Memcached Leases |
| **3. Scaling Writes** | Partitioning + Async Ingestion | Consistent Hashing shards, LSM-Tree (Cassandra/ScyllaDB), Kafka write-behind buffer | Hot partition key (celebrity/SKU) → key salting (\`key#0..N\`) + scatter-gather |
| **4. High Contention** | Serialize narrowly + Lease TTL | MySQL/PG \`FOR UPDATE SKIP LOCKED\`, Redis Lua atomic script, PostgreSQL GiST exclusion | Holding DB locks across external payment HTTP calls → reserve with TTL first! |
| **5. Long-Running Tasks** | Async Job Queue + Idempotent Workers | Kafka/SQS + Dead-Letter Queue (DLQ), Lease Heartbeats, Exponential Backoff + Full Jitter | Poison pills crashing worker pools infinitely → enforce maxAttempts + DLQ |
| **6. Multi-Step Workflows** | Transactional Outbox + Saga | Outbox table + Debezium CDC → Kafka → Orchestrated Saga with compensating txns | Dual-write bug (DB commits, Kafka fails) → write event inside same DB transaction |
`,
  },
  'arch-guard://cheatsheet/expand-contract': {
    name: 'Zero-Downtime Database Migration Playbook (Expand-Contract)',
    mimeType: 'text/markdown',
    content: `# Zero-Downtime Database Migration Playbook (Expand-Contract)

## Golden Rules
1. Always set \`SET lock_timeout = '3s';\` in PostgreSQL so a blocked DDL fails fast instead of queuing all production queries.
2. Always build indexes online: \`CREATE INDEX CONCURRENTLY\` (PG) or \`ALGORITHM=INPLACE, LOCK=NONE\` (MySQL).
3. Never add a \`CHECK\` or \`FOREIGN KEY\` constraint directly on large tables — use \`ADD CONSTRAINT ... NOT VALID\` followed by \`VALIDATE CONSTRAINT\`.
4. Never rename or drop a column in a single release while old pods are still running.

## The 3-Phase Expand-Contract Lifecycle
- **Phase 1 — Expand**: Add new nullable column / new table / concurrent index. Completely backward-compatible with old code.
- **Phase 2 — Dual-Write & Backfill**: Deploy app dual-writing old + new fields; backfill historical rows in throttled batches of 1,000–5,000 rows; flip reads to new column; validate constraints online.
- **Phase 3 — Contract**: Deploy app removing references to old column; wait for rollback window; drop legacy column/table cleanly.
`,
  },
  'arch-guard://cheatsheet/interview-rubrics': {
    name: 'Big Tech Staff/Senior System Design Rubrics (Microsoft, Google, Amazon, Meta)',
    mimeType: 'text/markdown',
    content: `# Big Tech System Design Hiring Rubrics

## Microsoft (L60–L65 / Senior & Principal)
- Strong emphasis on **multi-tenant enterprise isolation**, **KMS envelope encryption**, **Azure-style cell/stamp architecture**, **graceful degradation**, and clean **LLD/SOLID maintainability**.
- Principal (L65) bar: explicitly quantifies blast radius, cost-per-request, migration path from monolith/legacy, and org ownership boundaries.

## Google (L4–L6)
- Deep focus on **scale math**, **tail latency (p99/hedged RPCs)**, **storage engine internals (B+ Tree vs LSM-Tree)**, **consistency models (Spanner/TrueTime, Raft)**, and eliminating single points of failure.

## Amazon (SDE2 L5 / SDE3 L6)
- Heavy emphasis on **operational excellence**: alarms, SLO error budgets, backpressure, circuit breakers, DLQs, idempotency, cell-based blast-radius isolation, and **exact failure-mode walk-throughs**.

## Meta (E4–E6)
- Product-architecture & infrastructure speed: **fanout trade-offs (push vs pull vs hybrid)**, **Memcached Leases / thundering herd**, **hot-key mitigation**, **real-time SSE/WebSockets**, and crisp end-to-end API + schema modeling.
`,
  },
};

const IN_THE_WILD_CASE_STUDIES = {
  shopify: {
    company: 'Shopify',
    title: 'Inventory Reservations at Flash-Sale Scale (Redis → MySQL 8 SKIP LOCKED)',
    corePattern: 'High Contention / Lock-Free Queue Pooling',
    architecture: 'Sharded MySQL 8 with pooled inventory buckets (`quantity` split across K rows) queried via `SELECT ... FOR UPDATE SKIP LOCKED` + ProxySQL connection multiplexing.',
    keyTakeaway: 'Moved off Redis back to MySQL 8 to gain ACID durability with orders while eliminating row-lock contention via SKIP LOCKED and bucket sharding.',
  },
  slack: {
    company: 'Slack',
    title: 'Durable Job Queue Scaling with Kafka + JQRelay',
    corePattern: 'Scaling Writes / Long-Running Tasks',
    architecture: 'Web tier writes jobs to Redis (fast) AND Kafka (durable); `JQRelay` tails Kafka to recover lost Redis shards automatically without dropping notifications.',
    keyTakeaway: 'Pairs Redis sub-millisecond priority pop semantics with Kafka immutable durability to survive sudden Redis cluster failover.',
  },
  figma: {
    company: 'Figma',
    title: 'Real-Time Multiplayer Collaboration (Simplified CRDT + Fractional Indexing)',
    corePattern: 'Real-Time Updates / Conflict-Free State Convergence',
    architecture: 'Authoritative C++ server per document using Last-Write-Wins property map CRDTs + Fractional Indexing for O(1) sibling reordering without renumbering arrays.',
    keyTakeaway: 'You do not need full decentralized OT/CRDT complexity when a single authoritative document server defines total order.',
  },
  meta: {
    company: 'Meta',
    title: 'Memcached Leases & ZGateway Connection Multiplexing',
    corePattern: 'Scaling Reads / Thundering Herd Prevention',
    architecture: 'Memcached issues 64-bit Lease tokens on cache miss so only 1 client hits the DB while peers back off; stale-set prevention rejects outdated writes after delete.',
    keyTakeaway: 'Leases simultaneously solve BOTH thundering herd (cache stampede) and stale-set race conditions in look-aside caching.',
  },
  stripe: {
    company: 'Stripe',
    title: 'Atomic Idempotency Keys & Recovery Points',
    corePattern: 'Multi-Step Workflows / Exactly-Once Financial Effects',
    architecture: 'Stores `Idempotency-Key` + request parameter hash + serialized response + explicit recovery-point state machine inside the same ACID database transaction.',
    keyTakeaway: 'Prevents double-charges across network timeouts while safely resuming half-completed payment workflows.',
  },
};

export function recommendArchitecture(requirements = {}) {
  const consistency = (requirements.consistency || 'strong').toLowerCase();
  const profile = (requirements.readWriteProfile || 'read-heavy').toLowerCase();
  const scaleTier = (requirements.scaleTier || 'high').toLowerCase();
  const dataModel = (requirements.dataModel || 'relational').toLowerCase();
  const contention = (requirements.contentionLevel || 'medium').toLowerCase();
  const realtime = (requirements.realtimeNeed || 'none').toLowerCase();
  const latencySloMs = Number(requirements.latencySloMs ?? 100);

  const primaryDatabase =
    dataModel === 'timeseries'
      ? 'ClickHouse / TimescaleDB (columnar compressed partitions with TTL retention)'
      : dataModel === 'search'
        ? 'PostgreSQL / DynamoDB as Source of Truth + Elasticsearch / OpenSearch synced via Transactional Outbox + CDC'
        : dataModel === 'graph'
          ? 'TAO-style sharded MySQL/Postgres adjacency tables (with Redis cache) or Neo4j for deep multi-hop traversals'
          : consistency === 'strong' || dataModel === 'relational'
            ? scaleTier === 'global'
              ? 'CockroachDB / Google Spanner or horizontally sharded PostgreSQL (Citus/Vitess) with Raft replication'
              : 'PostgreSQL 16+ (Primary + Streaming Read Replicas, BIGINT/UUIDv7 keys, PgBouncer transaction pooling)'
            : profile === 'write-heavy'
              ? 'ScyllaDB / Apache Cassandra (LSM-Tree append-only writes, tunable quorum W+R>N)'
              : 'Amazon DynamoDB / MongoDB sharded cluster with single-table access patterns';

  const cachingStrategy =
    profile === 'read-heavy' || latencySloMs <= 50
      ? 'Multi-tier: CDN Edge (Cloudflare/CloudFront) + Redis Cluster (Look-Aside + Single-Flight Mutex / Lease tokens to prevent cache stampede + TTL jitter)'
      : 'Targeted Redis cache only for hot metadata / rate limits / idempotency keys (avoid caching rapidly mutated rows)';

  const contentionControl =
    contention === 'extreme' || contention === 'high'
      ? 'Avoid long DB locks: use bucket-sharded rows + `FOR UPDATE SKIP LOCKED` (Shopify pattern) or single-threaded Redis Lua atomic decrements with TTL reservation leases.'
      : 'Optimistic Concurrency Control (`WHERE id = $1 AND version = $2`) with bounded exponential backoff + full jitter.';

  const messagingLayer =
    profile === 'write-heavy' || scaleTier === 'high' || scaleTier === 'global'
      ? 'Apache Kafka (partitioned by entity key for ordering, ISR >= 2, Transactional Outbox + Debezium CDC for atomic DB+event writes, DLQ for poison pills)'
      : 'Managed Queue (SQS / Cloudflare Queues / RabbitMQ) with visibility timeout + Dead-Letter Queue';

  const realtimeTransport =
    realtime === 'bidirectional'
      ? 'WebSockets behind L7 Gateway with Redis Pub/Sub / Kafka fanout and heartbeat reconnect with jitter'
      : realtime === 'one-way'
        ? 'Server-Sent Events (SSE) over HTTP/2 + 2-tier fanout tree for high-fanout rooms (FB Live pattern)'
        : realtime === 'media'
          ? 'WebRTC with cascaded SFU (Selective Forwarding Unit) + Simulcast video layers'
          : 'Standard REST / HTTP/3 or gRPC (Protobuf) for internal service-to-service RPCs';

  const matchedCaseStudies = [];
  if (contention === 'high' || contention === 'extreme') matchedCaseStudies.push(IN_THE_WILD_CASE_STUDIES.shopify);
  if (profile === 'read-heavy') matchedCaseStudies.push(IN_THE_WILD_CASE_STUDIES.meta);
  if (realtime === 'bidirectional') matchedCaseStudies.push(IN_THE_WILD_CASE_STUDIES.figma);
  if (consistency === 'strong') matchedCaseStudies.push(IN_THE_WILD_CASE_STUDIES.stripe);
  if (profile === 'write-heavy') matchedCaseStudies.push(IN_THE_WILD_CASE_STUDIES.slack);

  return {
    inputProfile: { consistency, profile, scaleTier, dataModel, contention, realtime, latencySloMs },
    blueprint: {
      primaryDatabase,
      cachingStrategy,
      contentionControl,
      messagingLayer,
      realtimeTransport,
      reliabilityGuardrails: [
        `Enforce strict outbound timeouts (< ${Math.max(200, Math.round(latencySloMs * 2))}ms) + circuit breakers + hedged requests for high-fanout reads.`,
        'Require `Idempotency-Key` headers on all state-mutating POST/PUT endpoints.',
        'Use Expand-Contract 3-phase migrations with `lock_timeout` for every schema change.',
        'Instrument RED metrics (Rate, Errors, Duration p50/p95/p99) + OpenTelemetry distributed traces.',
      ],
    },
    relevantBigTechCaseStudies: matchedCaseStudies.length > 0 ? matchedCaseStudies : [IN_THE_WILD_CASE_STUDIES.stripe, IN_THE_WILD_CASE_STUDIES.meta],
  };
}
