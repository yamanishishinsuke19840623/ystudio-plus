import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import iconv from "iconv-lite";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yayoi-"));
process.env.YAYOI_DATA_DIR = dir;
const y = await import("../yayoi.mjs");

const entries = [
  { date: "2026-04-01", description: "文具購入", lines: [{ debit: { account: "消耗品費", taxCategory: "課対仕入10%", amount: 1100 }, credit: { account: "現金", amount: 1100 } }] },
  { date: "2026-04-10", description: "売上入金（手数料差引）", lines: [
    { debit: { account: "普通預金", subAccount: "山口銀行", amount: 9670 }, credit: { account: "売掛金", amount: 10000 } },
    { debit: { account: "支払手数料", amount: 330 } },
  ] },
];

test("書き出し→読み込みの往復（Shift_JIS）", () => {
  y.writeJournalCsv("out.csv", entries);
  const raw = iconv.decode(fs.readFileSync(path.join(dir, "out.csv")), "Shift_JIS");
  const first = raw.split("\r\n")[0].split(",");
  assert.equal(first.length, 25);
  assert.equal(first[0], "2000");
  assert.equal(first[3], "2026/04/01");
  const lines = y.readJournal("out.csv");
  assert.deepEqual(lines.map((l) => l.flag), ["2000", "2110", "2101"]);
  assert.equal(lines[1].debit.subAccount, "山口銀行");
  assert.equal(lines[2].debit.account, "支払手数料");
});

test("集計と絞り込み", () => {
  const lines = y.readJournal("out.csv");
  const s = Object.fromEntries(y.summarizeByAccount(lines).map((r) => [r.account, r]));
  assert.equal(s["売掛金"].credit, 10000);
  assert.equal(s["現金"].net, -1100);
  assert.equal(y.filterLines(lines, { from: "2026-04-05" }).length, 2);
  assert.equal(y.filterLines(lines, { keyword: "文具" }).length, 1);
  assert.equal(y.listAccounts(lines)[0].count, 1);
});

test("貸借不一致・上書き・ディレクトリ外は拒否", () => {
  assert.throws(() => y.entriesToRows([{ date: "2026-04-01", lines: [{ debit: { account: "現金", amount: 1 }, credit: { account: "売上高", amount: 2 } }] }]), /一致しません/);
  assert.throws(() => y.writeJournalCsv("out.csv", entries), /上書きしません/);
  assert.throws(() => y.readJournal("../etc/passwd"), /外のファイル/);
});

test("ヘッダー行つきUTF-8(BOM)も読める", () => {
  fs.writeFileSync(path.join(dir, "h.csv"), "﻿" + y.COLUMNS.join(",") + "\r\n2000,,,2026/5/3,現金,,,,500,,売上高,,,,500,,\"摘要, カンマ\",,,0,,,,,no\r\n");
  const [l] = y.readJournal("h.csv");
  assert.equal(l.date, "2026-05-03");
  assert.equal(l.description, "摘要, カンマ");
});
