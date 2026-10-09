// MCPツール定義（stdio版・HTTP版で共通）
import { randomBytes } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { callApi, fetchAllPages, appendWriteLog } from './base-client.mjs';

// ここで参照するレスポンスの項目名は、BASE API ドキュメントを実アカウントで未検証。
// 項目が見つからないときは推測で計算せずエラーにする（requireFields）。
const F = {
  item: { id: 'item_id', title: 'title', price: 'price', stock: 'stock', visible: 'visible', variations: 'variations', identifier: 'identifier' },
  variation: { id: 'variation_id', name: 'variation', stock: 'variation_stock' },
  order: { key: 'unique_key', ordered: 'ordered', cancelled: 'cancelled', dispatched: 'dispatched', total: 'total' },
  orderDetail: { items: 'order_items' },
};

function requireFields(obj, fields, label) {
  const missing = fields.filter((f) => !(f in (obj ?? {})));
  if (missing.length) {
    throw new Error(
      `${label} に想定した項目 ${missing.join(', ')} がありません。` +
      `実際の項目: ${Object.keys(obj ?? {}).join(', ')}\n` +
      'tools.mjs の F（項目名の対応表）を実データに合わせて直してください'
    );
  }
}

// ---------------- 日付（日本時間） ----------------
const DAY = 24 * 60 * 60;
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const jstDate = (unixSec) => new Date(unixSec * 1000 + JST_OFFSET_MS).toISOString().slice(0, 10);
const jstStartUnix = (ymd) => Math.floor((Date.parse(`${ymd}T00:00:00Z`) - JST_OFFSET_MS) / 1000);
const addDays = (ymd, n) => new Date(Date.parse(`${ymd}T00:00:00Z`) + n * DAY * 1000).toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / (DAY * 1000));
const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD 形式で指定してください');

const PERIODS = ['today', 'yesterday', 'this_week', 'last_week', 'this_month', 'last_month', 'last_7_days', 'last_30_days'];
const now = () => (process.env.BASE_MCP_NOW ? Date.parse(process.env.BASE_MCP_NOW) : Date.now()); // テスト用に固定可能

// 'last_week' などの呼び名を、日本時間の開始日・終了日に変える（週は月曜始まり）
export function resolvePeriod(name) {
  const today = jstDate(Math.floor(now() / 1000));
  const dow = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7; // 月=0
  const monthStart = `${today.slice(0, 8)}01`;
  const prevMonthEnd = addDays(monthStart, -1);
  switch (name) {
    case 'today': return [today, today];
    case 'yesterday': return [addDays(today, -1), addDays(today, -1)];
    case 'this_week': return [addDays(today, -dow), today];
    case 'last_week': return [addDays(today, -dow - 7), addDays(today, -dow - 1)];
    case 'this_month': return [monthStart, today];
    case 'last_month': return [`${prevMonthEnd.slice(0, 8)}01`, prevMonthEnd];
    case 'last_7_days': return [addDays(today, -6), today];
    case 'last_30_days': return [addDays(today, -29), today];
  }
  throw new Error(`不明な期間: ${name}`);
}

function shiftYear(ymdStr, years) {
  const d = new Date(`${ymdStr}T00:00:00Z`);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCFullYear(d.getUTCFullYear() + years);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay)); // 2/29 → 2/28
  return d.toISOString().slice(0, 10);
}

// ---------------- 商品キャッシュ（API回数の節約。書き込み後は破棄） ----------------
const ITEMS_TTL_MS = 60 * 1000;
let itemsCache = null; // { at, list, truncated }
async function getAllItems({ fresh = false } = {}) {
  if (!fresh && itemsCache && Date.now() - itemsCache.at < ITEMS_TTL_MS) return itemsCache;
  const { list, truncated } = await fetchAllPages('/1/items', 'items');
  itemsCache = { at: Date.now(), list: list.map(compactItem), truncated };
  return itemsCache;
}
const invalidateItems = () => { itemsCache = null; };

function compactItem(it) {
  requireFields(it, [F.item.id, F.item.title, F.item.stock], '商品データ');
  const variations = (it[F.item.variations] ?? []).map((v) => ({
    variation_id: v[F.variation.id], name: v[F.variation.name], stock: Number(v[F.variation.stock]),
  }));
  return {
    item_id: it[F.item.id], title: it[F.item.title], price: it[F.item.price],
    stock: Number(it[F.item.stock]), visible: it[F.item.visible],
    ...(it[F.item.identifier] ? { identifier: it[F.item.identifier] } : {}),
    ...(variations.length ? { variations } : {}),
  };
}

// ---------------- 注文 ----------------
async function fetchOrders(start_date, end_date) {
  const from = jstStartUnix(start_date);
  const to = jstStartUnix(end_date) + DAY; // 終了日の翌0時（含まない）
  if (to <= from) throw new Error('end_date は start_date 以降にしてください');
  // 期間クエリはAPIにも渡すが、効かなかった場合に備えて手元でも ordered で絞り込む
  const { list, truncated } = await fetchAllPages('/1/orders', 'orders', {
    start_ordered: `${start_date} 00:00:00`,
    end_ordered: `${end_date} 23:59:59`,
  });
  if (list[0]) requireFields(list[0], [F.order.key, F.order.ordered, F.order.total], '注文データ');
  const inRange = list.filter((o) => Number(o[F.order.ordered]) >= from && Number(o[F.order.ordered]) < to);
  return { inRange, truncated };
}

async function summarize(start_date, end_date) {
  const { inRange, truncated } = await fetchOrders(start_date, end_date);
  const valid = inRange.filter((o) => !o[F.order.cancelled]);
  const daily = {};
  for (let d = start_date; d <= end_date; d = addDays(d, 1)) daily[d] = { orders: 0, sales: 0 };
  for (const o of valid) {
    const d = jstDate(Number(o[F.order.ordered]));
    daily[d].orders += 1;
    daily[d].sales += Number(o[F.order.total]) || 0;
  }
  const sales = valid.reduce((s, o) => s + (Number(o[F.order.total]) || 0), 0);
  return {
    valid,
    summary: {
      period: { start_date, end_date, days: daysBetween(start_date, end_date) + 1 },
      orders: valid.length,
      sales_total: sales,
      average_order_value: valid.length ? Math.round(sales / valid.length) : 0,
      cancelled_orders: inRange.length - valid.length,
      undispatched_orders: valid.filter((o) => !o[F.order.dispatched]).length,
      daily: Object.entries(daily).map(([date, v]) => ({ date, ...v })),
      truncated,
    },
  };
}

// 注文詳細を読んで、注文ごとの明細（商品・数量・金額）を集める。注文数ぶんAPIを呼ぶので上限つき
async function fetchLineItems(validOrders, max) {
  const targets = validOrders.slice(0, max);
  const orders = [];
  for (const o of targets) {
    const detail = await callApi('GET', `/1/orders/detail/${encodeURIComponent(o[F.order.key])}`);
    const order = detail.order ?? detail;
    const raw = order[F.orderDetail.items] ?? [];
    if (raw[0]) requireFields(raw[0], ['item_id', 'amount'], '注文明細データ');
    orders.push({
      key: o[F.order.key],
      lines: raw.map((li) => ({
        item_id: li.item_id, title: li.title, variation: li.variation || undefined,
        amount: Number(li.amount) || 0,
        sales: Number(li.total ?? (li.price * li.amount)) || 0,
      })),
    });
  }
  return { orders, read: targets.length };
}

function rankItems(orders) {
  const byItem = {};
  for (const { lines } of orders) {
    for (const li of lines) {
      const key = `${li.item_id}:${li.variation ?? ''}`;
      byItem[key] ??= { item_id: li.item_id, title: li.title, variation: li.variation, quantity: 0, sales: 0 };
      byItem[key].quantity += li.amount;
      byItem[key].sales += li.sales;
    }
  }
  return Object.values(byItem).sort((a, b) => b.quantity - a.quantity);
}

const pctChange = (cur, prev) => (prev ? Math.round(((cur - prev) / prev) * 1000) / 10 : null);

// ---------------- 書き込みの2段階確認 ----------------
// 1回目: 現在値と送信内容を返す（まだ変更しない）。2回目: confirm_token 付きで実行。
// トークンは「送信内容そのもの」に結びつくので、途中で在庫が変わって内容が変われば無効になる。
const pending = new Map(); // token -> { key, expires }
const PREVIEW_TTL_MS = 10 * 60 * 1000;
function issueConfirmToken(key) {
  const token = randomBytes(8).toString('hex');
  pending.set(token, { key, expires: Date.now() + PREVIEW_TTL_MS });
  return token;
}
function consumeConfirmToken(token, key) {
  const p = pending.get(token);
  pending.delete(token);
  if (!p || p.expires < Date.now() || p.key !== key) {
    throw new Error('confirm_token が無効です（期限切れ・内容が変わった・在庫が途中で変わった・未プレビュー）。confirm_token なしで呼び直してプレビューからやり直してください');
  }
}

export function createServer({ allowWrite = process.env.BASE_ALLOW_WRITE === '1' } = {}) {
  const server = new McpServer({ name: 'base-shop', version: '0.4.0' });

  const ok = (data) => ({ content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] });
  const fail = (e) => ({ isError: true, content: [{ type: 'text', text: e.message }] });
  const tool = (name, description, inputSchema, run, { write = false } = {}) =>
    server.registerTool(name, {
      description,
      inputSchema,
      annotations: write
        ? { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true }
        : { readOnlyHint: true, openWorldHint: true },
    }, async (args) => {
      try { return ok(await run(args)); } catch (e) { return fail(e); }
    });

  const extra = z.record(z.string(), z.union([z.string(), z.number()])).optional()
    .describe('BASE APIドキュメントにある追加クエリ（キーと値をそのまま送る）');
  const paging = {
    limit: z.number().int().min(1).max(100).optional().describe('取得件数'),
    offset: z.number().int().min(0).optional().describe('開始位置'),
    extra,
  };
  const itemId = z.union([z.string(), z.number()]).describe('商品ID');
  const periodArgs = {
    period: z.enum(PERIODS).optional().describe('期間の呼び名（日本時間・週は月曜始まり）。start_date/end_date の代わりに使える'),
    start_date: ymd.optional().describe('開始日 YYYY-MM-DD（日本時間・この日を含む）'),
    end_date: ymd.optional().describe('終了日 YYYY-MM-DD（日本時間・この日を含む）'),
  };
  const pickRange = ({ period, start_date, end_date }) => {
    if (period) return resolvePeriod(period);
    if (start_date && end_date) return [start_date, end_date];
    throw new Error('period か、start_date と end_date の両方を指定してください');
  };

  // ================= 読み取り（そのままのAPI） =================
  tool('base_get_shop', 'ショップ（ユーザー）情報を取得する。GET /1/users/me', {},
    () => callApi('GET', '/1/users/me'));

  tool('base_list_items', '商品一覧を1ページ分取得する。GET /1/items。名前で探すなら base_find_items', paging,
    ({ limit, offset, extra }) => callApi('GET', '/1/items', { ...extra, limit, offset }));

  tool('base_get_item', '商品詳細を取得する。GET /1/items/detail/:item_id', { item_id: itemId },
    ({ item_id }) => callApi('GET', `/1/items/detail/${encodeURIComponent(item_id)}`));

  tool('base_list_orders', '注文一覧を1ページ分取得する（要 read_orders）。GET /1/orders。期間集計なら base_sales_summary', paging,
    ({ limit, offset, extra }) => callApi('GET', '/1/orders', { ...extra, limit, offset }));

  tool('base_get_order', '注文詳細を取得する（要 read_orders）。GET /1/orders/detail/:unique_key',
    { unique_key: z.string().describe('注文のユニークキー') },
    ({ unique_key }) => callApi('GET', `/1/orders/detail/${encodeURIComponent(unique_key)}`));

  tool('base_list_categories', 'カテゴリ一覧を取得する。GET /1/categories', {},
    () => callApi('GET', '/1/categories'));

  tool('base_get_item_categories', '商品に紐づくカテゴリを取得する。GET /1/item_categories/detail/:item_id',
    { item_id: itemId },
    ({ item_id }) => callApi('GET', `/1/item_categories/detail/${encodeURIComponent(item_id)}`));

  tool('base_list_savings', '振込申請履歴を取得する（要 read_savings）。GET /1/savings', paging,
    ({ limit, offset, extra }) => callApi('GET', '/1/savings', { ...extra, limit, offset }));

  // ================= 便利ツール =================
  tool('base_today', '今日の日付（日本時間）と、期間の呼び名ごとの開始日・終了日を返す。日付の計算に迷ったらまずこれ', {},
    async () => ({
      today: resolvePeriod('today')[0],
      periods: Object.fromEntries(PERIODS.map((p) => [p, resolvePeriod(p)])),
    }));

  tool('base_find_items',
    '商品名（または品番）の一部で商品を探し、商品ID・価格・在庫・バリエーションIDを返す。' +
    '「◯◯の在庫を変えて」と言われたときなど、商品IDを調べるのに使う。全角/半角・大文字/小文字は区別しない',
    {
      query: z.string().min(1).describe('探す文字（スペース区切りで複数語＝すべて含むもの）'),
      limit: z.number().int().min(1).max(100).optional().describe('最大件数（既定20）'),
    },
    async ({ query, limit = 20 }) => {
      const norm = (s) => String(s ?? '').normalize('NFKC').toLowerCase();
      const words = norm(query).split(/\s+/).filter(Boolean);
      const { list, truncated } = await getAllItems();
      const hits = list.filter((it) => {
        const hay = norm(`${it.title} ${it.identifier ?? ''} ${(it.variations ?? []).map((v) => v.name).join(' ')}`);
        return words.every((w) => hay.includes(w));
      });
      return { query, total_hits: hits.length, truncated, items: hits.slice(0, limit) };
    });

  tool('base_fetch_all_items',
    '全商品をページ送りしながら取得し、ID・名前・価格・在庫・公開状態・バリエーションの要約で返す', {},
    async () => {
      const { list, truncated } = await getAllItems();
      return { count: list.length, truncated, items: list };
    });

  tool('base_low_stock',
    '在庫が閾値以下の商品・バリエーションを一覧にする（売り切れ・補充候補の確認用）',
    {
      threshold: z.number().int().min(0).optional().describe('この数以下を表示（既定3）'),
      include_hidden: z.boolean().optional().describe('非公開商品も含める（既定false）'),
    },
    async ({ threshold = 3, include_hidden = false }) => {
      const { list, truncated } = await getAllItems();
      const rows = [];
      for (const it of list) {
        if (!include_hidden && it.visible !== undefined && Number(it.visible) === 0) continue;
        if (it.variations) {
          for (const v of it.variations) {
            if (v.stock <= threshold) rows.push({ item_id: it.item_id, title: it.title, variation_id: v.variation_id, variation: v.name, stock: v.stock });
          }
        } else if (it.stock <= threshold) {
          rows.push({ item_id: it.item_id, title: it.title, stock: it.stock });
        }
      }
      rows.sort((a, b) => a.stock - b.stock);
      return { threshold, checked_items: list.length, truncated, sold_out: rows.filter((r) => r.stock === 0).length, low_stock: rows };
    });

  tool('base_sales_summary',
    '期間（日本時間）の注文を集計する：注文数・売上合計・客単価・日別（売上0の日も含む）・キャンセル数・未発送数。' +
    'compare で前の期間・前年同期との比較も出せる。include_items=true なら商品別の販売数ランキングも（注文数ぶんAPIを呼ぶ）',
    {
      ...periodArgs,
      compare: z.enum(['previous', 'last_year']).optional().describe('previous=直前の同じ日数 / last_year=前年同期 と比較'),
      include_items: z.boolean().optional().describe('商品別ランキングも出す（既定false）'),
      max_detail_orders: z.number().int().min(1).max(500).optional().describe('include_items時に詳細を読む注文の上限（既定100）'),
    },
    async ({ compare, include_items = false, max_detail_orders = 100, ...range }) => {
      const [start_date, end_date] = pickRange(range);
      const { valid, summary } = await summarize(start_date, end_date);
      const result = { ...summary, note: '売上合計は注文一覧の total（送料・手数料等の内訳はBASE側の定義に依存）。キャンセル注文は除外' };

      if (compare) {
        const [ps, pe] = compare === 'previous'
          ? [addDays(start_date, -summary.period.days), addDays(start_date, -1)]
          : [shiftYear(start_date, -1), shiftYear(end_date, -1)];
        const { summary: prev } = await summarize(ps, pe);
        result.comparison = {
          against: compare,
          period: prev.period,
          orders: prev.orders,
          sales_total: prev.sales_total,
          average_order_value: prev.average_order_value,
          change: {
            orders: summary.orders - prev.orders,
            orders_pct: pctChange(summary.orders, prev.orders),
            sales: summary.sales_total - prev.sales_total,
            sales_pct: pctChange(summary.sales_total, prev.sales_total),
            average_order_value_pct: pctChange(summary.average_order_value, prev.average_order_value),
          },
        };
      }

      if (include_items) {
        const { orders, read } = await fetchLineItems(valid, max_detail_orders);
        result.items_ranking = rankItems(orders);
        result.items_ranking_based_on_orders = read;
      }
      return result;
    });

  tool('base_pending_shipments',
    '未発送の注文（キャンセル除く）を、注文日が古い順に待ち日数つきで一覧にする。発送作業の確認用。' +
    '中身（商品・お届け先）は base_get_order で見る',
    { days: z.number().int().min(1).max(180).optional().describe('何日前までの注文を見るか（既定30）') },
    async ({ days = 30 }) => {
      const [, today] = resolvePeriod('today');
      const { inRange, truncated } = await fetchOrders(addDays(today, -(days - 1)), today);
      const nowSec = Math.floor(now() / 1000);
      const rows = inRange
        .filter((o) => !o[F.order.cancelled] && !o[F.order.dispatched])
        .map((o) => ({
          unique_key: o[F.order.key],
          ordered_at: jstDate(Number(o[F.order.ordered])),
          days_waiting: Math.floor((nowSec - Number(o[F.order.ordered])) / DAY),
          total: Number(o[F.order.total]),
        }))
        .sort((a, b) => b.days_waiting - a.days_waiting);
      return {
        looked_back_days: days,
        pending: rows.length,
        waiting_3_days_or_more: rows.filter((r) => r.days_waiting >= 3).length,
        truncated,
        orders: rows,
        note: '入金待ち（銀行振込・コンビニ払いなど）の注文が含まれる可能性があります。発送前に base_get_order で支払い状況を確認してください',
      };
    });


  tool('base_growth_insights',
    '売上アップの「機会」を実データから洗い出す。期間内の注文と全商品から、' +
    '①売れ筋の在庫切れ・在庫切れ間近（機会損失）②売れていない在庫 ③在庫があるのに非公開 ④一緒に買われている組み合わせ（セット販売候補）' +
    '⑤曜日・時間帯ごとの売れ方 ⑥注文金額の分布とまとめ買い率 を返す。' +
    '各項目の evidence は集計結果（事実）、idea は施策の仮説。仮説を事実として伝えないこと',
    {
      ...periodArgs,
      max_detail_orders: z.number().int().min(1).max(500).optional().describe('明細を読む注文の上限（既定300。注文数ぶんAPIを呼ぶ）'),
    },
    async ({ max_detail_orders = 300, ...range }) => {
      const [start_date, end_date] = range.period || range.start_date ? pickRange(range) : resolvePeriod('last_30_days');
      const { valid, summary } = await summarize(start_date, end_date);
      const [{ orders: detailed, read }, { list: items, truncated: itemsTruncated }] =
        await Promise.all([fetchLineItems(valid, max_detail_orders), getAllItems()]);
      const days = summary.period.days;
      const sampleRatio = valid.length ? read / valid.length : 1;
      const ranking = rankItems(detailed);

      // 商品ごとの販売数（バリエーションをまとめる）
      const soldByItem = new Map();
      for (const r of ranking) {
        const k = String(r.item_id);
        soldByItem.set(k, (soldByItem.get(k) ?? 0) + r.quantity);
      }
      const totalStock = (it) => (it.variations ? it.variations.reduce((a, v) => a + v.stock, 0) : it.stock);
      const isVisible = (it) => it.visible === undefined || Number(it.visible) !== 0;

      // ① 売れ筋の在庫切れ・在庫切れ間近
      const stockout = items.filter(isVisible).map((it) => {
        const sold = soldByItem.get(String(it.item_id)) ?? 0;
        const perDay = sold / sampleRatio / days;
        const stock = totalStock(it);
        return { item_id: it.item_id, title: it.title, sold_in_period: sold, stock, days_of_stock_left: perDay ? Math.round((stock / perDay) * 10) / 10 : null };
      }).filter((r) => r.sold_in_period > 0 && (r.stock === 0 || r.days_of_stock_left < 14))
        .sort((a, b) => a.days_of_stock_left - b.days_of_stock_left);

      // ② 期間中に1つも売れていない公開中の在庫
      const dead = items.filter((it) => isVisible(it) && totalStock(it) > 0 && !soldByItem.has(String(it.item_id)))
        .map((it) => ({ item_id: it.item_id, title: it.title, stock: totalStock(it), price: it.price }))
        .sort((a, b) => b.stock * (b.price || 0) - a.stock * (a.price || 0));

      // ③ 在庫があるのに非公開
      const hidden = items.filter((it) => !isVisible(it) && totalStock(it) > 0)
        .map((it) => ({ item_id: it.item_id, title: it.title, stock: totalStock(it) }));

      // ④ 同じ注文で一緒に買われた組み合わせ
      const pairs = {};
      for (const { lines } of detailed) {
        const ids = [...new Map(lines.map((l) => [String(l.item_id), l.title])).entries()].sort();
        for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
          const k = `${ids[i][0]}|${ids[j][0]}`;
          pairs[k] ??= { items: [ids[i][1], ids[j][1]], item_ids: [ids[i][0], ids[j][0]], orders: 0 };
          pairs[k].orders += 1;
        }
      }
      const bundles = Object.values(pairs).filter((p) => p.orders >= 2).sort((a, b) => b.orders - a.orders).slice(0, 10);

      // ⑤ 曜日・時間帯
      const WD = ['日', '月', '火', '水', '木', '金', '土'];
      const byWd = WD.map((w) => ({ weekday: w, orders: 0, sales: 0 }));
      const byHour = Array.from({ length: 24 }, (_, h) => ({ hour: h, orders: 0 }));
      for (const o of valid) {
        const d = new Date(Number(o[F.order.ordered]) * 1000 + JST_OFFSET_MS);
        byWd[d.getUTCDay()].orders += 1;
        byWd[d.getUTCDay()].sales += Number(o[F.order.total]) || 0;
        byHour[d.getUTCHours()].orders += 1;
      }
      const topHours = [...byHour].sort((a, b) => b.orders - a.orders).filter((h) => h.orders > 0).slice(0, 3);

      // ⑥ 注文金額の分布・まとめ買い率
      const BUCKETS = [[0, 2000], [2000, 4000], [4000, 6000], [6000, 10000], [10000, Infinity]];
      const dist = BUCKETS.map(([lo, hi]) => ({
        range: hi === Infinity ? `${lo}円〜` : `${lo}〜${hi - 1}円`,
        orders: valid.filter((o) => Number(o[F.order.total]) >= lo && Number(o[F.order.total]) < hi).length,
      }));
      const multi = detailed.filter((o) => o.lines.reduce((a, l) => a + l.amount, 0) >= 2).length;

      const opportunities = [];
      if (stockout.length) opportunities.push({
        type: '売れ筋の在庫切れ・在庫切れ間近',
        evidence: `期間中に売れていて、在庫ゼロまたは今のペースで14日以内に無くなる商品が ${stockout.length} 件`,
        idea: '補充・再入荷の優先。売り切れ中なら「再入荷のお知らせ」の告知でお客さんを逃さない（仮説）',
        items: stockout.slice(0, 10),
      });
      if (bundles.length) opportunities.push({
        type: 'セット販売の候補',
        evidence: `同じ注文で2回以上一緒に買われた組み合わせが ${bundles.length} 組`,
        idea: 'セット商品にする、商品説明で「一緒に買われています」と紹介する（仮説）',
        pairs: bundles,
      });
      if (dead.length) opportunities.push({
        type: '動いていない在庫',
        evidence: `公開中・在庫ありで、期間中の販売が0の商品が ${dead.length} 件（在庫金額の大きい順）` +
          (read < valid.length ? `。ただし明細を読んだのは ${read}/${valid.length} 件の注文なので、実際は売れている商品が混じる可能性あり` : ''),
        idea: '写真・商品名・説明の見直し、SNSでの紹介、セット化や期間限定の値引き（仮説。まず原因の見当をつける）',
        items: dead.slice(0, 10),
      });
      if (hidden.length) opportunities.push({
        type: '在庫があるのに非公開',
        evidence: `非公開で在庫ありの商品が ${hidden.length} 件`,
        idea: '意図的でなければ公開する（季節外・訳ありなど理由があるなら除外）',
        items: hidden.slice(0, 10),
      });

      return {
        period: summary.period,
        basis: {
          orders: valid.length,
          orders_with_details_read: read,
          note: read < valid.length ? `明細は ${read}/${valid.length} 件の注文から推計（販売ペースは比率で補正）` : undefined,
          orders_truncated: summary.truncated,
          items_checked: items.length,
          items_truncated: itemsTruncated,
        },
        facts: {
          sales_total: summary.sales_total,
          average_order_value: summary.average_order_value,
          multi_item_order_rate_pct: read ? Math.round((multi / read) * 1000) / 10 : null,
          order_value_distribution: dist,
          by_weekday: byWd,
          top_hours: topHours.map((h) => ({ hour: `${h.hour}時台`, orders: h.orders })),
          top_items: ranking.slice(0, 10),
        },
        opportunities,
        caution: '注文が少ない期間は偶然の偏りが大きい。数十件未満なら傾向として断定しないこと。idea はすべて検証前の仮説',
      };
    });

  // ================= 書き込み（BASE_ALLOW_WRITE=1 のときだけ） =================
  if (allowWrite) {
    const twoStep = async ({ confirm_token, action, key, preview, execute }) => {
      if (!confirm_token) {
        return {
          preview: true,
          action,
          ...preview,
          confirm_token: issueConfirmToken(key),
          next: 'まだ何も変更していません。この内容をユーザーに見せて了承を得てから、同じ引数に confirm_token を付けて再実行してください（10分有効）',
        };
      }
      consumeConfirmToken(confirm_token, key);
      try {
        return { done: true, action, ...(await execute()) };
      } finally {
        invalidateItems();
      }
    };
    const confirmToken = z.string().optional().describe('プレビューで返された確認トークン。なしで呼ぶとプレビューのみ');
    const send = async (action, endpoint, params) => {
      const response = await callApi('POST', endpoint, params);
      await appendWriteLog({ action, endpoint, params });
      return response;
    };

    tool('base_update_stock',
      '在庫数を変更する（POST /1/items/edit_stock）。最大50件をまとめて変更できる。' +
      '各行は stock（その数にする）か add（今の在庫に足す。入荷なら+、減らすなら−）のどちらか。バリエーション商品は variation_id も指定。' +
      '必ずプレビュー→ユーザー確認→confirm_token付き実行の順で使う。商品IDが分からなければ先に base_find_items',
      {
        changes: z.array(z.object({
          item_id: itemId,
          variation_id: z.union([z.string(), z.number()]).optional().describe('バリエーション商品のときだけ'),
          stock: z.number().int().min(0).optional().describe('この在庫数にする'),
          add: z.number().int().optional().describe('今の在庫に足す数（マイナス可）'),
        })).min(1).max(50),
        confirm_token: confirmToken,
      },
      async ({ changes, confirm_token }) => {
        // 毎回最新の在庫を読み直して、送る内容（絶対値）を確定させる
        const { list } = await getAllItems({ fresh: true });
        const byId = new Map(list.map((it) => [String(it.item_id), it]));
        const plan = changes.map((c, i) => {
          const row = `${i + 1}行目（item_id ${c.item_id}）`;
          if ((c.stock === undefined) === (c.add === undefined)) throw new Error(`${row}: stock か add のどちらか一方を指定してください`);
          const it = byId.get(String(c.item_id));
          if (!it) throw new Error(`${row}: 商品が見つかりません`);
          let before;
          if (it.variations) {
            if (c.variation_id === undefined) throw new Error(`${row}:「${it.title}」はバリエーション商品です。variation_id を指定してください（${it.variations.map((v) => `${v.variation_id}=${v.name}`).join(', ')}）`);
            const v = it.variations.find((x) => String(x.variation_id) === String(c.variation_id));
            if (!v) throw new Error(`${row}: variation_id ${c.variation_id} が「${it.title}」にありません`);
            before = v.stock;
          } else {
            if (c.variation_id !== undefined) throw new Error(`${row}:「${it.title}」にバリエーションはありません`);
            before = it.stock;
          }
          const after = c.stock ?? before + c.add;
          if (after < 0) throw new Error(`${row}: 変更後の在庫が ${after} になります（現在 ${before}）`);
          const variation = it.variations?.find((x) => String(x.variation_id) === String(c.variation_id))?.name;
          const params = c.variation_id === undefined
            ? { item_id: it.item_id, stock: after }
            : { item_id: it.item_id, variation_id: c.variation_id, variation_stock: after };
          return { title: it.title, variation, before, after, params };
        });
        return twoStep({
          confirm_token,
          action: '在庫更新',
          key: JSON.stringify(plan.map((p) => p.params)),
          preview: { changes: plan.map(({ title, variation, before, after }) => ({ title, variation, before, after })) },
          execute: async () => {
            const results = [];
            for (const p of plan) {
              try {
                await send('在庫更新', '/1/items/edit_stock', p.params);
                results.push({ title: p.title, variation: p.variation, stock: p.after, ok: true });
              } catch (e) {
                // 途中で失敗したら止める（残りは送らない）
                results.push({ title: p.title, variation: p.variation, ok: false, error: e.message });
                return { results, stopped_at: results.length, not_attempted: plan.length - results.length };
              }
            }
            return { results };
          },
        });
      }, { write: true });

    tool('base_update_item',
      '商品の名前・価格・説明・公開状態を変更する（POST /1/items/edit）。指定した項目だけ送る。' +
      '必ずプレビュー→ユーザー確認→confirm_token付き実行の順で使う',
      {
        item_id: itemId,
        title: z.string().optional(),
        price: z.number().int().min(0).optional().describe('税込価格（円）'),
        detail: z.string().optional().describe('商品説明'),
        visible: z.boolean().optional().describe('true=公開 / false=非公開'),
        confirm_token: confirmToken,
      },
      async ({ item_id, title, price, detail, visible, confirm_token }) => {
        const params = { item_id, title, price, detail, visible: visible === undefined ? undefined : (visible ? 1 : 0) };
        if (Object.values(params).filter((v) => v !== undefined).length === 1) throw new Error('変更する項目を1つ以上指定してください');
        let current;
        if (!confirm_token) {
          const body = await callApi('GET', `/1/items/detail/${encodeURIComponent(item_id)}`);
          current = compactItem(body.item ?? body);
        }
        return twoStep({
          confirm_token, action: '商品情報更新', key: JSON.stringify({ e: 'edit', params }),
          preview: { current, will_send: params },
          execute: async () => ({ response: await send('商品情報更新', '/1/items/edit', params) }),
        });
      }, { write: true });

    tool('base_update_order_status',
      '注文商品のステータスを「発送済み」または「キャンセル」に変更する（POST /1/orders/edit_status）。' +
      'キャンセルは取り消せない可能性が高いので特に慎重に。必ずプレビュー→ユーザー確認→confirm_token付き実行の順で使う',
      {
        unique_key: z.string().describe('注文のユニークキー'),
        order_item_id: z.union([z.string(), z.number()]).describe('注文内の商品ID（注文詳細の order_items にある）'),
        status: z.enum(['dispatched', 'cancelled']).describe('dispatched=発送済み / cancelled=キャンセル'),
        add_comment: z.string().optional().describe('購入者へのコメント（発送連絡など）'),
        confirm_token: confirmToken,
      },
      async ({ unique_key, order_item_id, status, add_comment, confirm_token }) => {
        const params = { unique_key, order_item_id, status, add_comment };
        const action = status === 'dispatched' ? '発送済みにする' : '注文キャンセル';
        return twoStep({
          confirm_token, action, key: JSON.stringify({ e: 'edit_status', params }),
          preview: {
            current: confirm_token ? undefined : await callApi('GET', `/1/orders/detail/${encodeURIComponent(unique_key)}`),
            will_send: params,
          },
          execute: async () => ({ response: await send(action, '/1/orders/edit_status', params) }),
        });
      }, { write: true });
  }

  // ================= 定型の依頼（プロンプト） =================
  const prompt = (name, title, description, text, argsSchema) =>
    server.registerPrompt(name, { title, description, ...(argsSchema ? { argsSchema } : {}) }, (args) => ({
      messages: [{ role: 'user', content: { type: 'text', text: typeof text === 'function' ? text(args) : text } }],
    }));

  prompt('weekly_report', '週次レポート', '先週の売上を前週と比べ、売れ筋・在庫・未発送をまとめる',
    'BASEショップの週次レポートを作ってください。\n' +
    '1. base_sales_summary（period=last_week, compare=previous, include_items=true）で先週の数字と前週比\n' +
    '2. base_low_stock で売り切れ・在庫わずかの商品\n' +
    '3. base_pending_shipments で未発送の注文\n' +
    'まとめ方：最初に3行サマリー、次に数字（売上・注文数・客単価と前週比）、売れ筋トップ5、在庫の注意、未発送の注意、最後に「今週やること」を3つ。' +
    '数字はツールの結果だけを使い、ないものは推測しないこと。');

  prompt('restock_plan', '補充計画', '在庫が少ない商品を、最近の売れ行きと合わせて補充の優先順位をつける',
    ({ threshold }) =>
      `在庫の補充計画を作ってください。\n` +
      `1. base_low_stock（threshold=${threshold || 5}）で在庫が少ない商品\n` +
      `2. base_sales_summary（period=last_30_days, include_items=true）で直近30日の販売数\n` +
      `3. 1日あたりの販売数から「あと何日で売り切れるか」を出し、早い順に並べた表にする\n` +
      '販売実績がない商品はそう明記すること。在庫は変更しないこと（提案だけ）。',
    { threshold: z.string().optional().describe('この在庫数以下を対象（既定5）') });

  prompt('shipping_check', '発送チェック', '未発送の注文を古い順に確認し、今日発送すべきものを洗い出す',
    '未発送の注文を確認してください。\n' +
    '1. base_pending_shipments で未発送注文の一覧\n' +
    '2. 待ち日数が長い順に、上位10件まで base_get_order で中身（商品・支払い状況）を確認\n' +
    '3.「今日発送すべき」「入金待ち」「要確認」に分けて表にする\n' +
    'ステータスの変更はしないこと（確認だけ）。');

  prompt('growth_plan', '売上アップ施策', '実データから売上アップの機会を見つけ、検証できる施策プランにする',
    ({ goal }) =>
      'BASEショップの売上アップ施策を、データにもとづいて考えてください。\n' +
      (goal ? `目標・やりたいこと：${goal}\n` : '') +
      '1. base_today で今日の日付を確認\n' +
      '2. base_sales_summary（period=last_30_days, compare=previous）と（period=last_30_days, compare=last_year）で現在地\n' +
      '3. base_growth_insights（period=last_30_days）で機会を洗い出す。注文が少なければ期間を90日に広げる\n' +
      '4. 次の形でまとめる：\n' +
      '   - FACT：数字で確認できた現状（ツールの結果だけ。推測で補わない）\n' +
      '   - 機会：FACTから見えた伸びしろ上位3つ\n' +
      '   - 施策案（IDEA）：機会ごとに1〜2個。「すぐできる（今日〜1週間）」「準備がいる（1か月）」に分ける\n' +
      '   - 検証プラン：最初に試す1つについて、やること・期間（2週間など）・見る数字（売上／注文数／客単価／対象商品の販売数）・比較方法\n' +
      '   - UNKNOWN：判断に足りない情報（アクセス数、広告、お客さんの声など）と、誰に何を確認すればよいか\n' +
      '在庫や商品の変更はしないこと（提案だけ）。成果を約束する言い方はしないこと。',
    { goal: z.string().optional().describe('目標ややりたいこと（例：客単価を上げたい、新商品を広めたい）') });

  return server;
}
