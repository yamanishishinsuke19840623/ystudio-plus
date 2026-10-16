// ギフトモールのデータ（月別明細CSV・注文確認メール）を読む部分と、手元への保存
// ギフトモールには出店者向けの公開APIが見つからなかったため、
// 管理画面からダウンロードしたCSVと、注文ごとに届くメールを材料にする。
import { readFile, writeFile, mkdir, readdir, stat } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

// tools/giftmall-mcp/.env があれば読み込む（既に設定済みの環境変数は上書きしない）
try {
  const envPath = process.env.GIFTMALL_ENV_PATH || join(dirname(fileURLToPath(import.meta.url)), '.env');
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined && m[2] !== '') process.env[m[1]] = m[2].replace(/^(["'])(.*)\1$/, '$2');
  }
} catch {}

export const DATA_DIR = process.env.GIFTMALL_DATA_DIR || join(homedir(), '.giftmall-mcp');
const ORDERS_PATH = join(DATA_DIR, 'orders.json');
const SHIPPED_PATH = join(DATA_DIR, 'shipped.json');

// 月別明細CSVを探す場所（; 区切りで複数可）。既定はダウンロードフォルダと DATA_DIR/monthly
export const CSV_DIRS = (process.env.GIFTMALL_CSV_DIRS || [join(homedir(), 'Downloads'), join(DATA_DIR, 'monthly')].join(';'))
  .split(';').map((s) => s.trim()).filter(Boolean);

// ---------------- 文字コードと CSV ----------------
// ギフトモールのCSVは Shift_JIS。Excel で保存し直した UTF-8 にも対応する
export function decodeText(buf) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf).replace(/^﻿/, '');
  } catch {
    return new TextDecoder('shift_jis').decode(buf);
  }
}

export function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const num = (v) => {
  const n = Number(String(v ?? '').replace(/[,￥¥\s円]/g, ''));
  return Number.isFinite(n) ? n : 0;
};

// ---------------- 月別明細CSV（売上集計 > 月別明細ダウンロード） ----------------
// 形式（2022年9月分の実ファイルで確認）：
//   1行目「■YYYY年M月度実績」→ 合計の行（項目名,"金額"）→「■明細」→ 見出し行 → 注文ごとの行 → 注意書き
const DETAIL_COLUMNS = {
  orderNo: '注文番号', title: '商品名', code: '商品コード', shippedAt: '発送日', orderedAt: '受注日',
  payment: '支払い方法', itemsTotal: '商品合計（税込）', optionsTotal: 'オプション合計（税込）',
  subtotal: '小計（税込）', shipping: '送料', fee: 'システム利用料（税込）',
};

export function parseMonthlyCsv(buf, fileName = '') {
  const rows = parseCsv(decodeText(buf));
  const title = rows.find((r) => /^■\d{4}年\d{1,2}月度実績/.test(r[0] ?? ''))?.[0];
  if (!title) {
    throw new Error(`${fileName || 'CSV'} はギフトモールの月別明細ではないようです（1行目に「■YYYY年M月度実績」がありません）`);
  }
  const [, y, m] = title.match(/■(\d{4})年(\d{1,2})月/);
  const month = `${y}-${m.padStart(2, '0')}`;

  const summary = {};
  const headerIdx = rows.findIndex((r) => r[0] === DETAIL_COLUMNS.orderNo);
  for (const r of rows.slice(0, headerIdx < 0 ? rows.length : headerIdx)) {
    if (r[0] && !r[0].startsWith('■') && r[1] !== undefined && r[1] !== '') summary[r[0]] = num(r[1]);
  }
  if (headerIdx < 0) throw new Error(`${fileName}: 「注文番号」から始まる明細の見出し行が見つかりません`);
  const header = rows[headerIdx];
  const missing = Object.values(DETAIL_COLUMNS).filter((c) => !header.includes(c));
  if (missing.length) {
    throw new Error(`${fileName}: 明細に想定した列 ${missing.join('・')} がありません。実際の列: ${header.join('・')}`);
  }
  const col = Object.fromEntries(Object.entries(DETAIL_COLUMNS).map(([k, c]) => [k, header.indexOf(c)]));
  const orders = rows.slice(headerIdx + 1)
    .filter((r) => /^\d+$/.test((r[col.orderNo] ?? '').trim()))
    .map((r) => ({
      order_no: r[col.orderNo].trim(),
      title: r[col.title],
      code: r[col.code],
      ordered_at: r[col.orderedAt],
      shipped_at: r[col.shippedAt],
      payment: r[col.payment],
      items_total: num(r[col.itemsTotal]),
      options_total: num(r[col.optionsTotal]),
      subtotal: num(r[col.subtotal]),
      shipping: num(r[col.shipping]),
      fee: num(r[col.fee]),
    }));

  const pick = (label) => summary[label] ?? null;
  return {
    month,
    file: basename(fileName),
    payout: pick(Object.keys(summary).find((k) => k.includes('お振込合計金額'))),
    payout_label: Object.keys(summary).find((k) => k.includes('お振込合計金額')) ?? null,
    sales_incl_tax: pick('小計（税込）＋送料＋代金引換手数料') ?? pick('小計（税込）'),
    items_total: pick('商品合計（税込）'),
    shipping: pick('送料'),
    system_fee: pick('システム利用料（税込）'),
    other_fees: (pick('その他サービス利用料（税込）') ?? 0) + (pick('お急ぎ便利用料（税込）') ?? 0),
    summary,
    orders,
  };
}

// CSV_DIRS から月別明細を探して読む。同じ月が複数あれば新しいファイルを使う
export async function loadMonthlyReports() {
  const found = new Map();
  const errors = [];
  for (const dir of CSV_DIRS) {
    let names;
    try { names = await readdir(dir); } catch { continue; }
    for (const name of names.filter((n) => /\.csv$/i.test(n) && /giftmall|ギフトモール|monthly/i.test(n))) {
      const path = join(dir, name);
      try {
        const report = parseMonthlyCsv(await readFile(path), name);
        const { mtimeMs } = await stat(path);
        const prev = found.get(report.month);
        if (!prev || prev.mtimeMs < mtimeMs) found.set(report.month, { ...report, path, mtimeMs });
      } catch (e) {
        if (!/月別明細ではない/.test(e.message)) errors.push(e.message);
      }
    }
  }
  const reports = [...found.values()].sort((a, b) => a.month.localeCompare(b.month)).map(({ mtimeMs, ...r }) => r);
  return { reports, errors, searched: CSV_DIRS };
}

// ---------------- 注文確認メール（【ギフトモール】ご注文ありがとうございます） ----------------
// 形式（2026-10-16 に届いた実メールで確認）。お客さまの住所・電話番号は保存しない（都道府県だけ）
const PREFS = /^(北海道|東京都|大阪府|京都府|.{2,3}県)/;
const after = (text, label) => {
  const m = text.match(new RegExp(`${label}\\s*[：:]\\s*([^\\n]*)`));
  return m ? m[1].trim() : '';
};
// 「小　計 ￥ 7,000」のように、コロンなしで金額が続く行
const amountLine = (text, labelRe) => {
  const m = text.match(new RegExp(`^\\s*${labelRe}\\s*[：:]?\\s*[￥¥]\\s*([\\d,]+)`, 'm'));
  return m ? num(m[1]) : 0;
};
const section = (text, start, endRe = /\n■|\n={5,}|\n-{5,}/) => {
  const i = text.indexOf(start);
  if (i < 0) return '';
  const rest = text.slice(i + start.length);
  const end = rest.search(endRe);
  return end < 0 ? rest : rest.slice(0, end);
};

export function parseOrderEmail(body, receivedAt) {
  const text = String(body).replace(/\r\n?/g, '\n').replace(/　/g, ' ');
  const orderNo = (text.match(/■ご注文番号[：:]\s*\n?\s*(\d+)/) ?? [])[1];
  if (!orderNo) throw new Error('「■ご注文番号」が見つかりません。ギフトモールの注文確認メールの本文を渡してください');

  const items = [];
  const itemRe = /商品名[：:]\s*(.+)\n(?:URL[：:].*\n)?商品コード[：:]\s*(\S+)\s*\n数量[：:]\s*(\d+)\s*個?\s*\n金額[：:]\s*[￥¥]?\s*([\d,]+)\s*\n(?:オプション代[：:]\s*[￥¥]?\s*([\d,]+))?/g;
  for (const m of text.matchAll(itemRe)) {
    items.push({ title: m[1].trim(), code: m[2], quantity: num(m[3]), price: num(m[4]), option_price: num(m[5]) });
  }
  if (!items.length) throw new Error(`注文 ${orderNo}: 商品明細（商品名・商品コード・数量・金額）が読み取れません`);

  // オプション内容（のし など）：「・項目 ：\n値」の形
  const options = {};
  for (const block of text.split('■オプション内容').slice(1)) {
    const body2 = block.split(/\n■/)[0];
    for (const m of body2.matchAll(/・(.+?)\s*[：:]\s*\n([^・■\n][^\n]*)?/g)) {
      const value = (m[2] ?? '').trim();
      if (value) options[m[1].trim()] = value;
    }
  }

  const delivery = section(text, '・お届け先');
  const orderer = section(text, '■注文者様情報');
  const prefOf = (s) => (after(s, '住所').match(PREFS) ?? [])[1] ?? null;
  const recipientName = after(delivery, 'お名前').replace(/\s*様$/, '');
  const ordererName = after(orderer, 'お名前').replace(/\s*様$/, '');
  const memo = section(text, 'メモ：', /\n-{5,}|\n■/).trim();

  return {
    order_no: orderNo,
    received_at: receivedAt ?? null,
    payment: after(text, 'ご決済方法'),
    items,
    subtotal: amountLine(text, '小\\s*計'),
    points_used: amountLine(text, 'ポイント使用'),
    shipping: amountLine(text, '送\\s*料'),
    fee: amountLine(text, '手数料'),
    total: num(after(text, 'お支払合計')),
    noshi: options['のし希望'] ?? null,
    options,
    memo: memo || null,
    delivery_date: after(delivery, 'お届け日') || null,
    delivery_time: after(delivery, 'お届け時間') || null,
    delivery_prefecture: prefOf(delivery),
    is_gift: Boolean(recipientName && ordererName && recipientName.replace(/\s/g, '') !== ordererName.replace(/\s/g, '')),
    orderer_name: ordererName || null,
    orderer_email: after(orderer, 'メールアドレス').toLowerCase() || null,
    orderer_prefecture: prefOf(orderer),
  };
}

// ---------------- 手元への保存 ----------------
async function readJson(path, fallback) {
  try { return JSON.parse(await readFile(path, 'utf8')); } catch { return fallback; }
}
async function writeJson(path, data) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(data, null, 2), { mode: 0o600 });
}
export const loadOrders = () => readJson(ORDERS_PATH, {});
export const saveOrders = (o) => writeJson(ORDERS_PATH, o);
export const loadShipped = () => readJson(SHIPPED_PATH, {});
export const saveShipped = (s) => writeJson(SHIPPED_PATH, s);
