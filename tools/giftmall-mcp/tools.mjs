// ギフトモール MCP のツール定義
// ギフトモール側を変更する手段（API）はないので、すべて読み取りと手元の記録だけ
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  loadMonthlyReports, parseOrderEmail, loadOrders, saveOrders, loadShipped, saveShipped, CSV_DIRS,
} from './giftmall.mjs';

const now = () => (process.env.GIFTMALL_NOW ? Date.parse(process.env.GIFTMALL_NOW) : Date.now());
const DAY_MS = 24 * 60 * 60 * 1000;
const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : null);
const ym = z.string().regex(/^\d{4}-\d{2}$/, 'YYYY-MM 形式で指定してください');

// 月別明細の注文を、注文番号から引けるようにする（発送済みの判定・照合に使う）
async function shippedInReports() {
  const { reports } = await loadMonthlyReports();
  const map = new Map();
  for (const r of reports) for (const o of r.orders) map.set(o.order_no, { month: r.month, ...o });
  return { reports, map };
}

const emailAmount = (o) => o.items.reduce((a, i) => a + i.price * i.quantity + (i.option_price ?? 0), 0);

export function createServer() {
  const server = new McpServer({ name: 'giftmall-shop', version: '0.1.0' });
  const ok = (data) => ({ content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] });
  const fail = (e) => ({ isError: true, content: [{ type: 'text', text: e.message }] });
  const tool = (name, description, inputSchema, run, { readOnly = true } = {}) =>
    server.registerTool(name, {
      description, inputSchema,
      annotations: { readOnlyHint: readOnly, destructiveHint: false, openWorldHint: false },
    }, async (args) => {
      try { return ok(await run(args)); } catch (e) { return fail(e); }
    });

  // ================= 月別明細CSV =================
  tool('giftmall_monthly_reports',
    'ギフトモールの月別明細CSV（管理画面「売上集計 > 月別明細ダウンロード」）を読み、月ごとの売上・システム利用料・利用料率・振込額・件数・客単価を一覧にする。' +
    'CSVはダウンロードフォルダなど GIFTMALL_CSV_DIRS の場所から自動で探す。明細は「その月に発送済みにした注文」だけが対象', {},
    async () => {
      const { reports, errors, searched } = await loadMonthlyReports();
      if (!reports.length) {
        return {
          months: [], searched, errors,
          next: '月別明細CSVが見つかりません。ギフトモール管理画面「売上集計 > 月別明細ダウンロード」からCSVをダウンロードし、上の場所に置いてください',
        };
      }
      return {
        months: reports.map((r) => ({
          month: r.month,
          orders: r.orders.length,
          sales_incl_tax: r.sales_incl_tax,
          average_order_value: r.orders.length ? Math.round(r.sales_incl_tax / r.orders.length) : null,
          system_fee: r.system_fee,
          system_fee_rate_pct: pct(r.system_fee, r.sales_incl_tax),
          other_fees: r.other_fees,
          payout: r.payout,
          payout_label: r.payout_label,
          file: r.file,
        })),
        errors,
        note: '発送済みにした月で計上される（受注月ではない）。振込はギフトモールの案内で「月末締め翌月末支払」',
      };
    });

  tool('giftmall_month_detail',
    '1か月分の月別明細：合計（振込額・売上・システム利用料など）、注文ごとの明細、商品別の売れ行き',
    { month: ym.describe('対象月 YYYY-MM') },
    async ({ month }) => {
      const { reports } = await loadMonthlyReports();
      const r = reports.find((x) => x.month === month);
      if (!r) throw new Error(`${month} の月別明細CSVが見つかりません。あるのは ${reports.map((x) => x.month).join('、') || 'なし'} です`);
      const byCode = {};
      for (const o of r.orders) {
        byCode[o.code] ??= { code: o.code, title: o.title, orders: 0, sales: 0, fee: 0 };
        byCode[o.code].orders += 1;
        byCode[o.code].sales += o.subtotal;
        byCode[o.code].fee += o.fee;
      }
      return {
        month, file: r.file,
        summary: r.summary,
        system_fee_rate_pct: pct(r.system_fee, r.sales_incl_tax),
        items: Object.values(byCode).sort((a, b) => b.sales - a.sales),
        orders: r.orders,
      };
    });

  tool('giftmall_item_ranking',
    '複数月の月別明細をまとめて、商品（商品コード）ごとの注文数・売上・システム利用料を出す',
    { from_month: ym.optional(), to_month: ym.optional() },
    async ({ from_month, to_month }) => {
      const { reports } = await loadMonthlyReports();
      const inRange = reports.filter((r) => (!from_month || r.month >= from_month) && (!to_month || r.month <= to_month));
      const byCode = {};
      for (const r of inRange) {
        for (const o of r.orders) {
          byCode[o.code] ??= { code: o.code, title: o.title, orders: 0, sales: 0, fee: 0, months: new Set() };
          Object.assign(byCode[o.code], { title: o.title });
          byCode[o.code].orders += 1;
          byCode[o.code].sales += o.subtotal;
          byCode[o.code].fee += o.fee;
          byCode[o.code].months.add(r.month);
        }
      }
      return {
        months: inRange.map((r) => r.month),
        items: Object.values(byCode).sort((a, b) => b.sales - a.sales)
          .map(({ months, ...i }) => ({ ...i, sold_in_months: [...months].sort() })),
      };
    });

  // ================= 注文確認メール =================
  tool('giftmall_add_order_emails',
    'ギフトモールの注文確認メール（差出人 oiwai@giftmall.co.jp、件名「【ギフトモール】ご注文ありがとうございます」）の本文を読み取り、手元に記録する。' +
    '最大50通。同じ注文番号は上書き。住所・電話番号は保存しない（都道府県だけ）。Gmail ツールで本文を取得してから渡す',
    {
      emails: z.array(z.object({
        body: z.string().min(1).describe('メール本文（プレーンテキスト）'),
        received_at: z.string().optional().describe('メールの受信日時（ISO 8601）'),
      })).min(1).max(50),
    },
    async ({ emails }) => {
      const orders = await loadOrders();
      const results = [];
      for (const [i, e] of emails.entries()) {
        try {
          const o = parseOrderEmail(e.body, e.received_at);
          const existed = Boolean(orders[o.order_no]);
          orders[o.order_no] = o;
          results.push({
            order_no: o.order_no, status: existed ? '更新' : '新規',
            items: o.items.map((x) => `${x.title.slice(0, 30)}×${x.quantity}`),
            total: o.total, noshi: o.noshi, memo: o.memo, delivery_date: o.delivery_date,
          });
        } catch (err) {
          results.push({ index: i + 1, status: '読み取れず', error: err.message });
        }
      }
      await saveOrders(orders);
      return {
        added: results.filter((r) => r.status === '新規').length,
        updated: results.filter((r) => r.status === '更新').length,
        failed: results.filter((r) => r.status === '読み取れず').length,
        stored_orders: Object.keys(orders).length,
        results,
      };
    }, { readOnly: false });

  tool('giftmall_open_orders',
    'まだ発送していない（と思われる）ギフトモールの注文を、古い順に出荷準備リストにする。のし・メモ（「価格のわかるものを入れない」など）・お届け日時を必ず見せる。' +
    '発送済みの判定は「月別明細CSVに載っている」か「giftmall_mark_shipped で手元に記録した」もの。ギフトモール管理画面の対応状況とは連動しない',
    { days: z.number().int().min(1).max(365).optional().describe('何日前までの注文を見るか（既定60）') },
    async ({ days = 60 }) => {
      const [orders, shipped, { map }] = await Promise.all([loadOrders(), loadShipped(), shippedInReports()]);
      const since = now() - days * DAY_MS;
      const rows = Object.values(orders)
        .filter((o) => !map.has(o.order_no) && !shipped[o.order_no])
        .filter((o) => !o.received_at || Date.parse(o.received_at) >= since)
        .sort((a, b) => String(a.received_at).localeCompare(String(b.received_at)))
        .map((o) => ({
          order_no: o.order_no,
          received_at: o.received_at,
          days_waiting: o.received_at ? Math.floor((now() - Date.parse(o.received_at)) / DAY_MS) : null,
          items: o.items.map((x) => ({ code: x.code, title: x.title, quantity: x.quantity })),
          noshi: o.noshi,
          options: o.options,
          memo: o.memo,
          delivery_date: o.delivery_date,
          delivery_time: o.delivery_time,
          delivery_prefecture: o.delivery_prefecture,
          is_gift: o.is_gift,
        }));
      return {
        open_orders: rows.length,
        with_memo: rows.filter((r) => r.memo).length,
        with_noshi: rows.filter((r) => r.noshi).length,
        orders: rows,
        note: '送り状の作成や発送済みの登録はギフトモール管理画面で行ってください。ここでの発送済みは手元の記録だけです',
      };
    });

  tool('giftmall_mark_shipped',
    '注文を「発送済み」として手元に記録する（出荷準備リストから外すため）。ギフトモール側の状態は変わらない。unmark=true で取り消し',
    {
      order_nos: z.array(z.string().regex(/^\d+$/)).min(1).max(100),
      unmark: z.boolean().optional(),
    },
    async ({ order_nos, unmark = false }) => {
      const shipped = await loadShipped();
      for (const no of order_nos) {
        if (unmark) delete shipped[no];
        else shipped[no] = new Date(now()).toISOString();
      }
      await saveShipped(shipped);
      return { done: true, unmark, order_nos, note: 'ギフトモール管理画面の対応状況は別途「発送済み」にしてください（月別明細はそれを基に作られます）' };
    }, { readOnly: false });

  tool('giftmall_reconcile',
    '月別明細CSVと、手元に記録した注文メールを突き合わせる。金額の食い違い、メールにない注文、システム利用料率が他と違う注文を出す。' +
    'ギフトモールの案内では、明細に相違があれば案内メール受領後2営業日以内に sd@giftmall.co.jp へ連絡が必要',
    { month: ym.describe('照合する月 YYYY-MM') },
    async ({ month }) => {
      const [{ reports }, orders] = await Promise.all([shippedInReports(), loadOrders()]);
      const r = reports.find((x) => x.month === month);
      if (!r) throw new Error(`${month} の月別明細CSVが見つかりません`);
      const rates = r.orders.filter((o) => o.subtotal > 0).map((o) => o.fee / o.subtotal).sort((a, b) => a - b);
      const median = rates.length ? rates[Math.floor(rates.length / 2)] : 0;
      const mismatches = [], notInEmails = [], feeOutliers = [];
      for (const o of r.orders) {
        const mail = orders[o.order_no];
        if (!mail) notInEmails.push({ order_no: o.order_no, title: o.title, subtotal: o.subtotal });
        else {
          const expected = emailAmount(mail);
          const actual = o.items_total + o.options_total;
          if (expected !== actual) mismatches.push({ order_no: o.order_no, title: o.title, email_amount: expected, csv_amount: actual, diff: actual - expected });
        }
        const rate = o.subtotal ? o.fee / o.subtotal : 0;
        if (median && Math.abs(rate - median) > 0.01) {
          feeOutliers.push({ order_no: o.order_no, title: o.title, subtotal: o.subtotal, fee: o.fee, rate_pct: pct(o.fee, o.subtotal), median_rate_pct: Math.round(median * 1000) / 10 });
        }
      }
      return {
        month,
        csv_orders: r.orders.length,
        matched_with_emails: r.orders.length - notInEmails.length,
        amount_mismatches: mismatches,
        csv_orders_without_email: notInEmails,
        fee_rate_outliers: feeOutliers,
        verdict: mismatches.length || feeOutliers.length
          ? '確認が必要な注文があります。相違ならギフトモールの案内メール受領後2営業日以内に sd@giftmall.co.jp へ連絡'
          : notInEmails.length ? '金額の食い違いはなし。ただしメールを取り込んでいない注文があるので、それらは照合できていません' : '食い違いは見つかりませんでした',
        note: '注文メールの金額は「単価×数量＋オプション代」。ポイント利用はお客さま側の値引きで、明細の商品合計には影響しない想定（未確認）',
      };
    });

  tool('giftmall_customers',
    '手元に記録した注文メールから、注文者（メールアドレス）ごとの回数・金額・贈り物の割合・のしの種類を出す。リピーターや法人ギフトの把握用。' +
    '結果に個人情報（名前・メール）が含まれるので外部に共有しないこと',
    { limit: z.number().int().min(1).max(200).optional() },
    async ({ limit = 30 }) => {
      const orders = Object.values(await loadOrders());
      const byEmail = {};
      for (const o of orders) {
        const key = o.orderer_email || `(メールなし)${o.order_no}`;
        byEmail[key] ??= { email: o.orderer_email, name: o.orderer_name, prefecture: o.orderer_prefecture, orders: 0, total: 0, gifts: 0, noshi: {}, last_order: null };
        const c = byEmail[key];
        c.orders += 1;
        c.total += o.total;
        if (o.is_gift) c.gifts += 1;
        if (o.noshi) c.noshi[o.noshi] = (c.noshi[o.noshi] ?? 0) + 1;
        if (!c.last_order || String(o.received_at) > c.last_order) c.last_order = o.received_at;
      }
      const list = Object.values(byEmail).sort((a, b) => b.total - a.total);
      const noshiAll = {};
      for (const o of orders) if (o.noshi) noshiAll[o.noshi] = (noshiAll[o.noshi] ?? 0) + 1;
      return {
        orders: orders.length,
        customers: list.length,
        repeaters: list.filter((c) => c.orders >= 2).length,
        gift_order_rate_pct: pct(orders.filter((o) => o.is_gift).length, orders.length),
        noshi_types: noshiAll,
        top_customers: list.slice(0, limit),
        note: '取り込んだメールの範囲だけの集計。贈り物＝注文者とお届け先の名前が違う注文',
      };
    });

  // ================= 定型の依頼 =================
  const prompt = (name, title, description, text, argsSchema) =>
    server.registerPrompt(name, { title, description, ...(argsSchema ? { argsSchema } : {}) }, (args) => ({
      messages: [{ role: 'user', content: { type: 'text', text: text(args ?? {}) } }],
    }));

  prompt('giftmall_sync_orders', 'ギフトモール注文の取り込み', 'Gmailから注文確認メールを取り込み、出荷準備リストを作る',
    ({ days }) =>
      `ギフトモールの新しい注文を取り込んで、出荷準備リストを作ってください。\n` +
      `1. Gmail で「from:oiwai@giftmall.co.jp subject:ご注文ありがとうございます newer_than:${days || 14}d」を検索\n` +
      '2. 各スレッドを本文（プレーンテキスト）で取得し、本文と受信日時を giftmall_add_order_emails に渡す（20通ずつ）\n' +
      '3. giftmall_open_orders で出荷準備リストを作り、古い順に表で見せる。のし・メモ・お届け日時は必ず目立たせる（例：「価格のわかるものを入れない」）\n' +
      '4. 読み取れなかったメールがあれば件名と理由を伝える\n' +
      'お客さまの住所・電話番号は会話に書き出さないこと。発送済みの登録はギフトモール管理画面で行うよう伝える。',
    { days: z.string().optional().describe('何日前までのメールを見るか（既定14）') });

  prompt('giftmall_monthly_close', 'ギフトモール月次の確認', '月別明細を読み、注文メールと照合して、相違があれば連絡の下書きを作る',
    ({ month }) =>
      `ギフトモールの月次確認をしてください${month ? `（対象：${month}）` : '（対象：先月）'}。\n` +
      '1. giftmall_monthly_reports で月別明細CSVがあるか確認。なければ「ギフトモール管理画面 売上集計 > 月別明細ダウンロード からCSVをダウンロードしてください」と伝えて止まる\n' +
      '2. 先に giftmall_sync_orders と同じ手順で、対象月の前後の注文メールを取り込む\n' +
      '3. giftmall_reconcile で照合し、売上・システム利用料・利用料率・振込額と、確認が必要な注文を表にする\n' +
      '4. 相違があれば sd@giftmall.co.jp 宛ての問い合わせ文を下書きする（Gmail の下書きまで。送信はしない）。期限は案内メール受領後2営業日以内と伝える\n' +
      '5. 前の月と比べた変化（件数・客単価・利用料率）を3行でまとめる。数字はツールの結果だけを使う',
    { month: z.string().optional().describe('対象月 YYYY-MM（既定は先月）') });

  return server;
}

export { CSV_DIRS };
