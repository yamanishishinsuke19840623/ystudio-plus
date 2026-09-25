// 弥生会計「弥生インポート形式」仕訳CSVの読み書き
//
// 列定義は弥生会計サポート情報「仕訳データの項目と記述形式」に基づく想定。
// ※ 実運用前に、お使いの弥生会計（デスクトップ版 / Next）でエクスポートしたCSVと
//   列順が一致するか必ず確認すること（README「要確認事項」参照）。

import fs from "node:fs";
import path from "node:path";
import iconv from "iconv-lite";

export const COLUMNS = [
  "識別フラグ", "伝票No", "決算", "取引日付",
  "借方勘定科目", "借方補助科目", "借方部門", "借方税区分", "借方金額", "借方税金額",
  "貸方勘定科目", "貸方補助科目", "貸方部門", "貸方税区分", "貸方金額", "貸方税金額",
  "摘要", "番号", "期日", "タイプ", "生成元", "仕訳メモ", "付箋1", "付箋2", "調整",
];

// 識別フラグ: 2000=1行の仕訳 / 2110=複合仕訳の先頭行 / 2100=中間行 / 2101=最終行
export const FLAG = { SINGLE: "2000", FIRST: "2110", MIDDLE: "2100", LAST: "2101" };

// ---------- ファイルアクセス（YAYOI_DATA_DIR 配下に限定） ----------

export function dataDir() {
  return path.resolve(process.env.YAYOI_DATA_DIR || process.cwd());
}

export function resolveInDataDir(file) {
  const base = dataDir();
  const full = path.resolve(base, file);
  if (full !== base && !full.startsWith(base + path.sep)) {
    throw new Error(`YAYOI_DATA_DIR（${base}）の外のファイルにはアクセスできません: ${file}`);
  }
  return full;
}

// ---------- CSV ----------

export function decode(buf) {
  if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) return buf.subarray(3).toString("utf8");
  const utf8 = buf.toString("utf8");
  // 不正なUTF-8バイト列が含まれていれば Shift_JIS（弥生の標準）とみなす
  return utf8.includes("�") ? iconv.decode(buf, "Shift_JIS") : utf8;
}

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((v) => v.trim() !== ""));
}

function csvField(v) {
  const s = v == null ? "" : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// ---------- 読み込み ----------

const num = (s) => {
  const n = Number(String(s ?? "").replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
};

export function normalizeDate(s) {
  const m = String(s ?? "").trim().match(/^(\d{4})[\/\-.]?(\d{1,2})[\/\-.]?(\d{1,2})$/);
  if (!m) return String(s ?? "").trim();
  return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
}

/** 弥生インポート形式の行配列 → 仕訳行オブジェクト（1行=借方/貸方1組） */
export function rowsToLines(rows) {
  // 1行目がヘッダー（「識別フラグ」等）ならスキップ
  const body = rows.length && !/^\d+$/.test(rows[0][0]?.trim()) ? rows.slice(1) : rows;
  return body.map((r, idx) => {
    const g = (i) => (r[i] ?? "").trim();
    return {
      row: idx + 1,
      flag: g(0),
      voucherNo: g(1),
      date: normalizeDate(g(3)),
      debit: { account: g(4), subAccount: g(5), department: g(6), taxCategory: g(7), amount: num(g(8)), tax: num(g(9)) },
      credit: { account: g(10), subAccount: g(11), department: g(12), taxCategory: g(13), amount: num(g(14)), tax: num(g(15)) },
      description: g(16),
      memo: g(21),
    };
  });
}

export function readJournal(file) {
  const buf = fs.readFileSync(resolveInDataDir(file));
  return rowsToLines(parseCsv(decode(buf)));
}

export function filterLines(lines, { from, to, account, keyword } = {}) {
  return lines.filter((l) => {
    if (from && l.date < normalizeDate(from)) return false;
    if (to && l.date > normalizeDate(to)) return false;
    if (account && l.debit.account !== account && l.credit.account !== account) return false;
    if (keyword && !`${l.description} ${l.memo}`.includes(keyword)) return false;
    return true;
  });
}

export function summarizeByAccount(lines) {
  const map = new Map();
  const add = (acc, key, amt) => {
    if (!acc) return;
    const s = map.get(acc) ?? { account: acc, debit: 0, credit: 0 };
    s[key] += amt;
    map.set(acc, s);
  };
  for (const l of lines) {
    add(l.debit.account, "debit", l.debit.amount);
    add(l.credit.account, "credit", l.credit.amount);
  }
  return [...map.values()]
    .map((s) => ({ ...s, net: s.debit - s.credit }))
    .sort((a, b) => a.account.localeCompare(b.account, "ja"));
}

export function listAccounts(lines) {
  const map = new Map();
  const add = (side) => {
    if (!side.account) return;
    const e = map.get(side.account) ?? { account: side.account, subAccounts: new Set(), taxCategories: new Set(), count: 0 };
    if (side.subAccount) e.subAccounts.add(side.subAccount);
    if (side.taxCategory) e.taxCategories.add(side.taxCategory);
    e.count++;
    map.set(side.account, e);
  };
  for (const l of lines) { add(l.debit); add(l.credit); }
  return [...map.values()]
    .sort((a, b) => b.count - a.count)
    .map((e) => ({ ...e, subAccounts: [...e.subAccounts], taxCategories: [...e.taxCategories] }));
}

// ---------- 書き出し ----------

/**
 * entries: [{ date, description?, voucherNo?, memo?, lines: [{ debit?, credit? }] }]
 *   debit/credit: { account, subAccount?, department?, taxCategory?, amount, tax? }
 * 1仕訳ごとに借方合計＝貸方合計を検証し、弥生インポート形式の行配列を返す。
 */
export function entriesToRows(entries) {
  const out = [];
  entries.forEach((e, ei) => {
    const label = `仕訳${ei + 1}（${e.date} ${e.description ?? ""}）`;
    if (!e.lines?.length) throw new Error(`${label}: 行がありません`);
    const dt = e.lines.reduce((s, l) => s + (l.debit?.amount ?? 0), 0);
    const ct = e.lines.reduce((s, l) => s + (l.credit?.amount ?? 0), 0);
    if (dt !== ct) throw new Error(`${label}: 借方合計 ${dt} と貸方合計 ${ct} が一致しません`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizeDate(e.date))) throw new Error(`${label}: 日付は YYYY-MM-DD 形式で指定してください`);
    const date = normalizeDate(e.date).replace(/-/g, "/");
    const n = e.lines.length;
    e.lines.forEach((l, i) => {
      const flag = n === 1 ? FLAG.SINGLE : i === 0 ? FLAG.FIRST : i === n - 1 ? FLAG.LAST : FLAG.MIDDLE;
      const side = (s) => s?.account
        ? [s.account, s.subAccount ?? "", s.department ?? "", s.taxCategory ?? "", s.amount, s.tax ?? ""]
        : ["", "", "", "", "", ""];
      out.push([
        flag, e.voucherNo ?? "", "", date,
        ...side(l.debit), ...side(l.credit),
        l.description ?? e.description ?? "", "", "", "0", "", e.memo ?? "", "", "", "no",
      ]);
    });
  });
  return out;
}

export function writeJournalCsv(file, entries, { encoding = "Shift_JIS" } = {}) {
  const rows = entriesToRows(entries);
  const text = rows.map((r) => r.map(csvField).join(",")).join("\r\n") + "\r\n";
  const full = resolveInDataDir(file);
  if (fs.existsSync(full)) throw new Error(`既に存在します（上書きしません）: ${file}`);
  fs.writeFileSync(full, encoding === "UTF-8" ? text : iconv.encode(text, "Shift_JIS"));
  return { path: full, rows: rows.length, entries: entries.length };
}
