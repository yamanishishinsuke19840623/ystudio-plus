// モックBASE APIを立てて、stdio版・HTTP版のMCPサーバーを実際に呼んで確かめるテスト
// 実在のBASE APIの仕様検証ではなく、ページ送り・集計・2段階書き込み・トークン更新などのロジック確認用
import http from 'node:http';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const jst = (s) => Math.floor(Date.parse(`${s}+09:00`) / 1000);

// ---- モックデータ ----
const items = Array.from({ length: 150 }, (_, i) => ({
  item_id: i + 1, title: `商品${i + 1}`, price: 1000 + i, stock: i < 2 ? i : 10, visible: 1, variations: [],
}));
items[5] = { ...items[5], stock: 0, variations: [
  { variation_id: 501, variation: 'S', variation_stock: 1 },
  { variation_id: 502, variation: 'M', variation_stock: 8 },
] };
items[6] = { ...items[6], stock: 0, visible: 0 };
const orders = [
  { unique_key: 'A', ordered: jst('2026-10-01T10:00:00'), cancelled: null, dispatched: null, total: 3000 },
  { unique_key: 'B', ordered: jst('2026-10-01T23:30:00'), cancelled: null, dispatched: jst('2026-10-02T09:00:00'), total: 2000 },
  { unique_key: 'C', ordered: jst('2026-10-02T08:00:00'), cancelled: jst('2026-10-02T09:00:00'), dispatched: null, total: 9999 },
  { unique_key: 'D', ordered: jst('2026-10-05T12:00:00'), cancelled: null, dispatched: null, total: 5000 }, // 期間外
  { unique_key: 'E', ordered: jst('2026-09-30T15:00:00'), cancelled: null, dispatched: jst('2026-09-30T18:00:00'), total: 4000 }, // 前期間
  { unique_key: 'F', ordered: jst('2025-10-01T15:00:00'), cancelled: null, dispatched: jst('2025-10-02T18:00:00'), total: 1000 }, // 前年
];
const details = {
  A: [{ order_item_id: 11, item_id: 1, title: '商品1', amount: 2, price: 1000, total: 2000 }, { order_item_id: 12, item_id: 2, title: '商品2', amount: 1, price: 1000, total: 1000 }],
  B: [{ order_item_id: 21, item_id: 1, title: '商品1', amount: 2, price: 1000, total: 2000 }],
  E: [{ order_item_id: 51, item_id: 1, title: '商品1', amount: 1, price: 1000, total: 1000 }, { order_item_id: 52, item_id: 2, title: '商品2', amount: 1, price: 1000, total: 1000 }],
};
const posts = [];
let refreshCount = 0;

const api = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  let body = '';
  for await (const c of req) body += c;
  const send = (s, j) => res.writeHead(s, { 'Content-Type': 'application/json' }).end(JSON.stringify(j));
  if (url.pathname === '/1/oauth/token') {
    const p = new URLSearchParams(body);
    assert.equal(p.get('grant_type'), 'refresh_token');
    refreshCount++;
    return send(200, { access_token: 'good', refresh_token: 'r2', expires_in: 3600 });
  }
  if (req.headers.authorization !== 'Bearer good') return send(401, { error: 'invalid_token' });
  const limit = Number(url.searchParams.get('limit') ?? 20), offset = Number(url.searchParams.get('offset') ?? 0);
  if (url.pathname === '/1/users/me') return send(200, { user: { shop_name: 'テストショップ' } });
  if (url.pathname === '/1/items') return send(200, { items: items.slice(offset, offset + limit) });
  if (url.pathname.startsWith('/1/items/detail/')) return send(200, { item: items.find((i) => String(i.item_id) === url.pathname.split('/').pop()) });
  if (url.pathname === '/1/orders') return send(200, { orders: orders.slice(offset, offset + limit) }); // 期間クエリは無視（手元絞り込みの確認）
  if (url.pathname.startsWith('/1/orders/detail/')) {
    const key = url.pathname.split('/').pop();
    return send(200, { order: { unique_key: key, order_items: details[key] ?? [] } });
  }
  if (req.method === 'POST' && url.pathname === '/1/items/edit_stock') {
    const p = Object.fromEntries(new URLSearchParams(body));
    const it = items.find((i) => String(i.item_id) === p.item_id);
    if (p.variation_id) it.variations.find((v) => String(v.variation_id) === p.variation_id).variation_stock = Number(p.variation_stock);
    else it.stock = Number(p.stock);
  }
  if (req.method === 'POST') { posts.push({ path: url.pathname, params: Object.fromEntries(new URLSearchParams(body)) }); return send(200, { ok: true }); }
  send(404, { error: 'not_found' });
});
await new Promise((r) => api.listen(0, '127.0.0.1', r));

const dataDir = await mkdtemp(join(tmpdir(), 'base-mcp-test-'));
await writeFile(join(dataDir, 'tokens.json'), JSON.stringify({ access_token: 'expired', refresh_token: 'r1' }));
const env = {
  ...process.env,
  BASE_API_BASE: `http://127.0.0.1:${api.address().port}`,
  BASE_DATA_DIR: dataDir, BASE_TOKEN_PATH: join(dataDir, 'tokens.json'),
  BASE_CLIENT_ID: 'id', BASE_CLIENT_SECRET: 'sec', BASE_REDIRECT_URI: 'http://localhost:8787/callback',
  BASE_ALLOW_WRITE: '1',
  BASE_MCP_NOW: '2026-10-02T12:00:00+09:00',
};

const call = async (client, name, args = {}) => {
  const r = await client.callTool({ name, arguments: args });
  const data = r.content[0].text;
  if (r.isError) throw new Error(data);
  return JSON.parse(data);
};

let passed = 0;
const test = async (name, fn) => { await fn(); passed++; console.log(`✅ ${name}`); };

// ---- stdio ----
const client = new Client({ name: 'test', version: '1' });
await client.connect(new StdioClientTransport({ command: process.execPath, args: [join(root, 'server.mjs')], env }));

await test('期限切れトークンを自動更新して取得できる', async () => {
  const me = await call(client, 'base_get_shop');
  assert.equal(me.user.shop_name, 'テストショップ');
  assert.equal(refreshCount, 1);
  const saved = JSON.parse(await readFile(env.BASE_TOKEN_PATH, 'utf8'));
  assert.equal(saved.refresh_token, 'r2');
});

await test('全商品をページ送りで取得（150件）', async () => {
  const r = await call(client, 'base_fetch_all_items');
  assert.equal(r.count, 150);
  assert.equal(r.truncated, false);
});

await test('在庫少：非公開を除外・バリエーション単位で判定', async () => {
  const r = await call(client, 'base_low_stock', { threshold: 1 });
  const ids = r.low_stock.map((x) => `${x.item_id}:${x.variation_id ?? ''}`);
  assert.deepEqual(ids.sort(), ['1:', '2:', '6:501'].sort());
});

await test('売上集計：期間外・キャンセルを除外、日本時間で日別、商品ランキング', async () => {
  const r = await call(client, 'base_sales_summary', { start_date: '2026-10-01', end_date: '2026-10-02', include_items: true });
  assert.equal(r.orders, 2);
  assert.equal(r.sales_total, 5000);
  assert.equal(r.cancelled_orders, 1);
  assert.equal(r.undispatched_orders, 1);
  assert.deepEqual(r.daily, [{ date: '2026-10-01', orders: 2, sales: 5000 }, { date: '2026-10-02', orders: 0, sales: 0 }]);
  assert.deepEqual(r.items_ranking.map((x) => [x.item_id, x.quantity]), [[1, 4], [2, 1]]);
});

await test('期間の呼び名と前期間・前年比較', async () => {
  const t = await call(client, 'base_today');
  assert.equal(t.today, '2026-10-02');
  assert.deepEqual(t.periods.last_week, ['2026-09-21', '2026-09-27']);
  assert.deepEqual(t.periods.this_week, ['2026-09-28', '2026-10-02']);
  assert.deepEqual(t.periods.last_month, ['2026-09-01', '2026-09-30']);
  const prev = await call(client, 'base_sales_summary', { start_date: '2026-10-01', end_date: '2026-10-02', compare: 'previous' });
  assert.deepEqual(prev.comparison.period, { start_date: '2026-09-29', end_date: '2026-09-30', days: 2 });
  // 前期間 9/29〜9/30 = E(4000)。今期 5000 なので +25%
  assert.equal(prev.comparison.sales_total, 4000);
  assert.equal(prev.comparison.change.sales_pct, 25);
  const ly = await call(client, 'base_sales_summary', { period: 'this_week', compare: 'last_year' });
  assert.equal(ly.sales_total, 9000); // 9/28〜10/2 = E + A + B
  assert.equal(ly.comparison.sales_total, 1000);
});

await test('未発送：キャンセル・発送済みを除き古い順', async () => {
  const r = await call(client, 'base_pending_shipments', { days: 7 });
  assert.deepEqual(r.orders.map((o) => [o.unique_key, o.days_waiting]), [['A', 1]]);
});

await test('売上アップの機会：在庫切れ・セット候補・動かない在庫・曜日/時間帯・まとめ買い率', async () => {
  const r = await call(client, 'base_growth_insights', { period: 'this_week' });
  assert.equal(r.basis.orders, 3);
  const byType = Object.fromEntries(r.opportunities.map((o) => [o.type, o]));
  assert.deepEqual(byType['売れ筋の在庫切れ・在庫切れ間近'].items.map((i) => [i.item_id, i.stock, i.days_of_stock_left]), [[1, 0, 0], [2, 1, 2.5]]);
  assert.deepEqual(byType['セット販売の候補'].pairs[0], { items: ['商品1', '商品2'], item_ids: ['1', '2'], orders: 2 });
  assert.ok(byType['動いていない在庫'].items.length > 0);
  assert.ok(!byType['在庫があるのに非公開']);
  assert.equal(r.facts.multi_item_order_rate_pct, 100);
  assert.equal(r.facts.by_weekday.find((w) => w.weekday === '木').orders, 2);
  assert.deepEqual(r.facts.top_hours.map((h) => h.hour).sort(), ['10時台', '15時台', '23時台']);
});

await test('商品検索：全角半角を区別せず複数語AND', async () => {
  const r = await call(client, 'base_find_items', { query: '商品１２' });
  assert.deepEqual(r.items.map((i) => i.item_id).slice(0, 3), [12, 120, 121]);
  assert.equal(r.total_hits, 11);
});

await test('在庫一括更新：add/stock・バリエーション、プレビューでは送信しない、ログ記録', async () => {
  const changes = [{ item_id: 3, add: 5 }, { item_id: 6, variation_id: 501, stock: 4 }];
  const preview = await call(client, 'base_update_stock', { changes });
  assert.deepEqual(preview.changes, [
    { title: '商品3', before: 10, after: 15 },
    { title: '商品6', variation: 'S', before: 1, after: 4 },
  ]);
  assert.equal(posts.length, 0);
  const done = await call(client, 'base_update_stock', { changes, confirm_token: preview.confirm_token });
  assert.equal(done.results.every((r) => r.ok), true);
  assert.deepEqual(posts.map((p) => p.params), [
    { item_id: '3', stock: '15' },
    { item_id: '6', variation_id: '501', variation_stock: '4' },
  ]);
  assert.match(await readFile(join(dataDir, 'write-log.jsonl'), 'utf8'), /edit_stock/);
});

await test('在庫一括更新：途中で在庫が変わったらトークン無効、バリエーション指定漏れはエラー', async () => {
  const preview = await call(client, 'base_update_stock', { changes: [{ item_id: 3, add: 1 }] });
  items[2].stock = 99; // 別の注文などで在庫が変わった想定
  await assert.rejects(call(client, 'base_update_stock', { changes: [{ item_id: 3, add: 1 }], confirm_token: preview.confirm_token }), /confirm_token が無効/);
  await assert.rejects(call(client, 'base_update_stock', { changes: [{ item_id: 6, stock: 1 }] }), /variation_id を指定/);
  assert.equal(posts.length, 2);
});

await test('商品更新：内容を変えたら同じトークンは使えない／再利用不可', async () => {
  const preview = await call(client, 'base_update_item', { item_id: 3, price: 1200 });
  await assert.rejects(call(client, 'base_update_item', { item_id: 3, price: 99, confirm_token: preview.confirm_token }), /confirm_token が無効/);
  await assert.rejects(call(client, 'base_update_item', { item_id: 3, price: 1200, confirm_token: preview.confirm_token }), /confirm_token が無効/);
  assert.equal(posts.length, 2);
});

await test('定型プロンプトが出る', async () => {
  const names = (await client.listPrompts()).prompts.map((p) => p.name);
  assert.deepEqual(names.sort(), ['growth_plan', 'restock_plan', 'shipping_check', 'weekly_report']);
  const p = await client.getPrompt({ name: 'restock_plan', arguments: { threshold: '2' } });
  assert.match(p.messages[0].content.text, /threshold=2/);
});

await test('項目名が想定と違えば推測せずエラー', async () => {
  const saved = orders[0].total;
  delete orders[0].total;
  await assert.rejects(call(client, 'base_sales_summary', { start_date: '2026-10-01', end_date: '2026-10-02' }), /想定した項目 total/);
  orders[0].total = saved;
});
await client.close();

await test('BASE_ALLOW_WRITE なしでは書き込みツールが出ない', async () => {
  const c = new Client({ name: 'test', version: '1' });
  await c.connect(new StdioClientTransport({ command: process.execPath, args: [join(root, 'server.mjs')], env: { ...env, BASE_ALLOW_WRITE: '0' } }));
  const names = (await c.listTools()).tools.map((t) => t.name);
  assert.ok(names.includes('base_sales_summary'));
  assert.ok(!names.some((n) => n.startsWith('base_update_')));
  await c.close();
});

// ---- HTTP ----
const secret = 'x'.repeat(40);
const port = 18000 + Math.floor(Math.random() * 1000);
const proc = spawn(process.execPath, [join(root, 'server-http.mjs')], { env: { ...env, BASE_MCP_SECRET: secret, PORT: String(port), BASE_ALLOW_WRITE: '0' }, stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((r) => proc.stdout.once('data', r));

await test('HTTP版：秘密URLで呼べる／違うURLは404', async () => {
  const c = new Client({ name: 'test', version: '1' });
  await c.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp/${secret}`)));
  const r = await call(c, 'base_sales_summary', { period: 'yesterday' });
  assert.equal(r.sales_total, 5000);
  await c.close();
  const bad = await fetch(`http://127.0.0.1:${port}/mcp/wrong`, { method: 'POST' });
  assert.equal(bad.status, 404);
});

proc.kill();
api.close();
console.log(`\n${passed} 件すべて成功`);
