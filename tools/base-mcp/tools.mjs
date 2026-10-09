// MCPツール定義（stdio版・HTTP版で共通）
import { randomBytes } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { callApi, fetchAllPages, appendWriteLog } from './base-client.mjs';

// ここで参照するレスポンスの項目名は、BASE API ドキュメントを実アカウントで未検証。
// 項目が見つからないときは推測で計算せずエラーにする（requireFields）。
const F = {
  item: { id: 'item_id', title: 'title', price: 'price', stock: 'stock', visible: 'visible', variations: 'variations' },
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

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const jstDate = (unixSec) => new Date(unixSec * 1000 + JST_OFFSET_MS).toISOString().slice(0, 10);
const jstStartUnix = (ymd) => Math.floor((Date.parse(`${ymd}T00:00:00Z`) - JST_OFFSET_MS) / 1000);
const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD 形式で指定してください');

// 書き込みは「プレビュー → confirm_token 付きで実行」の2段階にする
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
    throw new Error('confirm_token が無効です（期限切れ・内容が変わった・未プレビュー）。もう一度 confirm_token なしで呼んでプレビューからやり直してください');
  }
}

export function createServer({ allowWrite = process.env.BASE_ALLOW_WRITE === '1' } = {}) {
  const server = new McpServer({ name: 'base-shop', version: '0.2.0' });

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

  // ================= 読み取り（そのままのAPI） =================
  tool('base_get_shop', 'ショップ（ユーザー）情報を取得する。GET /1/users/me', {},
    () => callApi('GET', '/1/users/me'));

  tool('base_list_items', '商品一覧を1ページ分取得する。GET /1/items。全件なら base_fetch_all_items', paging,
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

  // ================= 集計 =================
  const compactItem = (it) => {
    requireFields(it, [F.item.id, F.item.title, F.item.stock], '商品データ');
    const variations = (it[F.item.variations] ?? []).map((v) => ({
      variation_id: v[F.variation.id], name: v[F.variation.name], stock: v[F.variation.stock],
    }));
    return {
      item_id: it[F.item.id], title: it[F.item.title], price: it[F.item.price],
      stock: it[F.item.stock], visible: it[F.item.visible],
      ...(variations.length ? { variations } : {}),
    };
  };

  tool('base_fetch_all_items',
    '全商品をページ送りしながら取得し、ID・名前・価格・在庫・公開状態・バリエーションの要約で返す',
    { max_pages: z.number().int().min(1).max(50).optional().describe('最大ページ数（1ページ100件、既定20）') },
    async ({ max_pages = 20 }) => {
      const { list, truncated } = await fetchAllPages('/1/items', 'items', {}, { maxPages: max_pages });
      return { count: list.length, truncated, items: list.map(compactItem) };
    });

  tool('base_low_stock',
    '在庫が閾値以下の商品・バリエーションを一覧にする（売り切れ・補充候補の確認用）',
    {
      threshold: z.number().int().min(0).optional().describe('この数以下を表示（既定3）'),
      include_hidden: z.boolean().optional().describe('非公開商品も含める（既定false）'),
    },
    async ({ threshold = 3, include_hidden = false }) => {
      const { list, truncated } = await fetchAllPages('/1/items', 'items');
      const rows = [];
      for (const it of list.map(compactItem)) {
        if (!include_hidden && it.visible !== undefined && Number(it.visible) === 0) continue;
        if (it.variations) {
          for (const v of it.variations) {
            if (Number(v.stock) <= threshold) rows.push({ item_id: it.item_id, title: it.title, variation_id: v.variation_id, variation: v.name, stock: Number(v.stock) });
          }
        } else if (Number(it.stock) <= threshold) {
          rows.push({ item_id: it.item_id, title: it.title, stock: Number(it.stock) });
        }
      }
      rows.sort((a, b) => a.stock - b.stock);
      return { threshold, checked_items: list.length, truncated, low_stock: rows };
    });

  tool('base_sales_summary',
    '期間（日本時間）の注文を集計する：注文数・売上合計・日別・キャンセル数。' +
    'include_items=true なら注文詳細も読み、商品別の販売数ランキングを出す（API呼び出しが注文数ぶん増える）',
    {
      start_date: ymd.describe('開始日 YYYY-MM-DD（日本時間・この日を含む）'),
      end_date: ymd.describe('終了日 YYYY-MM-DD（日本時間・この日を含む）'),
      include_items: z.boolean().optional().describe('商品別ランキングも出す（既定false）'),
      max_detail_orders: z.number().int().min(1).max(500).optional().describe('include_items時に詳細を読む注文の上限（既定100）'),
    },
    async ({ start_date, end_date, include_items = false, max_detail_orders = 100 }) => {
      const from = jstStartUnix(start_date);
      const to = jstStartUnix(end_date) + 24 * 60 * 60; // 終了日の翌0時（含まない）
      if (to <= from) throw new Error('end_date は start_date 以降にしてください');

      // 期間クエリはAPIにも渡すが、効かなかった場合に備えて手元でも ordered で絞り込む
      const { list, truncated } = await fetchAllPages('/1/orders', 'orders', {
        start_ordered: `${start_date} 00:00:00`,
        end_ordered: `${end_date} 23:59:59`,
      });
      if (list[0]) requireFields(list[0], [F.order.key, F.order.ordered, F.order.total], '注文データ');

      const inRange = list.filter((o) => Number(o[F.order.ordered]) >= from && Number(o[F.order.ordered]) < to);
      const valid = inRange.filter((o) => !o[F.order.cancelled]);
      const cancelled = inRange.length - valid.length;

      const daily = {};
      for (const o of valid) {
        const d = jstDate(Number(o[F.order.ordered]));
        daily[d] ??= { orders: 0, sales: 0 };
        daily[d].orders += 1;
        daily[d].sales += Number(o[F.order.total]) || 0;
      }
      const sales = valid.reduce((s, o) => s + (Number(o[F.order.total]) || 0), 0);

      const result = {
        period: { start_date, end_date, timezone: 'Asia/Tokyo' },
        orders: valid.length,
        sales_total: sales,
        average_order_value: valid.length ? Math.round(sales / valid.length) : 0,
        cancelled_orders: cancelled,
        undispatched_orders: valid.filter((o) => !o[F.order.dispatched]).length,
        daily: Object.entries(daily).sort().map(([date, v]) => ({ date, ...v })),
        truncated,
        note: '売上合計は注文一覧の total（送料・手数料等の内訳はBASE側の定義に依存）。キャンセル注文は除外',
      };

      if (include_items) {
        const targets = valid.slice(0, max_detail_orders);
        const byItem = {};
        for (const o of targets) {
          const detail = await callApi('GET', `/1/orders/detail/${encodeURIComponent(o[F.order.key])}`);
          const order = detail.order ?? detail;
          for (const li of order[F.orderDetail.items] ?? []) {
            const key = `${li.item_id}:${li.variation ?? ''}`;
            byItem[key] ??= { item_id: li.item_id, title: li.title, variation: li.variation || undefined, quantity: 0, sales: 0 };
            byItem[key].quantity += Number(li.amount) || 0;
            byItem[key].sales += Number(li.total ?? (li.price * li.amount)) || 0;
          }
        }
        result.items_ranking = Object.values(byItem).sort((a, b) => b.quantity - a.quantity);
        result.items_ranking_based_on_orders = targets.length;
      }
      return result;
    });

  // ================= 書き込み（BASE_ALLOW_WRITE=1 のときだけ） =================
  if (allowWrite) {
    // 1回目: 現在値と変更内容を返す（まだ変更しない）。2回目: confirm_token 付きで実行
    const twoStep = async ({ confirm_token, action, endpoint, params, current }) => {
      const key = JSON.stringify({ endpoint, params });
      if (!confirm_token) {
        return {
          preview: true,
          action,
          current,
          will_send: { endpoint, params },
          confirm_token: issueConfirmToken(key),
          next: 'まだ何も変更していません。この内容をユーザーに見せて了承を得てから、同じ引数に confirm_token を付けて再実行してください（10分有効）',
        };
      }
      consumeConfirmToken(confirm_token, key);
      const response = await callApi('POST', endpoint, params);
      await appendWriteLog({ action, endpoint, params });
      return { done: true, action, response };
    };
    const confirmToken = z.string().optional().describe('プレビューで返された確認トークン。なしで呼ぶとプレビューのみ');
    const getItem = async (id) => {
      const body = await callApi('GET', `/1/items/detail/${encodeURIComponent(id)}`);
      return compactItem(body.item ?? body);
    };

    tool('base_update_stock',
      '在庫数を変更する（POST /1/items/edit_stock）。バリエーション商品は variation_id と variation_stock を指定。' +
      '必ずプレビュー→ユーザー確認→confirm_token付き実行の順で使う',
      {
        item_id: itemId,
        stock: z.number().int().min(0).optional().describe('在庫数（バリエーションなし商品）'),
        variation_id: z.union([z.string(), z.number()]).optional(),
        variation_stock: z.number().int().min(0).optional().describe('バリエーションの在庫数'),
        confirm_token: confirmToken,
      },
      async ({ item_id, stock, variation_id, variation_stock, confirm_token }) => {
        if (stock === undefined && variation_stock === undefined) throw new Error('stock か variation_stock のどちらかを指定してください');
        if ((variation_id === undefined) !== (variation_stock === undefined)) throw new Error('variation_id と variation_stock はセットで指定してください');
        return twoStep({
          confirm_token, action: '在庫更新', endpoint: '/1/items/edit_stock',
          params: { item_id, stock, variation_id, variation_stock },
          current: confirm_token ? undefined : await getItem(item_id),
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
        return twoStep({
          confirm_token, action: '商品情報更新', endpoint: '/1/items/edit', params,
          current: confirm_token ? undefined : await getItem(item_id),
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
      async ({ unique_key, order_item_id, status, add_comment, confirm_token }) => twoStep({
        confirm_token,
        action: status === 'dispatched' ? '発送済みにする' : '注文キャンセル',
        endpoint: '/1/orders/edit_status',
        params: { unique_key, order_item_id, status, add_comment },
        current: confirm_token ? undefined : await callApi('GET', `/1/orders/detail/${encodeURIComponent(unique_key)}`),
      }), { write: true });
  }

  return server;
}
