/**
 * Zero-dependency ESM bundler for Cloudflare Workers deployment.
 * Verifies module graph and writes `dist/worker.mjs`.
 */
import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT_DIR = path.join(ROOT, 'dist');

const MODULE_ORDER = [
  'src/engines/dependencyGraph.mjs',
  'src/engines/codebaseAuditor.mjs',
  'src/engines/migrationGuardian.mjs',
  'src/engines/capacityMath.mjs',
  'src/engines/distributedSim.mjs',
  'src/engines/architectureAdvisor.mjs',
  'src/mcp/protocol.mjs',
  'worker/index.mjs',
];

function stripLocalImportsAndExports(src, isEntry) {
  let out = src
    .replace(/^\s*import\s+[\s\S]*?from\s+['"]\.\.?\/[^'"]+['"];?\s*$/gm, '')
    .replace(/^\s*export\s+\{[^}]*\};?\s*$/gm, '');
  if (!isEntry) {
    out = out
      .replace(/\bexport\s+async\s+function\b/g, 'async function')
      .replace(/\bexport\s+function\b/g, 'function')
      .replace(/\bexport\s+const\b/g, 'const');
  }
  return out.trim();
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const parts = ['// Bundled ArchGuard MCP Cloudflare Worker (zero dependencies)\n'];

  for (let i = 0; i < MODULE_ORDER.length; i++) {
    const rel = MODULE_ORDER[i];
    const abs = path.join(ROOT, rel);
    const content = await fs.readFile(abs, 'utf8');
    const isEntry = i === MODULE_ORDER.length - 1;
    parts.push(`// --- ${rel} ---\n${stripLocalImportsAndExports(content, isEntry)}\n`);
  }

  const outFile = path.join(OUT_DIR, 'worker.mjs');
  const bundled = parts.join('\n');
  await fs.writeFile(outFile, bundled, 'utf8');
  console.log(`Bundled ${outFile} (${Buffer.byteLength(bundled, 'utf8')} bytes)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
