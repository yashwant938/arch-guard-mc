/**
 * ArchGuard Deterministic Distributed Systems Capacity & Napkin Math Engine (Pure ESM)
 *
 * Eliminates LLM arithmetic & unit hallucinations in architecture design reviews
 * and Big Tech interviews. Computes exact QPS, storage, bandwidth, cache RAM,
 * database shard count, and Little's Law concurrency.
 */

export const CAPACITY_PRESETS = {
  tinyurl: {
    name: 'URL Shortener (TinyURL / Bitly)',
    dau: 100_000_000,
    writesPerUserPerDay: 1,
    readWriteRatio: 100,
    avgWriteBytes: 500,
    avgReadBytes: 500,
    retentionYears: 5,
    replicationFactor: 3,
    peakMultiplier: 3,
    cacheHitRatio: 0.85,
    hotDataPercent: 0.2,
    avgLatencyMs: 15,
  },
  twitter: {
    name: 'Social News Feed (Twitter / X)',
    dau: 300_000_000,
    writesPerUserPerDay: 2,
    readWriteRatio: 50,
    avgWriteBytes: 1_024,
    avgReadBytes: 2_048,
    mediaBytesPerWrite: 50_000,
    retentionYears: 5,
    replicationFactor: 3,
    peakMultiplier: 3,
    cacheHitRatio: 0.9,
    hotDataPercent: 0.2,
    avgLatencyMs: 40,
  },
  whatsapp: {
    name: 'Real-Time Chat (WhatsApp / Teams)',
    dau: 500_000_000,
    writesPerUserPerDay: 40,
    readWriteRatio: 1.5,
    avgWriteBytes: 256,
    avgReadBytes: 256,
    mediaBytesPerWrite: 4_000,
    retentionYears: 3,
    replicationFactor: 3,
    peakMultiplier: 3,
    cacheHitRatio: 0.75,
    hotDataPercent: 0.1,
    avgLatencyMs: 20,
  },
  uber: {
    name: 'Ride Dispatch & Location Ingestion (Uber)',
    dau: 40_000_000,
    writesPerUserPerDay: 180,
    readWriteRatio: 4,
    avgWriteBytes: 128,
    avgReadBytes: 512,
    retentionYears: 2,
    replicationFactor: 3,
    peakMultiplier: 4,
    cacheHitRatio: 0.8,
    hotDataPercent: 0.15,
    avgLatencyMs: 25,
  },
  youtube: {
    name: 'Video Streaming Platform (YouTube / Netflix)',
    dau: 200_000_000,
    writesPerUserPerDay: 0.02,
    readWriteRatio: 500,
    avgWriteBytes: 2_048,
    avgReadBytes: 4_096,
    mediaBytesPerWrite: 50_000_000,
    retentionYears: 5,
    replicationFactor: 3,
    peakMultiplier: 3,
    cacheHitRatio: 0.92,
    hotDataPercent: 0.2,
    avgLatencyMs: 60,
  },
  stripe: {
    name: 'Payment Ledger & Idempotency Gateway (Stripe)',
    dau: 50_000_000,
    writesPerUserPerDay: 2,
    readWriteRatio: 5,
    avgWriteBytes: 2_048,
    avgReadBytes: 1_024,
    retentionYears: 7,
    replicationFactor: 3,
    peakMultiplier: 5,
    cacheHitRatio: 0.6,
    hotDataPercent: 0.1,
    avgLatencyMs: 80,
  },
};

function round(val, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(val * factor) / factor;
}

function formatBytesHuman(bytes) {
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB'];
  let idx = 0;
  let value = bytes;
  while (value >= 1024 && idx < units.length - 1) {
    value /= 1024;
    idx++;
  }
  return `${round(value, 2)} ${units[idx]}`;
}

export function estimateSystemCapacity(input = {}) {
  const presetKey = input.preset ? String(input.preset).toLowerCase() : null;
  const base = presetKey && CAPACITY_PRESETS[presetKey] ? CAPACITY_PRESETS[presetKey] : {};

  const dau = Number(input.dau ?? base.dau ?? 10_000_000);
  const writesPerUserPerDay = Number(input.writesPerUserPerDay ?? base.writesPerUserPerDay ?? 5);
  const readWriteRatio = Number(input.readWriteRatio ?? base.readWriteRatio ?? 10);
  const avgWriteBytes = Number(input.avgWriteBytes ?? base.avgWriteBytes ?? 1_024);
  const avgReadBytes = Number(input.avgReadBytes ?? base.avgReadBytes ?? avgWriteBytes);
  const mediaBytesPerWrite = Number(input.mediaBytesPerWrite ?? base.mediaBytesPerWrite ?? 0);
  const retentionYears = Number(input.retentionYears ?? base.retentionYears ?? 5);
  const replicationFactor = Number(input.replicationFactor ?? base.replicationFactor ?? 3);
  const peakMultiplier = Number(input.peakMultiplier ?? base.peakMultiplier ?? 3);
  const cacheHitRatio = Math.min(0.99, Math.max(0, Number(input.cacheHitRatio ?? base.cacheHitRatio ?? 0.8)));
  const hotDataPercent = Math.min(1, Math.max(0.01, Number(input.hotDataPercent ?? base.hotDataPercent ?? 0.2)));
  const avgLatencyMs = Number(input.avgLatencyMs ?? base.avgLatencyMs ?? 30);
  const maxWriteQpsPerShard = Number(input.maxWriteQpsPerShard ?? 5_000);
  const maxReadQpsPerShard = Number(input.maxReadQpsPerShard ?? 20_000);
  const maxStorageTbPerShard = Number(input.maxStorageTbPerShard ?? 2);

  if (dau <= 0 || writesPerUserPerDay <= 0) {
    throw new Error('dau and writesPerUserPerDay must be positive numbers.');
  }

  const SECONDS_PER_DAY = 86_400;
  const dailyWrites = dau * writesPerUserPerDay;
  const dailyReads = dailyWrites * readWriteRatio;

  const avgWriteQps = dailyWrites / SECONDS_PER_DAY;
  const peakWriteQps = avgWriteQps * peakMultiplier;
  const avgReadQps = dailyReads / SECONDS_PER_DAY;
  const peakReadQps = avgReadQps * peakMultiplier;

  const dbReadQpsAfterCache = avgReadQps * (1 - cacheHitRatio);
  const peakDbReadQpsAfterCache = peakReadQps * (1 - cacheHitRatio);

  // Storage (Metadata vs Media/Object Storage)
  const dailyMetadataBytes = dailyWrites * avgWriteBytes;
  const dailyMediaBytes = dailyWrites * mediaBytesPerWrite;
  const totalMetadataRawBytes = dailyMetadataBytes * 365 * retentionYears;
  const totalMetadataReplicatedBytes = totalMetadataRawBytes * replicationFactor;
  const totalMediaRawBytes = dailyMediaBytes * 365 * retentionYears;
  const totalMediaReplicatedBytes = totalMediaRawBytes * replicationFactor;

  // Bandwidth (bits per second -> Mbps / Gbps)
  const peakIngressBytesPerSec = peakWriteQps * (avgWriteBytes + mediaBytesPerWrite);
  const peakEgressBytesPerSec = peakReadQps * avgReadBytes;
  const peakIngressGbps = (peakIngressBytesPerSec * 8) / 1e9;
  const peakEgressGbps = (peakEgressBytesPerSec * 8) / 1e9;

  // Cache Sizing (80/20 rule on daily read working set + 30% Redis overhead)
  const dailyReadWorkingSetBytes = dailyReads * avgReadBytes * hotDataPercent;
  const dailyHotMetadataBytes = dailyMetadataBytes * hotDataPercent;
  const recommendedCacheBytes = Math.min(totalMetadataRawBytes, Math.max(dailyHotMetadataBytes, dailyReadWorkingSetBytes * 0.05)) * 1.3;

  // Sharding Constraints (Write QPS vs Read QPS after Cache vs Storage)
  const metadataTbRaw = totalMetadataRawBytes / 1024 ** 4;
  const shardsByWriteQps = Math.max(1, Math.ceil(peakWriteQps / maxWriteQpsPerShard));
  const shardsByDbReadQps = Math.max(1, Math.ceil(peakDbReadQpsAfterCache / maxReadQpsPerShard));
  const shardsByStorage = Math.max(1, Math.ceil(metadataTbRaw / maxStorageTbPerShard));
  const recommendedShards = Math.max(shardsByWriteQps, shardsByDbReadQps, shardsByStorage);

  let primaryBottleneck = 'Storage-bound';
  if (recommendedShards === shardsByWriteQps && shardsByWriteQps >= shardsByStorage) primaryBottleneck = 'Write-QPS-bound';
  else if (recommendedShards === shardsByDbReadQps && shardsByDbReadQps >= shardsByStorage) primaryBottleneck = 'Cache-miss-Read-QPS-bound';

  // Little's Law: L = lambda * W
  const totalPeakQps = peakWriteQps + peakReadQps;
  const inFlightConcurrency = totalPeakQps * (avgLatencyMs / 1000);

  return {
    workload: base.name || 'Custom Distributed Service',
    assumptions: {
      dau,
      writesPerUserPerDay,
      readWriteRatio,
      avgWriteBytes,
      avgReadBytes,
      mediaBytesPerWrite,
      retentionYears,
      replicationFactor,
      peakMultiplier,
      cacheHitRatio,
      avgLatencyMs,
    },
    throughput: {
      dailyWrites: Math.round(dailyWrites),
      dailyReads: Math.round(dailyReads),
      avgWriteQps: round(avgWriteQps),
      peakWriteQps: round(peakWriteQps),
      avgReadQps: round(avgReadQps),
      peakReadQps: round(peakReadQps),
      peakDbReadQpsAfterCache: round(peakDbReadQpsAfterCache),
      totalPeakQps: round(totalPeakQps),
    },
    storage: {
      dailyMetadata: formatBytesHuman(dailyMetadataBytes),
      metadataRawTotal: formatBytesHuman(totalMetadataRawBytes),
      metadataReplicatedTotal: formatBytesHuman(totalMetadataReplicatedBytes),
      mediaRawTotal: mediaBytesPerWrite > 0 ? formatBytesHuman(totalMediaRawBytes) : '0 B (no blob media)',
      mediaReplicatedTotal: mediaBytesPerWrite > 0 ? formatBytesHuman(totalMediaReplicatedBytes) : '0 B',
    },
    networkAndCache: {
      peakIngressGbps: round(peakIngressGbps, 4),
      peakEgressGbps: round(peakEgressGbps, 4),
      recommendedRedisRam: formatBytesHuman(recommendedCacheBytes),
      redisNodes64GB: Math.max(1, Math.ceil(recommendedCacheBytes / (64 * 1024 ** 3))),
    },
    shardingAndConcurrency: {
      shardsByWriteQps,
      shardsByDbReadQps,
      shardsByStorage,
      recommendedPrimaryShards: recommendedShards,
      totalDbNodesWithReplicas: recommendedShards * replicationFactor,
      primaryBottleneck,
      littlesLawConcurrentRequestsAtPeak: Math.ceil(inFlightConcurrency),
    },
    whiteboardSummary: [
      `Traffic: ${round(avgWriteQps)} avg / ${round(peakWriteQps)} peak Write QPS; ${round(avgReadQps)} avg / ${round(peakReadQps)} peak Read QPS (${round(peakDbReadQpsAfterCache)} DB Read QPS after ${Math.round(cacheHitRatio * 100)}% cache hit).`,
      `Storage (${retentionYears}y): ${formatBytesHuman(totalMetadataRawBytes)} raw metadata (${formatBytesHuman(totalMetadataReplicatedBytes)} at RF=${replicationFactor})${mediaBytesPerWrite > 0 ? ` + ${formatBytesHuman(totalMediaRawBytes)} object/blob storage (S3/R2)` : ''}.`,
      `Bandwidth & Cache: ${round(peakIngressGbps, 3)} Gbps ingress, ${round(peakEgressGbps, 3)} Gbps egress; ~${formatBytesHuman(recommendedCacheBytes)} hot cache RAM.`,
      `Sharding & Concurrency: ${recommendedShards} primary shard(s) (${recommendedShards * replicationFactor} total nodes, bottleneck: ${primaryBottleneck}); Little's Law peak concurrency L = ${Math.ceil(inFlightConcurrency)} in-flight requests at ${avgLatencyMs}ms avg latency.`,
    ],
  };
}
