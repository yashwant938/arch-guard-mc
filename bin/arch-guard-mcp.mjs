#!/usr/bin/env node
/**
 * ArchGuard MCP Server — Local Stdio Transport (MCP 2025-03-26)
 *
 * Zero external dependencies. Supports line-delimited JSON-RPC 2.0 over stdin/stdout
 * with ordered async execution, full local filesystem codebase auditing, and all
 * distributed systems tools, resources, and prompts.
 */

import readline from 'node:readline';
import { createMcpDispatcher } from '../src/mcp/protocol.mjs';
import { auditLocalDirectory } from '../src/engines/fsScanner.mjs';

const dispatcher = createMcpDispatcher({
  enableLocalFs: true,
  auditLocalDirectoryFn: auditLocalDirectory,
});

function writeMessage(payload) {
  if (!payload) return;
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

async function run() {
  const rl = readline.createInterface({
    input: process.stdin,
    crlfDelay: Infinity,
  });

  process.stderr.write('[arch-guard-mcp] Local stdio MCP server ready (7 tools, 4 resources, 3 prompts)\n');

  for await (const rawLine of rl) {
    const line = rawLine.trim();
    if (!line || line.startsWith('Content-Length:') || line.startsWith('Content-Type:')) {
      continue;
    }

    try {
      const parsed = JSON.parse(line);
      if (Array.isArray(parsed)) {
        const responses = (await Promise.all(parsed.map((m) => dispatcher.handleMessage(m)))).filter(Boolean);
        if (responses.length > 0) writeMessage(responses);
      } else {
        const response = await dispatcher.handleMessage(parsed);
        if (response) writeMessage(response);
      }
    } catch (err) {
      writeMessage({
        jsonrpc: '2.0',
        id: null,
        error: { code: -32700, message: `Parse error: ${err.message}` },
      });
    }
  }
}

run().catch((err) => {
  process.stderr.write(`[arch-guard-mcp] Fatal error: ${err.message}\n`);
  process.exitCode = 1;
});
