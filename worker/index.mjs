/**
 * ArchGuard Remote MCP Server — Cloudflare Workers Streamable HTTP (MCP 2025-03-26)
 *
 * Stateless edge deployment exposing:
 *  - POST /mcp      -> MCP Streamable HTTP JSON-RPC 2.0 endpoint (6 tools, 4 resources, 3 prompts)
 *  - GET  /health   -> JSON health & capability probe
 *  - GET  /         -> Clean developer docs & interactive MCP endpoint explorer
 */

import { createMcpDispatcher, SERVER_INFO } from '../src/mcp/protocol.mjs';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept, Mcp-Session-Id, MCP-Protocol-Version',
  'Access-Control-Expose-Headers': 'Mcp-Session-Id, MCP-Protocol-Version',
};

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'SAMEORIGIN',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
};

function renderLandingHtml(origin, tools) {
  const mcpUrl = `${origin}/mcp`;
  const toolCards = tools
    .map(
      (t) => `<div class="card">
        <div class="tool-name">${t.name}</div>
        <p>${t.description}</p>
      </div>`
    )
    .join('');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>ArchGuard MCP — Architecture, SQL Migration & Distributed Systems Verifier</title>
  <style>
    :root { --bg:#faf7f0; --card:#fffdf8; --ink:#1a1d1a; --muted:#565e56; --accent:#2f7d47; --sage:#d8f1da; --border:#262b26; }
    * { box-sizing:border-box; }
    body { margin:0; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif; background:var(--bg); color:var(--ink); line-height:1.55; }
    .wrap { max-width:960px; margin:0 auto; padding:40px 20px 64px; }
    .badge { display:inline-block; background:var(--sage); border:1.5px solid var(--border); border-radius:999px; padding:4px 12px; font:600 12px/1 ui-monospace, SFMono-Regular, Menlo, monospace; }
    h1 { font-size: clamp(28px, 4vw, 40px); margin:14px 0 10px; letter-spacing:-0.02em; }
    .lead { color:var(--muted); font-size:16px; max-width:760px; }
    .box { background:var(--card); border:1.5px solid var(--border); border-radius:14px; padding:18px 20px; margin:22px 0; box-shadow:3px 3px 0 var(--border); }
    pre { background:#181c19; color:#eef5ee; padding:14px 16px; border-radius:10px; overflow:auto; font:13px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; margin:10px 0 0; }
    .grid { display:grid; grid-template-columns:repeat(auto-fit, minmax(270px, 1fr)); gap:14px; margin-top:14px; }
    .card { background:var(--card); border:1.5px solid var(--border); border-radius:12px; padding:14px 16px; }
    .tool-name { font:700 14px/1.3 ui-monospace, SFMono-Regular, Menlo, monospace; color:var(--accent); margin-bottom:6px; }
    .card p { margin:0; font-size:13.5px; color:var(--muted); }
    button { background:var(--sage); color:var(--ink); border:1.5px solid var(--border); border-radius:10px; padding:9px 14px; font:700 13px ui-monospace, monospace; cursor:pointer; box-shadow:2px 2px 0 var(--border); }
    button:hover { background:#c5e9c9; }
    #out { min-height:80px; max-height:320px; }
    .row { display:flex; flex-wrap:wrap; gap:10px; align-items:center; }
    a { color:var(--accent); font-weight:600; }
  </style>
</head>
<body>
  <div class="wrap">
    <span class="badge">MCP 2025-03-26 · Streamable HTTP · Zero Auth Required</span>
    <h1>ArchGuard MCP Server</h1>
    <p class="lead">
      Deterministic <strong>codebase architecture auditor</strong>, <strong>zero-downtime SQL Expand-Contract migration guardian</strong>,
      and <strong>distributed systems capacity, quorum, tail-latency &amp; consistent-hashing verifier</strong> — built for Antigravity, Claude Code, Cursor, Windsurf, and Codex.
    </p>

    <div class="box">
      <strong>Connect Remote MCP (Streamable HTTP)</strong>
      <pre>{
  "mcpServers": {
    "arch-guard": {
      "url": "${mcpUrl}"
    }
  }
}</pre>
      <p style="font-size:13px;color:var(--muted);margin:10px 0 0;">
        For full local repository scanning (<code>audit_codebase_architecture</code>), run the local stdio server from
        <a href="https://github.com/yashwant938/arch-guard-mcp" target="_blank" rel="noreferrer">github.com/yashwant938/arch-guard-mcp</a>.
      </p>
    </div>

    <div class="box">
      <div class="row" style="justify-content:space-between;margin-bottom:8px;">
        <strong>Live MCP Endpoint Probe</strong>
        <div class="row">
          <button type="button" onclick="probe('tools/list', {})">List Tools</button>
          <button type="button" onclick="probe('tools/call', { name:'estimate_system_capacity', arguments:{ preset:'uber' } })">Demo: Uber Capacity Math</button>
          <button type="button" onclick="probe('tools/call', { name:'check_migration_safety', arguments:{ sql:'CREATE INDEX idx_orders_user ON orders(user_id); ALTER TABLE orders DROP COLUMN legacy_code;' } })">Demo: Audit Risky SQL</button>
        </div>
      </div>
      <pre id="out">Click any button above to send a live JSON-RPC 2.0 request to ${mcpUrl}</pre>
    </div>

    <h2>Exposed MCP Tools (${tools.length} Remote · +1 Local Repo Auditor)</h2>
    <div class="grid">${toolCards}</div>
  </div>
  <script>
    async function probe(method, params) {
      const out = document.getElementById('out');
      out.textContent = 'Calling ' + method + '...';
      try {
        const res = await fetch('${mcpUrl}', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          signal: AbortSignal.timeout(10000),
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
        });
        const json = await res.json();
        out.textContent = JSON.stringify(json, null, 2);
      } catch (err) {
        out.textContent = 'Request failed: ' + err.message;
      }
    }
  </script>
</body>
</html>`;
}

export async function handleWorkerRequest(request) {
  const url = new URL(request.url);
  const dispatcher = createMcpDispatcher({ enableLocalFs: false });

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { ...CORS_HEADERS, ...SECURITY_HEADERS } });
  }

  if (url.pathname === '/health') {
    return new Response(
      JSON.stringify({
        ok: true,
        server: SERVER_INFO.name,
        version: SERVER_INFO.version,
        protocolVersion: '2025-03-26',
        transport: 'streamable-http',
        endpoint: `${url.origin}/mcp`,
        tools: dispatcher.listTools().length,
        resources: 4,
        prompts: 3,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS_HEADERS, ...SECURITY_HEADERS },
      }
    );
  }

  if (url.pathname === '/' || url.pathname === '/index.html') {
    return new Response(renderLandingHtml(url.origin, dispatcher.listTools()), {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8', ...SECURITY_HEADERS },
    });
  }

  if (url.pathname === '/mcp') {
    if (request.method === 'GET') {
      return new Response(
        JSON.stringify({
          error: 'Stateless Streamable HTTP MCP server: send JSON-RPC 2.0 requests via HTTP POST to /mcp.',
        }),
        { status: 405, headers: { Allow: 'POST, OPTIONS', 'Content-Type': 'application/json', ...CORS_HEADERS, ...SECURITY_HEADERS } }
      );
    }

    if (request.method === 'DELETE') {
      return new Response(null, { status: 204, headers: { ...CORS_HEADERS, ...SECURITY_HEADERS } });
    }

    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405, headers: { ...CORS_HEADERS, ...SECURITY_HEADERS } });
    }

    let payload;
    try {
      payload = await request.json();
    } catch {
      return new Response(
        JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error: invalid JSON body' } }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS, ...SECURITY_HEADERS } }
      );
    }

    if (Array.isArray(payload)) {
      const results = (await Promise.all(payload.map((msg) => dispatcher.handleMessage(msg)))).filter(Boolean);
      if (results.length === 0) {
        return new Response(null, { status: 202, headers: { ...CORS_HEADERS, ...SECURITY_HEADERS } });
      }
      return new Response(JSON.stringify(results), {
        status: 200,
        headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS_HEADERS, ...SECURITY_HEADERS },
      });
    }

    const response = await dispatcher.handleMessage(payload);
    if (!response) {
      return new Response(null, { status: 202, headers: { ...CORS_HEADERS, ...SECURITY_HEADERS } });
    }

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS_HEADERS, ...SECURITY_HEADERS },
    });
  }

  return new Response('Not Found', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8', ...SECURITY_HEADERS } });
}

export default {
  async fetch(request) {
    return handleWorkerRequest(request);
  },
};
