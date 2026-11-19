---
name: distributed-capacity-check
description: >-
  Compute exact back-of-the-envelope distributed systems capacity math (QPS, storage TB,
  bandwidth Gbps, cache RAM, shard counts, Little's Law), Dynamo/Raft quorums, fanout
  tail-latency amplification, consistent hashing skew, and Staff-level architecture
  recommendations. Use whenever designing a system, writing an RFC/HLD, or practicing
  Big Tech system design interviews.
---

# Deterministic Distributed Systems Verification Workflow

LLMs routinely miscalculate bytes-to-TB, bits-to-Gbps, shard counts, and fanout tail latency. Always compute exact figures via **ArchGuard MCP**.

## Step 1: Exact Capacity & Bottleneck Math
Call `estimate_system_capacity` with either a Big Tech `preset` (`tinyurl`, `twitter`, `whatsapp`, `uber`, `youtube`, `stripe`) or custom `dau`, `writesPerUserPerDay`, `readWriteRatio`, `avgWriteBytes`, `retentionYears`, and `cacheHitRatio`.
- Report the exact `whiteboardSummary` and explicitly state the `primaryBottleneck` (Write-QPS-bound vs Read-QPS-bound vs Storage-bound).

## Step 2: Quorum & Tail Latency Verification
When designing replicated storage or fanout microservices, call `simulate_quorum_and_tail_latency`:
- Verify `strongConsistencyOverlap` (`W + R > N`) and `optimalOddCluster` for Raft/Paxos.
- For fanout services (`K >= 10`), quote `endToEndSlowRequestPercent` (`1 - (1 - p)^K`) and compare against `withHedgedRequestsSlowPercent`.

## Step 3: Partitioning & Architecture Blueprint
- Call `simulate_consistent_hashing` when sizing sharded caches/DBs to prove why 100–200 virtual nodes minimize load skew and cache churn.
- Call `recommend_architecture` with concrete workload traits to cross-check database, caching, contention, CDC/messaging, and real-time transport choices.
- Reference `arch-guard://cheatsheet/core-patterns` and `arch-guard://cheatsheet/interview-rubrics` resources when calibrating for Microsoft, Google, Amazon, or Meta bars.
