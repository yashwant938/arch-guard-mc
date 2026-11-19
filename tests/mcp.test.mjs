import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { handleWorkerRequest } from '../worker/index.mjs';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');

test('MCP Local Stdio Server handles full initialize -> tools -> resources -> prompts lifecycle', async () => {
  const binPath = path.join(REPO_ROOT, 'bin', 'arch-guard-mcp.mjs');
  const child = spawn(process.execPath, [binPath], { stdio: ['pipe', 'pipe', 'pipe'] });

  const responses = [];
  let buffer = '';
  child.stdout.on('data', (chunk) => {
    buffer += chunk.toString('utf8');
    let nl;
    while ((nl = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (line) responses.push(JSON.parse(line));
    }
  });

  const requests = [
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', clientInfo: { name: 'test', version: '1.0' } } },
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    { jsonrpc: '2.0', id: 2, method: 'tools/list' },
    { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'audit_codebase_architecture', arguments: { directoryPath: REPO_ROOT } } },
    { jsonrpc: '2.0', id: 4, method: 'resources/list' },
    { jsonrpc: '2.0', id: 5, method: 'resources/read', params: { uri: 'arch-guard://cheatsheet/core-patterns' } },
    { jsonrpc: '2.0', id: 6, method: 'prompts/list' },
    { jsonrpc: '2.0', id: 7, method: 'prompts/get', params: { name: 'system-design-interview-sim', arguments: { system: 'Uber Dispatch' } } },
  ];

  for (const req of requests) {
    child.stdin.write(`${JSON.stringify(req)}\n`);
  }
  child.stdin.end();

  await new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', resolve);
  });

  assert.equal(responses.length, 7, 'Notification should not emit a response; 7 request IDs should reply');
  assert.equal(responses[0].result.protocolVersion, '2025-03-26');
  assert.equal(responses[1].result.tools.length, 7, 'Stdio server exposes 7 tools (1 local FS + 6 universal)');

  const auditPayload = responses[2].result.structuredContent;
  assert.equal(responses[2].result.isError, false);
  assert.equal(auditPayload.summary.circularDependencies, 0);

  assert.equal(responses[3].result.resources.length, 4);
  assert.match(responses[4].result.contents[0].text, /6 Core System Design Patterns/);
  assert.equal(responses[5].result.prompts.length, 3);
  assert.match(responses[6].result.messages[0].content.text, /Uber Dispatch/);
});

test('Cloudflare Worker Streamable HTTP MCP handles /, /health, OPTIONS, and POST /mcp', async () => {
  const healthRes = await handleWorkerRequest(new Request('https://arch-guard-mcp.yashwant938.workers.dev/health'));
  assert.equal(healthRes.status, 200);
  const health = await healthRes.json();
  assert.equal(health.ok, true);
  assert.equal(health.tools, 6);

  const homeRes = await handleWorkerRequest(new Request('https://arch-guard-mcp.yashwant938.workers.dev/'));
  assert.equal(homeRes.status, 200);
  const html = await homeRes.text();
  assert.match(html, /ArchGuard MCP Server/);

  const getMcpRes = await handleWorkerRequest(new Request('https://arch-guard-mcp.yashwant938.workers.dev/mcp'));
  assert.equal(getMcpRes.status, 405);

  const notifRes = await handleWorkerRequest(
    new Request('https://arch-guard-mcp.yashwant938.workers.dev/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
    })
  );
  assert.equal(notifRes.status, 202);

  const callRes = await handleWorkerRequest(
    new Request('https://arch-guard-mcp.yashwant938.workers.dev/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 42,
        method: 'tools/call',
        params: {
          name: 'simulate_consistent_hashing',
          arguments: { nodeCount: 4, virtualNodes: 150, sampleKeys: 2000 },
        },
      }),
    })
  );
  assert.equal(callRes.status, 200);
  const rpc = await callRes.json();
  assert.equal(rpc.id, 42);
  assert.equal(rpc.result.isError, false);
  assert.ok(rpc.result.structuredContent.scaleOutComparison.cacheChurnSavedPercent > 40);
});
