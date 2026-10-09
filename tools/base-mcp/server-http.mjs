#!/usr/bin/env node
// BASE MCP のリモート版（Streamable HTTP）。claude.ai（Web・スマホ）のカスタムコネクタから使うためのもの。
// URL に含めた長い秘密文字列（BASE_MCP_SECRET）を知っている人だけが使える。
// HTTPS 化は前段（Cloudflare Tunnel など）で行う想定。
import http from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createServer } from './tools.mjs';
import { requireEnv } from './base-client.mjs';

const secret = requireEnv('BASE_MCP_SECRET');
if (secret.length < 32) {
  console.error('BASE_MCP_SECRET は32文字以上にしてください（例: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"）');
  process.exit(1);
}
const port = Number(process.env.PORT || 8788);
const host = process.env.HOST || '127.0.0.1';
const allowWrite = process.env.BASE_ALLOW_WRITE === '1';

const expectedPath = Buffer.from(`/mcp/${secret}`);
const pathMatches = (pathname) => {
  const got = Buffer.from(pathname);
  return got.length === expectedPath.length && timingSafeEqual(got, expectedPath);
};

const readJson = (req) => new Promise((resolve, reject) => {
  let size = 0;
  const chunks = [];
  req.on('data', (c) => {
    size += c.length;
    if (size > 1_000_000) { reject(new Error('too large')); req.destroy(); }
    chunks.push(c);
  });
  req.on('end', () => {
    try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : undefined); }
    catch (e) { reject(e); }
  });
  req.on('error', reject);
});

http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');
  if (pathname === '/healthz') return res.writeHead(200).end('ok');
  if (!pathMatches(pathname)) return res.writeHead(404).end();

  if (req.method !== 'POST') {
    // ステートレス運用なので GET（SSE）/ DELETE は使わない
    return res.writeHead(405, { Allow: 'POST' }).end();
  }
  try {
    const body = await readJson(req);
    // リクエストごとにサーバーとトランスポートを作るステートレス方式
    const server = createServer({ allowWrite });
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on('close', () => { transport.close(); server.close(); });
    await server.connect(transport);
    await transport.handleRequest(req, res, body);
  } catch (e) {
    if (!res.headersSent) res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32700, message: e.message }, id: null }));
  }
}).listen(port, host, () => {
  console.log(`BASE MCP (HTTP) 起動: http://${host}:${port}/mcp/<BASE_MCP_SECRET>`);
  console.log(`書き込みツール: ${allowWrite ? '有効（注意：URLを知る人は誰でもショップを変更できます）' : '無効（読み取り専用）'}`);
});
