// モックBASE APIを立てて、stdio版・HTTP版のMCPサーバーを実際に呼んで確かめるテスト
// 実在のBASE APIの仕様検証ではなく、ページ送り・集計・2段階書き込み・トークン更新などのロジック確認用
import http from 'node:http';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
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
  { unique_key: 'G', ordered: jst('2025-03-01T11:00:00'), cancelled: null, dispatched: jst('2025-03-02T10:00:00'), total: 200000 }, // コンペ景品の大口
];
// 注文した人（注文詳細に入る）
const buyers = {
  A: { mail_address: 'Taro@Example.com', last_name: '山田', first_name: '太郎', prefecture: '山口県' },
  E: { mail_address: 'taro@example.com', last_name: '山田', first_name: '太郎', prefecture: '山口県' },
  B: { mail_address: 'hanako@example.com', last_name: '佐藤', first_name: '花子', prefecture: '福岡県' },
  F: { mail_address: 'golf@example.com', last_name: '鈴木', first_name: '一郎', prefecture: '東京都' },
  G: { mail_address: 'golf@example.com', last_name: '鈴木', first_name: '一郎', prefecture: '東京都' },
};
const detailHits = {};
const details = {
  A: [{ order_item_id: 11, item_id: 1, title: '商品1', amount: 2, price: 1000, total: 2000 }, { order_item_id: 12, item_id: 2, title: '商品2', amount: 1, price: 1000, total: 1000 }],
  B: [{ order_item_id: 21, item_id: 1, title: '商品1', amount: 2, price: 1000, total: 2000 }],
  F: [{ order_item_id: 61, item_id: 9, title: 'とらふぐ刺身', amount: 1, price: 1000, total: 1000 }],
  G: [{ order_item_id: 71, item_id: 9, title: 'とらふぐ刺身', amount: 20, price: 10000, total: 200000 }],
  E: [{ order_item_id: 51, item_id: 1, title: '商品1', amount: 1, price: 1000, total: 1000 }, { order_item_id: 52, item_id: 2, title: '商品2', amount: 1, price: 1000, total: 1000 }],
};
const posts = [];
let refreshCount = 0;

const api = http.createServer((req, res) => handle(req, res).catch((e) => {
  console.error('mock error:', e.message);
  res.writeHead(500).end(e.message);
}));
async function handle(req, res) {
  const url = new URL(req.url, 'http://x');
  let body = '';
  for await (const c of req) body += c;
  const send = (s, j) => res.writeHead(s, { 'Content-Type': 'application/json' }).end(JSON.stringify(j));
  if (url.pathname === '/1/oauth/token') {
    const p = new URLSearchParams(body);
    if (p.get('grant_type') === 'authorization_code') {
      assert.equal(p.get('code'), 'the-code');
      assert.equal(p.get('client_secret'), 'mysecret');
      return send(200, { access_token: 'good', refresh_token: 'r-new', expires_in: 3600 });
    }
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
    detailHits[key] = (detailHits[key] ?? 0) + 1;
    return send(200, { order: { unique_key: key, ...(buyers[key] ?? { mail_address: `${key}@example.com` }), order_items: details[key] ?? [] } });
  }
  if (req.method === 'POST' && url.pathname === '/1/items/edit_stock') {
    const p = Object.fromEntries(new URLSearchParams(body));
    const it = items.find((i) => String(i.item_id) === p.item_id);
    if (p.variation_id) it.variations.find((v) => String(v.variation_id) === p.variation_id).variation_stock = Number(p.variation_stock);
    else it.stock = Number(p.stock);
  }
  if (req.method === 'POST' && url.pathname === '/1/items/add') {
    posts.push({ path: url.pathname, params: Object.fromEntries(new URLSearchParams(body)) });
    return send(200, { item: { item_id: 9000 + posts.length } });
  }
  if (req.method === 'POST' && url.pathname === '/1/items/add_image') {
    const p = Object.fromEntries(new URLSearchParams(body));
    posts.push({ path: url.pathname, params: p });
    if (p.image_url.includes('bad')) return send(400, { error: 'invalid_image' });
    return send(200, { ok: true });
  }
  if (req.method === 'POST') { posts.push({ path: url.pathname, params: Object.fromEntries(new URLSearchParams(body)) }); return send(200, { ok: true }); }
  send(404, { error: 'not_found' });
}
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

await test('お客さま：同じメールは1人に（大文字小文字無視）、お得意様・季節のご案内・休眠お得意様、キャッシュ', async () => {
  const r = await call(client, 'base_customers', {});
  assert.equal(r.summary.customers, 3);
  const top = r.top_customers.map((c) => [c.name, c.order_count, c.total_spent, c.segment]);
  assert.deepEqual(top, [['鈴木 一郎', 2, 201000, 'お得意様'], ['山田 太郎', 2, 7000, 'リピーター'], ['佐藤 花子', 1, 2000, '1回購入']]);
  assert.deepEqual(r.seasonal_reminder_candidates.map((c) => [c.email, c.reason]), [['golf@example.com', '去年の10/01ごろに注文あり。今年はまだ']]);
  assert.deepEqual(r.seasonal_reminder_candidates[0].last_year_orders[0].items, ['とらふぐ刺身×1']);
  assert.deepEqual(r.dormant_vip.map((c) => [c.email, c.days_since_last_order]), [['golf@example.com', 365]]);
  assert.equal(r.summary.repeat_customer_rate_pct, 66.7);
  // 2回目：45日以上前の注文（F・G）はキャッシュを使い、APIを呼ばない
  const before = { F: detailHits.F, G: detailHits.G, A: detailHits.A };
  await call(client, 'base_customers', {});
  assert.equal(detailHits.F, before.F);
  assert.equal(detailHits.G, before.G);
  assert.equal(detailHits.A, before.A + 1); // 最近の注文は状態が変わりうるので読み直す
});

await test('お客さまの履歴：名前の一部で検索、いつもの商品', async () => {
  const r = await call(client, 'base_customer_history', { query: '鈴木' });
  assert.equal(r.found, 1);
  assert.deepEqual(r.customers[0].orders.map((o) => o.date), ['2025-10-01', '2025-03-01']);
  assert.deepEqual(r.customers[0].usual_items, [{ title: 'とらふぐ刺身', times: 2 }]);
  const none = await call(client, 'base_customer_history', { query: 'nobody@example.com' });
  assert.equal(none.found, 0);
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

await test('商品の新規登録：プレビューでは送らない・警告（食品表示不足・同名・画像なし）・非公開で登録・画像追加・一部失敗の報告', async () => {
  const items = [
    { title: '商品1', price: 5000, stock: 3 }, // 既存と同名・表示なし・画像なし
    {
      title: 'とらふぐ刺身 4人前', price: 12000, stock: 10, description: '下関で仕上げたとらふぐ刺身です。',
      food_label: { name: 'ふぐ刺身', ingredients: 'とらふぐ', allergens: 'なし', amount: '4人前', expiry: '冷凍で30日', storage: '-18℃以下', maker: '山西水産株式会社' },
      image_urls: ['https://example.com/a.jpg', 'https://example.com/bad.jpg'],
    },
  ];
  const before = posts.length;
  const preview = await call(client, 'base_create_items', { items });
  assert.equal(posts.length, before);
  const [w1, w2] = preview.will_create.map((x) => x.warnings);
  assert.ok(w1.some((w) => w.startsWith('食品表示が足りません')));
  assert.ok(w1.some((w) => w.includes('同じ名前の商品がすでにあります')));
  assert.ok(w1.some((w) => w.startsWith('画像がありません')));
  assert.deepEqual(w2, []);
  assert.match(preview.will_create[1].detail, /下関で仕上げたとらふぐ刺身です。\n\n【商品情報】\n名称：ふぐ刺身\n原材料名：とらふぐ/);

  const done = await call(client, 'base_create_items', { items, confirm_token: preview.confirm_token });
  const sent = posts.slice(before);
  const adds = sent.filter((p) => p.path === '/1/items/add');
  assert.equal(adds.length, 2);
  assert.ok(adds.every((p) => p.params.visible === '0'), '必ず非公開で登録');
  assert.equal(adds[1].params.price, '12000');
  const imgs = sent.filter((p) => p.path === '/1/items/add_image');
  assert.deepEqual(imgs.map((p) => p.params.image_no), ['1', '2']);
  assert.equal(done.results[1].ok, true);
  assert.equal(done.results[1].images_added, 1);
  assert.equal(done.results[1].image_errors.length, 1);
  assert.match(await readFile(join(dataDir, 'write-log.jsonl'), 'utf8'), /商品の新規登録/);
});

await test('定型プロンプトが出る', async () => {
  const names = (await client.listPrompts()).prompts.map((p) => p.name);
  assert.deepEqual(names.sort(), ['customer_followup', 'growth_plan', 'new_item', 'restock_plan', 'shipping_check', 'weekly_report']);
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
  assert.ok(!names.some((n) => /^base_(update|create)_/.test(n)));
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
  const names = (await c.listTools()).tools.map((t) => t.name);
  assert.ok(!names.includes('base_customers'), 'リモート版では既定でお客さま情報ツールを出さない');
  const r = await call(c, 'base_sales_summary', { period: 'yesterday' });
  assert.equal(r.sales_total, 5000);
  await c.close();
  const bad = await fetch(`http://127.0.0.1:${port}/mcp/wrong`, { method: 'POST' });
  assert.equal(bad.status, 404);
});

// ---- セットアップ（npm run setup） ----
await test('setup：入力→.env保存→BASE許可→接続チェック→Claude Desktop登録（既存設定を保持・バックアップ）', async () => {
  const home = await mkdtemp(join(tmpdir(), 'base-mcp-home-'));
  const desktopDir = join(home, '.config', 'Claude');
  await mkdir(desktopDir, { recursive: true });
  await writeFile(join(desktopDir, 'claude_desktop_config.json'), JSON.stringify({ mcpServers: { other: { command: 'x' } }, theme: 'dark' }));
  const envPath = join(home, 'base.env');
  const cbPort = 19000 + Math.floor(Math.random() * 1000);
  await writeFile(envPath, `BASE_REDIRECT_URI=http://localhost:${cbPort}/callback\n`);
  const sdir = await mkdtemp(join(tmpdir(), 'base-mcp-setup-'));
  const { BASE_CLIENT_ID, BASE_CLIENT_SECRET, BASE_REDIRECT_URI, ...rest } = env;
  const child = spawn(process.execPath, [join(root, 'setup.mjs')], {
    env: { ...rest, HOME: home, PATH: dirname(process.execPath), BASE_ENV_PATH: envPath, BASE_DATA_DIR: sdir, BASE_TOKEN_PATH: join(sdir, 'tokens.json'), BASE_SETUP_NO_BROWSER: '1' },
    stdio: ['pipe', 'pipe', 'inherit'],
  });
  child.stdin.end('myid\nmysecret\ny\ny\n');
  let out = '';
  const exited = new Promise((r) => child.on('exit', r));
  await new Promise((resolve, reject) => {
    child.stdout.on('data', async (d) => {
      out += d;
      const m = out.match(/state=([0-9a-f]+)\n/);
      if (m && !out.includes('__sent__')) {
        out += '__sent__';
        const r = await fetch(`http://localhost:${cbPort}/callback?code=the-code&state=${m[1]}`);
        r.ok ? resolve() : reject(new Error(await r.text()));
      }
    });
  });
  const code = await Promise.race([exited, new Promise((r) => setTimeout(() => r('timeout'), 15000))]);
  if (code === 'timeout') child.kill();
  assert.equal(code, 0, out);
  assert.match(out, /ショップ: テストショップ/);
  assert.doesNotMatch(out, /mysecret/);
  const saved = await readFile(envPath, 'utf8');
  assert.match(saved, /BASE_CLIENT_ID=myid/);
  assert.match(saved, /BASE_CLIENT_SECRET=mysecret/);
  assert.match(saved, new RegExp(`BASE_REDIRECT_URI=http://localhost:${cbPort}/callback`));
  const tokens = JSON.parse(await readFile(join(sdir, 'tokens.json'), 'utf8'));
  assert.equal(tokens.refresh_token, 'r-new');
  const cfg = JSON.parse(await readFile(join(desktopDir, 'claude_desktop_config.json'), 'utf8'));
  assert.equal(cfg.theme, 'dark');
  assert.ok(cfg.mcpServers.other);
  assert.deepEqual(cfg.mcpServers['base-shop'].args, [join(root, 'server.mjs')]);
  assert.ok(existsSync(join(desktopDir, 'claude_desktop_config.json.bak')));
});

proc.kill();
api.close();
console.log(`\n${passed} 件すべて成功`);
