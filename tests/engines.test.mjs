import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {
  auditCodeFiles,
  auditLocalDirectory,
  analyzeSqlMigration,
  estimateSystemCapacity,
  simulateQuorumAndTailLatency,
  simulateConsistentHashing,
  recommendArchitecture,
} from '../src/index.mjs';

test('codebaseAuditor detects circular dependencies (Tarjan SCC) and production anti-patterns', () => {
  const buggyFiles = [
    {
      path: 'src/ui/OrderPanel.js',
      content: `
import { orderRepo } from '../db/orderRepo.js';
export function render() { return orderRepo; }
`,
    },
    {
      path: 'src/db/orderRepo.js',
      content: `
import { orderService } from '../services/orderService.js';
export const userCache = new Map();
export async function loadOrders(ids) {
  for (const id of ids) {
    const row = await db.findOne(id);
    userCache.set(id, row);
  }
  const sql = \`SELECT * FROM orders WHERE user_id = \${ids[0]}\`;
  return { orderService, sql };
}
`,
    },
    {
      path: 'src/services/orderService.js',
      content: `
import { loadOrders } from '../db/orderRepo.js';
export async function syncRemote(url) {
  const res = await fetch(url);
  try {
    return await res.json();
  } catch (e) {}
}
export function registerRoutes(app) {
  app.post('/api/payments/charge', async (req, res) => {
    if (account.balance >= req.body.amount) {
      await db.update(account.id, account.balance - req.body.amount);
    }
    const sessionToken = 'tok_' + Math.random().toString(36);
    res.json({ ok: true, sessionToken, loadOrders });
  });
}
`,
    },
  ];

  const report = auditCodeFiles(buggyFiles);
  const ruleIds = new Set(report.findings.map((f) => f.id));

  assert.equal(report.summary.circularDependencies, 1, 'Should detect 1 circular dependency via Tarjan SCC');
  assert.ok(ruleIds.has('ARCH-001'), 'Should flag circular module dependency');
  assert.ok(ruleIds.has('ARCH-002'), 'Should flag UI -> DB layer violation');
  assert.ok(ruleIds.has('MEM-001'), 'Should flag unbounded in-memory Map cache');
  assert.ok(ruleIds.has('REL-002'), 'Should flag N+1 awaited DB call inside loop');
  assert.ok(ruleIds.has('REL-001'), 'Should flag fetch() without AbortSignal timeout');
  assert.ok(ruleIds.has('REL-003'), 'Should flag empty catch block');
  assert.ok(ruleIds.has('SEC-001'), 'Should flag SQL injection interpolation');
  assert.ok(ruleIds.has('SEC-002'), 'Should flag weak Math.random() for sessionToken');
  assert.ok(ruleIds.has('DATA-001'), 'Should flag payment POST route missing Idempotency-Key');
  assert.ok(ruleIds.has('CONC-001'), 'Should flag check-then-act balance race');
  assert.equal(report.summary.verdict, 'BLOCK_RELEASE');
  assert.match(report.mermaidGraph, /CYCLE/);
});

test('codebaseAuditor passes cleanly on arch-guard-mcp repository itself (self-audit dogfooding)', async () => {
  const repoRoot = path.resolve(import.meta.dirname, '..');
  const report = await auditLocalDirectory(repoRoot);

  assert.ok(report.summary.filesScanned >= 8);
  assert.equal(report.summary.circularDependencies, 0, 'arch-guard-mcp must have zero circular dependencies');
  assert.equal(report.summary.severityCounts.CRITICAL, 0, 'arch-guard-mcp must have zero CRITICAL findings');
  assert.ok(report.summary.healthScore >= 85, `Expected self-audit score >= 85, got ${report.summary.healthScore}`);
});

test('migrationGuardian flags blocking DDL and produces 3-phase Expand-Contract plan', () => {
  const riskySql = `
    CREATE INDEX idx_orders_user_id ON orders (user_id);
    ALTER TABLE orders DROP COLUMN legacy_promo;
    ALTER TABLE orders ADD COLUMN tenant_id UUID NOT NULL;
    ALTER TABLE orders ALTER COLUMN amount TYPE NUMERIC(18, 4);
    ALTER TABLE orders ADD CONSTRAINT fk_orders_user FOREIGN KEY (user_id) REFERENCES users(id);
  `;

  const report = analyzeSqlMigration(riskySql, { dialect: 'postgres' });
  const ids = new Set(report.findings.map((f) => f.id));

  assert.equal(report.verdict, 'BLOCK_DEPLOY');
  assert.ok(ids.has('MIG-001'), 'Flags blocking CREATE INDEX');
  assert.ok(ids.has('MIG-002'), 'Flags DROP COLUMN');
  assert.ok(ids.has('MIG-003'), 'Flags ADD COLUMN NOT NULL without DEFAULT');
  assert.ok(ids.has('MIG-004'), 'Flags ALTER COLUMN TYPE rewrite');
  assert.ok(ids.has('MIG-005'), 'Flags unvalidated FOREIGN KEY');
  assert.ok(ids.has('MIG-007'), 'Flags missing lock_timeout');
  assert.ok(report.expandContractPlan.phase1Expand.length >= 3);

  const safeSql = `
    SET lock_timeout = '3s';
    SET statement_timeout = '30s';
    CREATE INDEX CONCURRENTLY idx_orders_user_id ON orders (user_id);
    ALTER TABLE orders ADD COLUMN tenant_id UUID;
    ALTER TABLE orders ADD CONSTRAINT fk_orders_user FOREIGN KEY (user_id) REFERENCES users(id) NOT VALID;
  `;
  const safeReport = analyzeSqlMigration(safeSql, { dialect: 'postgres' });
  assert.equal(safeReport.verdict, 'SAFE_ZERO_DOWNTIME');
  assert.equal(safeReport.findings.length, 0);
});

test('capacityMath computes deterministic QPS, storage, bandwidth, shards & Little’s Law', () => {
  const res = estimateSystemCapacity({
    dau: 86_400_000,
    writesPerUserPerDay: 1,
    readWriteRatio: 10,
    avgWriteBytes: 1024,
    retentionYears: 1,
    replicationFactor: 3,
    peakMultiplier: 3,
    cacheHitRatio: 0.8,
    avgLatencyMs: 50,
  });

  assert.equal(res.throughput.avgWriteQps, 1000);
  assert.equal(res.throughput.peakWriteQps, 3000);
  assert.equal(res.throughput.avgReadQps, 10000);
  assert.equal(res.throughput.peakReadQps, 30000);
  assert.equal(res.throughput.peakDbReadQpsAfterCache, 6000);
  assert.ok(res.shardingAndConcurrency.recommendedPrimaryShards >= 1);
  assert.equal(res.shardingAndConcurrency.littlesLawConcurrentRequestsAtPeak, Math.ceil(33000 * 0.05));

  const uber = estimateSystemCapacity({ preset: 'uber' });
  assert.match(uber.workload, /Uber/i);
  assert.ok(uber.whiteboardSummary.length === 4);
});

test('distributedSim verifies Dynamo/Raft quorums, Jeff Dean tail latency, and consistent hashing', () => {
  const stale = simulateQuorumAndTailLatency({
    replicationFactor: 4,
    writeQuorum: 2,
    readQuorum: 2,
    fanoutCount: 100,
    singleNodeSlowProbability: 0.01,
  });

  assert.equal(stale.dynamoQuorum.strongConsistencyOverlap, false);
  assert.equal(stale.raftConsensus.optimalOddCluster, false);
  assert.equal(stale.raftConsensus.maxCrashFaultsTolerated, 1);
  // 1 - 0.99^100 = 0.63396... -> 63.4%
  assert.ok(stale.tailLatencyAmplification.endToEndSlowRequestPercent >= 63 && stale.tailLatencyAmplification.endToEndSlowRequestPercent <= 64);
  assert.ok(stale.tailLatencyAmplification.withHedgedRequestsSlowPercent < 2);

  const ring = simulateConsistentHashing({ nodeCount: 5, virtualNodes: 150, sampleKeys: 6000 });
  // Theoretical optimal for 5 -> 6 nodes is 16.67%, naive modulo moves ~83%
  assert.ok(ring.scaleOutComparison.consistentHashingMovedPercent < 25);
  assert.ok(ring.scaleOutComparison.naiveModuloHashMovedPercent > 70);
  assert.ok(ring.loadDistribution.stdDevPercent < 5);
});

test('architectureAdvisor produces workload-matched blueprint and Big Tech case studies', () => {
  const bp = recommendArchitecture({
    consistency: 'strong',
    readWriteProfile: 'read-heavy',
    scaleTier: 'global',
    dataModel: 'relational',
    contentionLevel: 'extreme',
    realtimeNeed: 'one-way',
    latencySloMs: 40,
  });

  assert.match(bp.blueprint.contentionControl, /SKIP LOCKED/i);
  assert.match(bp.blueprint.realtimeTransport, /SSE/i);
  assert.ok(bp.relevantBigTechCaseStudies.some((c) => c.company === 'Shopify'));
});
