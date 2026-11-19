# Distributed Systems Math & Latency Verification Cheatsheet

## 1. Throughput & Little's Law
- **Seconds per day**: $86{,}400$ ($\approx 10^5$ for quick sanity checks)
- **Average QPS**: $\lambda = \frac{\text{DAU} \times \text{actions/day}}{86{,}400}$
- **Peak QPS**: $\lambda_{\text{peak}} = \lambda \times M_{\text{peak}}$ (typically $3\times$ to $5\times$)
- **Cache-Adjusted DB Read QPS**: $\lambda_{\text{db}} = \lambda_{\text{read,peak}} \times (1 - h)$ where $h$ is cache hit ratio
- **Little's Law In-Flight Concurrency**: $L = \lambda_{\text{peak}} \times W$ (where $W$ is mean latency in seconds)

## 2. Storage, Bandwidth & Sharding Bottlenecks
- **Replicated N-Year Storage**: $\text{dailyWrites} \times \text{recordBytes} \times 365 \times \text{years} \times \text{RF}$
- **Peak Bandwidth (Gbps)**: $\frac{\lambda_{\text{peak}} \times \text{payloadBytes} \times 8}{10^9}$
- **Primary Shard Count**: $\max\left(\lceil \frac{\text{peakWriteQps}}{\text{maxWriteQpsPerShard}} \rceil,\; \lceil \frac{\text{peakDbReadQps}}{\text{maxReadQpsPerShard}} \rceil,\; \lceil \frac{\text{rawStorageTB}}{\text{maxTBPerShard}} \rceil\right)$

## 3. Dynamo Quorums & Raft Consensus
- **Strong Consistency Overlap**: $W + R > N$ (still requires read-repair / versioning)
- **Split-Brain Write Safety**: $W > N/2$
- **Raft Quorum**: $\lfloor N/2 \rfloor + 1$; max crash faults tolerated $f = \lfloor (N - 1)/2 \rfloor$
- Always pick **odd cluster sizes** ($3, 5, 7$): $N=4$ tolerates the same $f=1$ crash as $N=3$ while hurting write latency.

## 4. Jeff Dean Tail-Latency Amplification ("The Tail at Scale")
- Across $K$ parallel downstream RPCs where each has slow probability $p$ (e.g., $p = 0.01$ for p99):
  $$P(\text{request hits tail}) = 1 - (1 - p)^K$$
- At $K = 100$ and $p = 0.01$, **63.4%** of end-user requests hit p99 latency.
- **Hedged Requests** (backup RPC after p95) cut independent tail probability roughly from $p$ to $p^2$, dropping $K=100$ slow requests from **63.4% → ~1.0%**.

## 5. Consistent Hashing Ring Sizing
- Scaling from $N \to N + 1$ shards moves only $\approx \frac{1}{N + 1}$ of keys (vs $\approx \frac{N}{N + 1}$ under naive `hash(k) % N`).
- Use **100–200 virtual nodes per physical shard** with a uniform avalanche hash (FNV-1a + fmix32 / Murmur3 / xxHash) to keep load standard deviation under ~5%.
