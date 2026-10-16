// ギフトモール MCP のテスト。月別明細CSVは実ファイルと同じ構造（Shift_JIS）、
// 注文メールは実メールと同じ書式で、お客さまの情報は架空のもの
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, copyFile, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const fx = (n) => join(root, 'test', 'fixtures', n);

const work = await mkdtemp(join(tmpdir(), 'giftmall-test-'));
const csvDir = join(work, 'Downloads');
await mkdir(csvDir);
await copyFile(fx('giftmall_sales_test_202609.csv'), join(csvDir, 'giftmall_sales_test_202609.csv'));
await writeFile(join(csvDir, 'other_shop_orders.csv'), '注文ID,金額\n1,100\n'); // 関係ないCSVは無視される

const email1001 = await readFile(fx('order_email_1001.txt'), 'utf8');
const variant = (no, { code = '866011', title, price, qty = 1, orderer = 'Hanako@Example.com', recipient = '鈴木 一郎', noshi = '御祝', memo = '' }) =>
  email1001
    .replace('\n1001\n', `\n${no}\n`)
    .replace('商品名：天然真ふぐ炙り刺身・しゃぶ鍋セット（ふぐ 刺身 鍋, ギフト）', `商品名：${title}`)
    .replace('商品コード：866011', `商品コード：${code}`)
    .replace('数量：1 個', `数量：${qty} 個`)
    .replace('金額：￥ 7,000', `金額：￥ ${price.toLocaleString('en-US')}`)
    .replace('Hanako@Example.com', orderer)
    .replace('鈴木 一郎', recipient)
    .replace('\n御祝\n', `\n${noshi}\n`)
    .replace('価格のわかるものをいれないでください。', memo);

const env = {
  ...process.env,
  GIFTMALL_DATA_DIR: join(work, 'data'),
  GIFTMALL_CSV_DIRS: csvDir,
  GIFTMALL_ENV_PATH: join(work, 'none.env'),
  GIFTMALL_NOW: '2026-10-16T12:00:00+09:00',
};
const client = new Client({ name: 'test', version: '1' });
await client.connect(new StdioClientTransport({ command: process.execPath, args: [join(root, 'server.mjs')], env }));
const call = async (name, args = {}) => {
  const r = await client.callTool({ name, arguments: args });
  if (r.isError) throw new Error(r.content[0].text);
  return JSON.parse(r.content[0].text);
};

let passed = 0;
const test = async (name, fn) => { await fn(); passed++; console.log(`✅ ${name}`); };

await test('月別明細CSV（Shift_JIS）を読み、売上・利用料率・振込額を出す。関係ないCSVは無視', async () => {
  const r = await call('giftmall_monthly_reports');
  assert.equal(r.months.length, 1);
  const m = r.months[0];
  assert.deepEqual([m.month, m.orders, m.sales_incl_tax, m.system_fee, m.payout], ['2026-09', 3, 18000, 3786, 14214]);
  assert.equal(m.system_fee_rate_pct, 21);
  assert.equal(m.payout_label, '10月末日お振込合計金額');
  assert.deepEqual(r.errors, []);
});

await test('1か月の明細：商品別（カンマ入りの商品名も正しく読む）', async () => {
  const r = await call('giftmall_month_detail', { month: '2026-09' });
  assert.equal(r.orders[0].title, '天然真ふぐ炙り刺身・しゃぶ鍋セット（ふぐ 刺身 鍋, ギフト）');
  assert.deepEqual(r.items.map((i) => [i.code, i.orders, i.sales]), [['850181', 2, 11000], ['866011', 1, 7000]]);
  await assert.rejects(call('giftmall_month_detail', { month: '2026-08' }), /見つかりません/);
});

await test('UTF-8（Excelで保存し直したもの）でも読める', async () => {
  const sjis = await readFile(fx('giftmall_sales_test_202609.csv'));
  const utf8 = '﻿' + new TextDecoder('shift_jis').decode(sjis).replace('2026年9月度', '2026年8月度');
  await writeFile(join(csvDir, 'giftmall_sales_test_202608.csv'), utf8);
  const r = await call('giftmall_monthly_reports');
  assert.deepEqual(r.months.map((m) => m.month), ['2026-08', '2026-09']);
});

await test('注文メールを読み取る：金額・ポイント・のし・メモ・お届け日時・贈り物判定。住所と電話は保存しない', async () => {
  const r = await call('giftmall_add_order_emails', { emails: [{ body: email1001, received_at: '2026-09-05T01:00:00Z' }] });
  assert.equal(r.added, 1);
  const saved = JSON.parse(await readFile(join(work, 'data', 'orders.json'), 'utf8'))['1001'];
  assert.deepEqual(
    [saved.total, saved.subtotal, saved.points_used, saved.shipping, saved.fee, saved.payment],
    [6974, 7000, 26, 0, 0, 'Amazon Pay'],
  );
  assert.deepEqual(saved.items, [{ title: '天然真ふぐ炙り刺身・しゃぶ鍋セット（ふぐ 刺身 鍋, ギフト）', code: '866011', quantity: 1, price: 7000, option_price: 0 }]);
  assert.equal(saved.noshi, '御祝');
  assert.equal(saved.memo, '価格のわかるものをいれないでください。');
  assert.equal(saved.options['沖縄・北海道の場合別途送料(1500円)'], '了解します');
  assert.equal(saved.options['[のし]名入れ希望の方はご記入下さい'], undefined);
  assert.equal(saved.delivery_time, '午前中');
  assert.deepEqual([saved.delivery_prefecture, saved.orderer_prefecture], ['長崎県', '福岡県']);
  assert.equal(saved.is_gift, true);
  assert.equal(saved.orderer_email, 'hanako@example.com');
  const raw = await readFile(join(work, 'data', 'orders.json'), 'utf8');
  assert.ok(!raw.includes('090-'), '電話番号を保存しない');
  assert.ok(!raw.includes('テスト町'), '住所を保存しない');
});

await test('取り込み：同じ注文は上書き、読めないメールは理由つきで報告', async () => {
  const r = await call('giftmall_add_order_emails', {
    emails: [
      { body: email1001, received_at: '2026-09-05T01:00:00Z' },
      { body: variant('1002', { code: '850181', title: 'てっちりしゃぶ鍋セット3-4人前', price: 5600 }), received_at: '2026-09-18T00:00:00Z' },
      { body: variant('1003', { code: '850181', title: 'てっちりしゃぶ鍋セット3-4人前', price: 5600, orderer: 'other@example.com', recipient: '山田 花子', noshi: '内祝' }), received_at: '2026-09-22T00:00:00Z' },
      { body: variant('2001', { code: '850181', title: 'てっちりしゃぶ鍋セット3-4人前', price: 5600, qty: 2, memo: '' }), received_at: '2026-10-10T00:00:00Z' },
      { body: variant('2002', { title: '天然真ふぐ炙り刺身・しゃぶ鍋セット', price: 7000, noshi: 'お歳暮', memo: '午前中必着でお願いします' }), received_at: '2026-10-14T00:00:00Z' },
      { body: 'ただのメールです' },
    ],
  });
  assert.deepEqual([r.added, r.updated, r.failed], [4, 1, 1]);
  assert.match(r.results.at(-1).error, /ご注文番号/);
});

await test('出荷準備リスト：明細に載った注文は除き、古い順。のし・メモを出す', async () => {
  const r = await call('giftmall_open_orders');
  assert.deepEqual(r.orders.map((o) => [o.order_no, o.days_waiting]), [['2001', 6], ['2002', 2]]);
  assert.equal(r.orders[0].items[0].quantity, 2);
  assert.equal(r.orders[1].noshi, 'お歳暮');
  assert.equal(r.orders[1].memo, '午前中必着でお願いします');
  assert.equal(r.with_memo, 1);
});

await test('発送済みの記録（手元だけ）と取り消し', async () => {
  await call('giftmall_mark_shipped', { order_nos: ['2001'] });
  assert.deepEqual((await call('giftmall_open_orders')).orders.map((o) => o.order_no), ['2002']);
  await call('giftmall_mark_shipped', { order_nos: ['2001'], unmark: true });
  assert.equal((await call('giftmall_open_orders')).open_orders, 2);
});

await test('照合：金額の食い違いと、利用料率が他と違う注文を見つける', async () => {
  const r = await call('giftmall_reconcile', { month: '2026-09' });
  assert.equal(r.matched_with_emails, 3);
  assert.deepEqual(r.amount_mismatches.map((m) => [m.order_no, m.email_amount, m.csv_amount, m.diff]), [['1003', 5600, 5400, -200]]);
  assert.deepEqual(r.fee_rate_outliers.map((m) => [m.order_no, m.rate_pct]), [['1003', 24.1]]);
  assert.match(r.verdict, /2営業日以内/);
});

await test('お客さま：リピーター・贈り物の割合・のしの種類', async () => {
  const r = await call('giftmall_customers');
  assert.equal(r.orders, 5);
  assert.equal(r.customers, 2);
  assert.equal(r.repeaters, 1);
  assert.deepEqual(r.noshi_types, { 御祝: 3, 内祝: 1, お歳暮: 1 });
  assert.deepEqual([r.top_customers[0].email, r.top_customers[0].orders], ['hanako@example.com', 4]);
});

await test('明細の列が想定と違えば、推測せずに実際の列を示して止まる', async () => {
  const bad = '■2026年7月度実績,\n■明細,\n注文番号,商品名,金額\n1,テスト,100\n';
  await writeFile(join(csvDir, 'giftmall_sales_test_202607.csv'), bad);
  const r = await call('giftmall_monthly_reports');
  assert.ok(r.errors.some((e) => /想定した列/.test(e) && /実際の列: 注文番号・商品名・金額/.test(e)));
  assert.ok(!r.months.some((m) => m.month === '2026-07'));
});

await test('定型の依頼が出る', async () => {
  const names = (await client.listPrompts()).prompts.map((p) => p.name).sort();
  assert.deepEqual(names, ['giftmall_monthly_close', 'giftmall_sync_orders']);
  const p = await client.getPrompt({ name: 'giftmall_sync_orders', arguments: { days: '30' } });
  assert.match(p.messages[0].content.text, /from:oiwai@giftmall\.co\.jp.*newer_than:30d/);
});

await client.close();
console.log(`\n${passed} 件すべて成功`);
