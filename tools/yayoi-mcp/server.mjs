#!/usr/bin/env node
// 弥生会計 MCP サーバー（stdio）
// 弥生会計からエクスポートした仕訳CSVを読み、インポート用CSVを作る。
// 弥生会計本体には直接書き込まない（取り込みは人が弥生の画面で行う）。

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import fs from "node:fs";
import {
  dataDir, readJournal, filterLines, summarizeByAccount, listAccounts, writeJournalCsv,
} from "./yayoi.mjs";

const server = new McpServer({ name: "yayoi-mcp", version: "0.1.0" });

const json = (data) => ({ content: [{ type: "text", text: JSON.stringify(data, null, 2) }] });

const fileArg = z.string().describe("YAYOI_DATA_DIR からの相対パス（例: 仕訳日記帳_2026.csv）");
const filterArgs = {
  from: z.string().optional().describe("開始日 YYYY-MM-DD"),
  to: z.string().optional().describe("終了日 YYYY-MM-DD"),
  account: z.string().optional().describe("勘定科目名（借方・貸方どちらかに一致）"),
  keyword: z.string().optional().describe("摘要・仕訳メモに含まれる文字"),
};

server.tool(
  "list_files",
  "YAYOI_DATA_DIR にあるCSVファイルの一覧を返す",
  {},
  async () => json({
    dataDir: dataDir(),
    files: fs.readdirSync(dataDir()).filter((f) => /\.(csv|txt)$/i.test(f)),
  }),
);

server.tool(
  "read_journal",
  "弥生会計からエクスポートした仕訳CSV（弥生インポート形式）を読み、条件で絞り込んだ仕訳を返す",
  { file: fileArg, ...filterArgs, limit: z.number().int().positive().default(200) },
  async ({ file, limit, ...f }) => {
    const lines = filterLines(readJournal(file), f);
    return json({ total: lines.length, returned: Math.min(limit, lines.length), lines: lines.slice(0, limit) });
  },
);

server.tool(
  "summarize_by_account",
  "仕訳CSVを勘定科目ごとに集計（借方合計・貸方合計・差額）する",
  { file: fileArg, ...filterArgs },
  async ({ file, ...f }) => json(summarizeByAccount(filterLines(readJournal(file), f))),
);

server.tool(
  "list_accounts",
  "仕訳CSVに登場する勘定科目・補助科目・税区分の一覧を返す。新しい仕訳を作る前に、弥生側に存在する名称を確認するために使う",
  { file: fileArg },
  async ({ file }) => json(listAccounts(readJournal(file))),
);

const side = z.object({
  account: z.string().describe("勘定科目（弥生に登録済みの名称と完全一致させる）"),
  subAccount: z.string().optional(),
  department: z.string().optional(),
  taxCategory: z.string().optional().describe("税区分（例: 課対仕入10%）。list_accounts で既存の表記を確認"),
  amount: z.number().int().nonnegative(),
  tax: z.number().int().nonnegative().optional(),
});

server.tool(
  "create_import_csv",
  "仕訳データから弥生会計に取り込める「弥生インポート形式」CSVを新規作成する。貸借一致を検証し、既存ファイルは上書きしない。弥生への取り込みは人が行う",
  {
    file: fileArg.describe("出力ファイル名（YAYOI_DATA_DIR 配下、既存ファイル不可）"),
    encoding: z.enum(["Shift_JIS", "UTF-8"]).default("Shift_JIS"),
    entries: z.array(z.object({
      date: z.string().describe("取引日 YYYY-MM-DD"),
      description: z.string().optional().describe("摘要"),
      voucherNo: z.string().optional(),
      memo: z.string().optional(),
      lines: z.array(z.object({
        debit: side.optional(),
        credit: side.optional(),
        description: z.string().optional(),
      })).min(1).describe("1行なら通常仕訳、複数行なら複合仕訳"),
    })).min(1),
  },
  async ({ file, encoding, entries }) => json(writeJournalCsv(file, entries, { encoding })),
);

await server.connect(new StdioServerTransport());
