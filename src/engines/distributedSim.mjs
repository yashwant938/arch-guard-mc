/**
 * ArchGuard Distributed Systems Quorum, Tail-Latency & Consistent Hashing Simulator (Pure ESM)
 *
 * Deterministic mathematical proofs + real FNV-1a 32-bit hash ring simulation.
 */

function roundSim(val, digits = 2) {
  const f = 10 ** digits;
  return Math.round(val * f) / f;
}

/**
 * Analyze Dynamo Quorum (N, W, R), Raft Consensus fault tolerance,
 * and Jeff Dean's "The Tail at Scale" fanout latency amplification.
 */
export function simulateQuorumAndTailLatency(input = {}) {
  const n = Math.max(1, Math.floor(Number(input.replicationFactor ?? input.n ?? 3)));
  const w = Math.max(1, Math.min(n, Math.floor(Number(input.writeQuorum ?? input.w ?? Math.floor(n / 2) + 1))));
  const r = Math.max(1, Math.min(n, Math.floor(Number(input.readQuorum ?? input.r ?? Math.floor(n / 2) + 1))));
  const fanout = Math.max(1, Math.floor(Number(input.fanoutCount ?? 20)));
  const singleNodeP99Prob = Math.min(0.5, Math.max(0.0001, Number(input.singleNodeSlowProbability ?? 0.01)));
  const singleNodeP50Ms = Number(input.singleNodeP50Ms ?? 12);
  const singleNodeP99Ms = Number(input.singleNodeP99Ms ?? 180);

  // Dynamo Quorum Proofs
  const strongConsistencyGuaranteed = w + r > n;
  const splitBrainProtected = w > n / 2;
  const writeFaultTolerance = n - w;
  const readFaultTolerance = n - r;

  // Raft / Paxos Consensus Math
  const raftMajority = Math.floor(n / 2) + 1;
  const raftMaxCrashFaults = Math.floor((n - 1) / 2);
  const raftEvenClusterWarning =
    n > 1 && n % 2 === 0
      ? `Cluster size N=${n} is EVEN: it tolerates only f=${raftMaxCrashFaults} crash fault(s) — identical to N=${n - 1}, while increasing write quorum latency to ${raftMajority} nodes! Always use odd cluster sizes (3, 5, 7).`
      : null;

  // Jeff Dean Tail-Latency Amplification: P(at least 1 slow RPC) = 1 - (1 - p)^K
  const fanoutSlowProbability = 1 - (1 - singleNodeP99Prob) ** fanout;
  // Hedged Request approximation: issuing a backup RPC after p95 cuts independent slow probability roughly to p^2 (ignoring correlated faults)
  const hedgedSingleNodeProb = singleNodeP99Prob ** 2;
  const hedgedFanoutSlowProbability = 1 - (1 - hedgedSingleNodeProb) ** fanout;

  const warnings = [];
  if (!strongConsistencyGuaranteed) {
    warnings.push(`STALE READS POSSIBLE: W(${w}) + R(${r}) = ${w + r} <= N(${n}). Increase W or R so W + R > N for linearizable overlap (note: still requires read-repair / LWW or vector clocks).`);
  }
  if (!splitBrainProtected) {
    warnings.push(`CONCURRENT WRITE CONFLICT RISK: W(${w}) <= N/2 (${n / 2}). Two simultaneous writes can succeed on disjoint replica subsets.`);
  }
  if (raftEvenClusterWarning) warnings.push(raftEvenClusterWarning);
  if (fanoutSlowProbability >= 0.2) {
    warnings.push(
      `SEVERE TAIL AMPLIFICATION: With fanout K=${fanout} and per-node slow rate ${roundSim(singleNodeP99Prob * 100, 2)}%, ${roundSim(fanoutSlowProbability * 100, 1)}% of end-user requests hit >= ${singleNodeP99Ms}ms latency! Enable hedged requests (cuts to ~${roundSim(hedgedFanoutSlowProbability * 100, 2)}%), request coalescing, or bounded deadlines.`
    );
  }

  return {
    dynamoQuorum: {
      N: n,
      W: w,
      R: r,
      sumWR: w + r,
      strongConsistencyOverlap: strongConsistencyGuaranteed,
      splitBrainWriteSafe: splitBrainProtected,
      toleratedFailedNodesForWrites: writeFaultTolerance,
      toleratedFailedNodesForReads: readFaultTolerance,
      profile:
        w === 1 && r === n
          ? 'Fast Writes / Slow Reads'
          : w === n && r === 1
            ? 'Fast Reads / Fragile Writes (0 write fault tolerance)'
            : strongConsistencyGuaranteed
              ? 'Balanced Quorum Consistency'
              : 'Eventual Consistency (AP-leaning)',
    },
    raftConsensus: {
      clusterSize: n,
      quorumSize: raftMajority,
      maxCrashFaultsTolerated: raftMaxCrashFaults,
      optimalOddCluster: n % 2 === 1,
      note: raftEvenClusterWarning || `Optimal odd quorum: tolerates ${raftMaxCrashFaults} node failure(s) while maintaining linearizable consensus.`,
    },
    tailLatencyAmplification: {
      fanoutRpcs: fanout,
      singleNodeP50Ms,
      singleNodeP99Ms,
      singleNodeSlowRatePercent: roundSim(singleNodeP99Prob * 100, 3),
      endToEndSlowRequestPercent: roundSim(fanoutSlowProbability * 100, 2),
      withHedgedRequestsSlowPercent: roundSim(hedgedFanoutSlowProbability * 100, 3),
      amplificationFactor: roundSim(fanoutSlowProbability / singleNodeP99Prob, 2),
    },
    warnings,
  };
}

/**
 * Deterministic FNV-1a 32-bit hash with Murmur3 fmix32 finalizer for uniform ring avalanche.
 */
function fnv1a32(str) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b) >>> 0;
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xc2b2ae35) >>> 0;
  hash ^= hash >>> 16;
  return hash >>> 0;
}

function buildRing(nodeNames, virtualNodes) {
  const ring = [];
  for (const node of nodeNames) {
    for (let v = 0; v < virtualNodes; v++) {
      ring.push({ hash: fnv1a32(`${node}#vn-${v}`), node });
    }
  }
  ring.sort((a, b) => a.hash - b.hash);
  return ring;
}

function lookupRing(ring, keyHash) {
  let lo = 0;
  let hi = ring.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    if (ring[mid].hash >= keyHash) hi = mid - 1;
    else lo = mid + 1;
  }
  return ring[lo < ring.length ? lo : 0].node;
}

/**
 * Simulate real consistent hashing ring load distribution & key remapping vs modulo hashing.
 */
export function simulateConsistentHashing(input = {}) {
  const nodeCount = Math.max(2, Math.min(64, Math.floor(Number(input.nodeCount ?? 4))));
  const virtualNodes = Math.max(1, Math.min(500, Math.floor(Number(input.virtualNodes ?? 150))));
  const sampleKeys = Math.max(500, Math.min(20_000, Math.floor(Number(input.sampleKeys ?? 5_000))));

  const initialNodes = Array.from({ length: nodeCount }, (_, i) => `shard-${i + 1}`);
  const expandedNodes = [...initialNodes, `shard-${nodeCount + 1}`];

  const ringBefore = buildRing(initialNodes, virtualNodes);
  const ringAfter = buildRing(expandedNodes, virtualNodes);

  const counts = Object.fromEntries(initialNodes.map((n) => [n, 0]));
  let ringMoved = 0;
  let moduloMoved = 0;

  for (let i = 0; i < sampleKeys; i++) {
    const keyHash = fnv1a32(`user-session-key:${i}`);
    const ownerBefore = lookupRing(ringBefore, keyHash);
    const ownerAfter = lookupRing(ringAfter, keyHash);
    counts[ownerBefore]++;
    if (ownerBefore !== ownerAfter) ringMoved++;

    const modBefore = keyHash % nodeCount;
    const modAfter = keyHash % (nodeCount + 1);
    if (modBefore !== modAfter) moduloMoved++;
  }

  const shares = initialNodes.map((node) => ({
    node,
    keys: counts[node],
    sharePercent: roundSim((counts[node] / sampleKeys) * 100, 2),
  }));

  const idealShare = 100 / nodeCount;
  const maxShare = Math.max(...shares.map((s) => s.sharePercent));
  const minShare = Math.min(...shares.map((s) => s.sharePercent));
  const variance = shares.reduce((acc, s) => acc + (s.sharePercent - idealShare) ** 2, 0) / nodeCount;
  const stdDevPercent = roundSim(Math.sqrt(variance), 2);

  const ringRemapPercent = roundSim((ringMoved / sampleKeys) * 100, 2);
  const theoreticalIdealRemapPercent = roundSim((1 / (nodeCount + 1)) * 100, 2);
  const moduloRemapPercent = roundSim((moduloMoved / sampleKeys) * 100, 2);

  return {
    config: {
      nodeCount,
      virtualNodesPerPhysicalNode: virtualNodes,
      totalRingPoints: nodeCount * virtualNodes,
      sampleKeys,
    },
    loadDistribution: {
      idealSharePercent: roundSim(idealShare, 2),
      minSharePercent: minShare,
      maxSharePercent: maxShare,
      skewRatioMaxToMin: roundSim(maxShare / Math.max(0.01, minShare), 2),
      stdDevPercent,
      perNode: shares,
    },
    scaleOutComparison: {
      scenario: `Adding 1 node (${nodeCount} -> ${nodeCount + 1})`,
      consistentHashingMovedPercent: ringRemapPercent,
      theoreticalOptimalPercent: theoreticalIdealRemapPercent,
      naiveModuloHashMovedPercent: moduloRemapPercent,
      cacheChurnSavedPercent: roundSim(moduloRemapPercent - ringRemapPercent, 2),
    },
    recommendation:
      virtualNodes < 50
        ? `Skew ratio is ${roundSim(maxShare / Math.max(0.01, minShare), 2)}x with only ${virtualNodes} vNodes. Increase virtualNodes to 100-200 to keep per-shard skew under ~10%.`
        : `Well-balanced ring (${virtualNodes} vNodes, std-dev ${stdDevPercent}%). Scaling from ${nodeCount} to ${nodeCount + 1} nodes remaps only ${ringRemapPercent}% of keys vs ${moduloRemapPercent}% with naive modulo hashing.`,
  };
}
