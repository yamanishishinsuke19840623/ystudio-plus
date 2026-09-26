// Claude Desktop に yayoi-mcp を登録するセットアップスクリプト
// 使い方: node setup.mjs [CSVフォルダ]   （Windows なら setup.bat をダブルクリック）

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const here = path.dirname(fileURLToPath(import.meta.url));
const server = path.join(here, "server.mjs");
const dataDir = path.resolve(process.argv[2] || path.join(os.homedir(), "Documents", "弥生CSV"));

function configPath() {
  if (process.platform === "win32") return path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), "Claude", "claude_desktop_config.json");
  if (process.platform === "darwin") return path.join(os.homedir(), "Library", "Application Support", "Claude", "claude_desktop_config.json");
  return path.join(os.homedir(), ".config", "Claude", "claude_desktop_config.json");
}

const cfgFile = configPath();
fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(path.dirname(cfgFile), { recursive: true });

let cfg = {};
if (fs.existsSync(cfgFile)) {
  const raw = fs.readFileSync(cfgFile, "utf8").replace(/^﻿/, "");
  try {
    cfg = raw.trim() ? JSON.parse(raw) : {};
  } catch {
    console.error(`設定ファイルの書式が壊れているため中止しました: ${cfgFile}`);
    process.exit(1);
  }
  const backup = `${cfgFile}.bak-${Date.now()}`;
  fs.copyFileSync(cfgFile, backup);
  console.log(`既存の設定をバックアップしました: ${backup}`);
}

cfg.mcpServers ??= {};
cfg.mcpServers.yayoi = {
  command: process.execPath, // node の絶対パス（PATH に依存しない）
  args: [server],
  env: { YAYOI_DATA_DIR: dataDir },
};
fs.writeFileSync(cfgFile, JSON.stringify(cfg, null, 2) + "\n");

// Claude Code が入っていれば、ユーザー全体の設定にも登録する（どのフォルダで開いても使える）
// Windows の claude は npm の claude.cmd。PowerShell の claude.ps1 は実行ポリシーで止まることがあるため cmd 経由で呼ぶ。
// 引数にダブルクォートを含めない（JSON を渡す add-json は使わない）ことで cmd のクォート問題を避ける。
function claude(args) {
  const r = process.platform === "win32"
    ? spawnSync("claude.cmd", args.map((a) => `"${a}"`), { encoding: "utf8", shell: true })
    : spawnSync("claude", args, { encoding: "utf8" });
  return { ok: r.status === 0, msg: (r.stderr || r.stdout || "").trim() };
}

let codeResult = "未インストールのため省略";
if (claude(["--version"]).ok) {
  claude(["mcp", "remove", "yayoi", "--scope", "user"]); // 再実行時の重複登録を避ける
  const add = claude(["mcp", "add", "yayoi", "--scope", "user", "-e", `YAYOI_DATA_DIR=${dataDir}`, "--", process.execPath, server]);
  codeResult = add.ok ? "登録しました（scope: user）" : `登録に失敗: ${add.msg}`;
}

console.log(`
セットアップ完了
  設定ファイル : ${cfgFile}
  Claude Code  : ${codeResult}
  CSVフォルダ  : ${dataDir}

次にやること
  1. 弥生会計の仕訳日記帳を「弥生インポート形式」でエクスポートし、上のCSVフォルダに保存
  2. Claude Desktop なら完全に終了（タスクトレイのアイコンも「終了」）して起動し直す
     Claude Code（VSCode）なら新しい会話を開く
  3. Claude に「弥生のCSV一覧を見せて」と話しかける
`);
