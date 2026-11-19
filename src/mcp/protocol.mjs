import { auditCodeFiles } from '../engines/codebaseAuditor.mjs';
import { analyzeSqlMigration } from '../engines/migrationGuardian.mjs';
import { CAPACITY_PRESETS, estimateSystemCapacity } from '../engines/capacityMath.mjs';
import { simulateConsistentHashing, simulateQuorumAndTailLatency } from '../engines/distributedSim.mjs';
import { CHEATSHEET_RESOURCES, recommendArchitecture } from '../engines/architectureAdvisor.mjs';

export const SERVER_INFO = {
  name: 'arch-guard-mcp',
  version: '1.0.0',
};

const SUPPORTED_PROTOCOL_VERSIONS = new Set(['2025-03-26', '2024-11-05']);

const REMOTE_TOOLS = [
  {
    name: 'audit_code_snippet',
    description:
      'Analyze one or more source files for circular module dependencies (Tarjan SCC), coupling/instability metrics (Ca/Ce/I), and 12 production reliability/security/SOLID anti-patterns (N+1 loops, missing HTTP timeouts, unbounded caches, check-then-act races, missing idempotency keys, SQL/command injection, God classes). Returns a 0-100 health score, prioritized findings, and Mermaid dependency graph.',
    inputSchema: {
      type: 'object',
      properties: {
        files: {
          type: 'array',
          description: 'List of files with relative paths and source text.',
          items: {
            type: 'object',
            properties: {
              path: { type: 'string', description: 'Relative file path, e.g. src/services/orderService.js' },
              content: { type: 'string', description: 'Full source text of the file' },
            },
            required: ['path', 'content'],
          },
          minItems: 1,
        },
        maxFileLines: {
          type: 'integer',
          description: 'Optional LOC threshold for God File detection (default 500).',
        },
      },
      required: ['files'],
    },
  },
  {
    name: 'check_migration_safety',
    description:
      'Audit a SQL migration (PostgreSQL, MySQL, or SQLite) for production table locks, rolling-deployment breaking changes (DROP/RENAME COLUMN, blocking CREATE INDEX, ADD COLUMN NOT NULL without DEFAULT, ALTER COLUMN TYPE rewrite, unvalidated constraints, missing lock_timeout), and auto-generate a safe 3-phase Expand-Contract deployment plan.',
    inputSchema: {
      type: 'object',
      properties: {
        sql: {
          type: 'string',
          description: 'One or more SQL DDL/DML migration statements to analyze.',
        },
        dialect: {
          type: 'string',
          enum: ['postgres', 'mysql', 'sqlite'],
          description: 'SQL dialect (default: postgres).',
        },
      },
      required: ['sql'],
    },
  },
  {
    name: 'estimate_system_capacity',
    description:
      'Compute exact back-of-the-envelope distributed systems capacity math: avg & peak Write/Read QPS, cache-adjusted DB QPS, N-year raw & replicated storage, peak ingress/egress Gbps, Redis RAM sizing, primary shard count + dominant bottleneck, and Little’s Law peak concurrency. Supports Big Tech presets (tinyurl, twitter, whatsapp, uber, youtube, stripe) or custom numbers.',
    inputSchema: {
      type: 'object',
      properties: {
        preset: {
          type: 'string',
          enum: Object.keys(CAPACITY_PRESETS),
          description: 'Optional preset baseline to start from (any explicit field below overrides the preset).',
        },
        dau: { type: 'number', description: 'Daily active users.' },
        writesPerUserPerDay: { type: 'number', description: 'Average write operations per user per day.' },
        readWriteRatio: { type: 'number', description: 'Read-to-write ratio (e.g. 100 for 100:1 read-heavy).' },
        avgWriteBytes: { type: 'number', description: 'Average metadata write record size in bytes.' },
        avgReadBytes: { type: 'number', description: 'Average response payload size in bytes.' },
        mediaBytesPerWrite: { type: 'number', description: 'Optional blob/media bytes per write (stored in S3/R2).' },
        retentionYears: { type: 'number', description: 'Data retention window in years (default 5).' },
        replicationFactor: { type: 'number', description: 'Storage replication factor (default 3).' },
        peakMultiplier: { type: 'number', description: 'Peak-to-average traffic spike multiplier (default 3).' },
        cacheHitRatio: { type: 'number', description: 'Expected cache hit ratio 0..0.99 (default 0.8).' },
        avgLatencyMs: { type: 'number', description: 'Expected average end-to-end latency in ms for Little’s Law.' },
      },
    },
  },
  {
    name: 'simulate_quorum_and_tail_latency',
    description:
      'Verify Dynamo quorum consistency (W + R > N, split-brain write safety W > N/2), Raft consensus fault tolerance, and Jeff Dean tail-latency amplification (1 - (1 - p)^K) across parallel microservice fanout calls with hedged-request comparison.',
    inputSchema: {
      type: 'object',
      properties: {
        replicationFactor: { type: 'integer', description: 'Replica / cluster node count N (default 3).' },
        writeQuorum: { type: 'integer', description: 'Write quorum W (1..N).' },
        readQuorum: { type: 'integer', description: 'Read quorum R (1..N).' },
        fanoutCount: { type: 'integer', description: 'Parallel downstream RPC fanout K (default 20).' },
        singleNodeSlowProbability: {
          type: 'number',
          description: 'Probability a single RPC hits tail latency (default 0.01 for p99).',
        },
        singleNodeP50Ms: { type: 'number', description: 'Median RPC latency in ms (default 12).' },
        singleNodeP99Ms: { type: 'number', description: 'p99 RPC latency in ms (default 180).' },
      },
    },
  },
  {
    name: 'simulate_consistent_hashing',
    description:
      'Run a deterministic FNV-1a 32-bit consistent hashing ring simulation to measure exact shard load skew (min/max/std-dev) and key remapping percentage when scaling out by 1 node compared against naive modulo hashing.',
    inputSchema: {
      type: 'object',
      properties: {
        nodeCount: { type: 'integer', description: 'Initial physical shard count (2..64, default 4).' },
        virtualNodes: { type: 'integer', description: 'Virtual nodes per physical shard (1..500, default 150).' },
        sampleKeys: { type: 'integer', description: 'Number of keys to simulate (500..20000, default 5000).' },
      },
    },
  },
  {
    name: 'recommend_architecture',
    description:
      'Generate a Staff-level distributed system architecture blueprint (primary database, caching & stampede control, contention strategy, messaging/CDC, real-time transport, reliability guardrails, and matching Big Tech In-The-Wild case studies) from concrete workload traits.',
    inputSchema: {
      type: 'object',
      properties: {
        consistency: { type: 'string', enum: ['strong', 'eventual'], description: 'Consistency requirement.' },
        readWriteProfile: { type: 'string', enum: ['read-heavy', 'write-heavy', 'balanced'], description: 'Traffic profile.' },
        scaleTier: { type: 'string', enum: ['startup', 'high', 'global'], description: 'Target scale tier.' },
        dataModel: { type: 'string', enum: ['relational', 'document', 'timeseries', 'search', 'graph'], description: 'Primary data model.' },
        contentionLevel: { type: 'string', enum: ['low', 'medium', 'high', 'extreme'], description: 'Row/key lock contention level.' },
        realtimeNeed: { type: 'string', enum: ['none', 'one-way', 'bidirectional', 'media'], description: 'Real-time transport need.' },
        latencySloMs: { type: 'number', description: 'Target p99 latency SLO in ms (default 100).' },
      },
    },
  },
];

const LOCAL_FS_TOOL = {
  name: 'audit_codebase_architecture',
  description:
    'Scan a local repository directory on disk to detect circular module dependencies (Tarjan SCC), coupling/instability hotspots (Ca/Ce/I), layer boundary violations, and 12 production reliability/security/SOLID anti-patterns (N+1 queries in loops, missing HTTP timeouts, unbounded caches, check-then-act races, SQL/command injection, God modules). Outputs a 0-100 health score and Mermaid dependency graph.',
  inputSchema: {
    type: 'object',
    properties: {
      directoryPath: {
        type: 'string',
        description: 'Absolute or relative path to the project directory to audit.',
      },
      maxFiles: {
        type: 'integer',
        description: 'Maximum source files to scan (default 250).',
      },
      maxFileLines: {
        type: 'integer',
        description: 'LOC threshold for God File detection (default 500).',
      },
    },
    required: ['directoryPath'],
  },
};

const PROMPTS = [
  {
    name: 'staff-architecture-review',
    description: 'Perform a rigorous Staff Engineer architecture & production reliability review of a repository or module.',
    arguments: [
      {
        name: 'target',
        description: 'Directory path or service description to review.',
        required: true,
      },
    ],
  },
  {
    name: 'zero-downtime-migration-plan',
    description: 'Audit a SQL migration for lock/rolling-deploy hazards and produce a safe 3-phase Expand-Contract plan.',
    arguments: [
      {
        name: 'sql',
        description: 'Proposed SQL DDL migration script.',
        required: true,
      },
      {
        name: 'dialect',
        description: 'Database dialect (postgres, mysql, sqlite).',
        required: false,
      },
    ],
  },
  {
    name: 'system-design-interview-sim',
    description: 'Run a calibrated 45-minute Big Tech HLD/LLD mock interview backed by deterministic capacity & quorum calculations.',
    arguments: [
      {
        name: 'system',
        description: 'Target system to design (e.g. Shopify Flash Sale, Uber Dispatch, Global Payment Ledger).',
        required: true,
      },
      {
        name: 'company',
        description: 'Target rubric (Microsoft L63, Google L5, Amazon SDE3, Meta E5).',
        required: false,
      },
    ],
  },
];

function jsonRpcResult(id, result) {
  return { jsonrpc: '2.0', id, result };
}

function jsonRpcError(id, code, message, data) {
  const err = { code, message };
  if (data !== undefined) err.data = data;
  return { jsonrpc: '2.0', id: id ?? null, error: err };
}

/**
 * Create a transport-agnostic MCP JSON-RPC 2.0 dispatcher.
 */
export function createMcpDispatcher({ enableLocalFs = false, auditLocalDirectoryFn = null } = {}) {
  const tools = enableLocalFs && typeof auditLocalDirectoryFn === 'function' ? [LOCAL_FS_TOOL, ...REMOTE_TOOLS] : REMOTE_TOOLS;

  async function executeTool(name, args = {}) {
    switch (name) {
      case 'audit_codebase_architecture': {
        if (!enableLocalFs || typeof auditLocalDirectoryFn !== 'function') {
          throw new Error('audit_codebase_architecture is only available in local stdio mode. Use audit_code_snippet over Remote HTTP.');
        }
        if (!args.directoryPath) throw new Error('Missing required argument: directoryPath');
        return await auditLocalDirectoryFn(args.directoryPath, {
          maxFiles: args.maxFiles,
          maxFileLines: args.maxFileLines,
        });
      }
      case 'audit_code_snippet': {
        if (!Array.isArray(args.files) || args.files.length === 0) {
          throw new Error('Missing required argument: files (non-empty array of { path, content })');
        }
        return auditCodeFiles(args.files, { maxFileLines: args.maxFileLines });
      }
      case 'check_migration_safety': {
        if (!args.sql || typeof args.sql !== 'string') {
          throw new Error('Missing required argument: sql');
        }
        return analyzeSqlMigration(args.sql, { dialect: args.dialect || 'postgres' });
      }
      case 'estimate_system_capacity':
        return estimateSystemCapacity(args);
      case 'simulate_quorum_and_tail_latency':
        return simulateQuorumAndTailLatency(args);
      case 'simulate_consistent_hashing':
        return simulateConsistentHashing(args);
      case 'recommend_architecture':
        return recommendArchitecture(args);
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  function buildPrompt(name, args = {}) {
    switch (name) {
      case 'staff-architecture-review':
        return {
          description: 'Staff Engineer architecture & reliability audit workflow',
          messages: [
            {
              role: 'user',
              content: {
                type: 'text',
                text: `Perform a Staff-level architecture review of "${args.target || '.'}":\n1. Run \`audit_codebase_architecture\` (or \`audit_code_snippet\` if remote) to compute the health score, circular dependencies, coupling hotspots, and reliability/security findings.\n2. Present the Mermaid dependency graph and rank every CRITICAL and HIGH finding with exact file/line references.\n3. Propose concrete code refactors (timeouts, batching, idempotency, DIP cycle breaking) and verify the improved score.`,
              },
            },
          ],
        };
      case 'zero-downtime-migration-plan':
        return {
          description: 'Zero-downtime Expand-Contract SQL migration review',
          messages: [
            {
              role: 'user',
              content: {
                type: 'text',
                text: `Audit the following ${args.dialect || 'postgres'} SQL migration with \`check_migration_safety\` and rewrite any locking or rolling-deploy-breaking statements into a verified 3-phase Expand-Contract plan:\n\n\`\`\`sql\n${args.sql || '-- paste SQL here'}\n\`\`\``,
              },
            },
          ],
        };
      case 'system-design-interview-sim':
        return {
          description: 'Calibrated Big Tech System Design interview simulation',
          messages: [
            {
              role: 'user',
              content: {
                type: 'text',
                text: `Act as a Bar Raiser / Principal Engineer interviewer for ${args.company || 'Microsoft L63 / Google L5'}. Design "${args.system || 'Global Inventory & Checkout Platform'}".\nFirst call \`estimate_system_capacity\`, \`simulate_quorum_and_tail_latency\`, and \`recommend_architecture\` so every QPS, storage TB, shard count, quorum proof, and tail-latency number is mathematically verified. Then walk through Requirements → Math → API/Schema → High-Level Architecture → Deep Dives & Failure Modes.`,
              },
            },
          ],
        };
      default:
        throw new Error(`Unknown prompt: ${name}`);
    }
  }

  async function handleMessage(msg) {
    if (!msg || typeof msg !== 'object' || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') {
      return jsonRpcError(msg?.id, -32600, 'Invalid JSON-RPC 2.0 Request');
    }

    const { id, method, params = {} } = msg;

    // Notifications have no id -> no response required
    if (id === undefined || id === null) {
      return null;
    }

    try {
      switch (method) {
        case 'initialize': {
          const requested = params?.protocolVersion;
          const negotiated = SUPPORTED_PROTOCOL_VERSIONS.has(requested) ? requested : '2025-03-26';
          return jsonRpcResult(id, {
            protocolVersion: negotiated,
            capabilities: {
              tools: { listChanged: false },
              resources: { subscribe: false, listChanged: false },
              prompts: { listChanged: false },
            },
            serverInfo: SERVER_INFO,
            instructions:
              'Use ArchGuard tools before finalizing architecture designs, database migrations, or capacity math. Never guess QPS/storage/quorum math when deterministic calculators are available.',
          });
        }

        case 'ping':
          return jsonRpcResult(id, {});

        case 'tools/list':
          return jsonRpcResult(id, { tools });

        case 'tools/call': {
          const toolName = params?.name;
          const toolArgs = params?.arguments || {};
          try {
            const data = await executeTool(toolName, toolArgs);
            return jsonRpcResult(id, {
              content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
              structuredContent: data,
              isError: false,
            });
          } catch (toolErr) {
            return jsonRpcResult(id, {
              content: [{ type: 'text', text: `Error: ${toolErr.message}` }],
              isError: true,
            });
          }
        }

        case 'resources/list': {
          const resources = Object.entries(CHEATSHEET_RESOURCES).map(([uri, r]) => ({
            uri,
            name: r.name,
            mimeType: r.mimeType,
          }));
          return jsonRpcResult(id, { resources });
        }

        case 'resources/read': {
          const uri = params?.uri;
          const res = CHEATSHEET_RESOURCES[uri];
          if (!res) {
            return jsonRpcError(id, -32002, `Resource not found: ${uri}`);
          }
          return jsonRpcResult(id, {
            contents: [{ uri, mimeType: res.mimeType, text: res.content }],
          });
        }

        case 'prompts/list':
          return jsonRpcResult(id, { prompts: PROMPTS });

        case 'prompts/get': {
          const prompt = buildPrompt(params?.name, params?.arguments || {});
          return jsonRpcResult(id, prompt);
        }

        default:
          return jsonRpcError(id, -32601, `Method not found: ${method}`);
      }
    } catch (err) {
      return jsonRpcError(id, -32603, err?.message || 'Internal MCP server error');
    }
  }

  return {
    handleMessage,
    listTools: () => tools,
  };
}
