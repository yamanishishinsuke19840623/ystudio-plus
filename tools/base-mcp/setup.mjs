#!/usr/bin/env node
// はじめての人向け：これ1つで「設定 → BASEで許可 → 接続チェック → Claudeに登録」まで進める
import { readFile, writeFile, copyFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline';
import { ENV_PATH, parseEnv } from './base-client.mjs';
import { authorize } from './auth.mjs';
import { runDoctor } from './doctor.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SERVER_PATH = join(HERE, 'server.mjs');
const DEFAULT_REDIRECT = 'http://localhost:8787/callback';

// ---- 入力 ----
// パイプ入力（テスト）でも1行ずつ順に読めるように、行をためて渡す
const lines = [];
let waiting = null;
let rl;
function openRl() {
  rl = readline.createInterface({ input: process.stdin, terminal: false });
  rl.on('line', (l) => (waiting ? (waiting(l), (waiting = null)) : lines.push(l)));
  rl.on('close', () => { if (rl.closedByUs) return; waiting?.(''); waiting = null; });
}
openRl();
const nextLine = () => (lines.length ? Promise.resolve(lines.shift()) : new Promise((r) => (waiting = r)));

async function ask(question, { secret = false } = {}) {
  process.stdout.write(question);
  if (secret && process.stdin.isTTY) {
    // 入力した文字を画面に出さない（その間は行読み取りを止める）
    rl.closedByUs = true;
    rl.close();
    process.stdin.setRawMode(true);
    let value = '';
    return new Promise((resolve) => {
      const onData = (buf) => {
        for (const ch of buf.toString('utf8')) {
          if (ch === '\r' || ch === '\n') {
            process.stdin.setRawMode(false);
            process.stdin.off('data', onData);
            process.stdout.write('\n');
            openRl();
            return resolve(value.trim());
          }
          if (ch === '\u0003') process.exit(130); // Ctrl+C
          if (ch === '\u007f' || ch === '\b') value = value.slice(0, -1);
          else value += ch;
        }
      };
      process.stdin.on('data', onData);
      process.stdin.resume();
    });
  }
  return (await nextLine()).trim();
}
const yes = async (q) => !/^n/i.test(await ask(`${q} [Y/n] `));
const mask = (v) => (v.length > 8 ? `${v.slice(0, 4)}…${v.slice(-4)}` : '設定済み');

// ---- .env ----
async function readEnv() {
  try { return parseEnv(await readFile(ENV_PATH, 'utf8')); } catch { return {}; }
}
async function writeEnv(values) {
  let template;
  try { template = await readFile(ENV_PATH, 'utf8'); } catch {
    template = await readFile(join(HERE, '.env.example'), 'utf8');
  }
  const seen = new Set();
  let out = template.replace(/^(\s*)([A-Za-z_][A-Za-z0-9_]*)\s*=.*$/gm, (line, sp, key) => {
    if (!(key in values)) return line;
    seen.add(key);
    return `${sp}${key}=${values[key]}`;
  });
  for (const [k, v] of Object.entries(values)) if (!seen.has(k)) out += `\n${k}=${v}`;
  await mkdir(dirname(ENV_PATH), { recursive: true });
  await writeFile(ENV_PATH, out.endsWith('\n') ? out : `${out}\n`, { mode: 0o600 });
}

// ---- Claude への登録 ----
function claudeDesktopConfigPath() {
  if (process.platform === 'darwin') return join(homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
  if (process.platform === 'win32') return join(process.env.APPDATA || join(homedir(), 'AppData', 'Roaming'), 'Claude', 'claude_desktop_config.json');
  return join(homedir(), '.config', 'Claude', 'claude_desktop_config.json');
}

async function registerDesktop() {
  const path = claudeDesktopConfigPath();
  if (!existsSync(dirname(path))) return false; // Claude Desktop が入っていない
  if (!(await yes('Claude Desktop に登録しますか？'))) return true;
  let config = {};
  if (existsSync(path)) {
    try {
      config = JSON.parse(await readFile(path, 'utf8'));
    } catch {
      console.log(`⚠️ ${path} の中身を読めなかったので、自動登録をやめました。READMEの手順で手で追加してください`);
      return true;
    }
    await copyFile(path, `${path}.bak`);
  }
  config.mcpServers = { ...(config.mcpServers ?? {}), 'base-shop': { command: process.execPath, args: [SERVER_PATH] } };
  await writeFile(path, JSON.stringify(config, null, 2));
  console.log(`✅ Claude Desktop に登録しました（${path}${existsSync(`${path}.bak`) ? '、元の設定は .bak に保存' : ''}）`);
  console.log('   → Claude Desktop を一度終了して、もう一度開いてください');
  return true;
}

// Windows では claude が .cmd なので shell 経由で呼ぶ。その場合は空白を含む引数をクォートする
function runClaude(args, stdio = 'inherit') {
  const win = process.platform === 'win32';
  const a = win ? args.map((x) => (/\s/.test(x) ? `"${x}"` : x)) : args;
  return spawnSync('claude', a, { stdio, shell: win });
}

const hasClaudeCode = () => runClaude(['--version'], 'ignore').status === 0;

async function registerClaudeCode() {
  if (!hasClaudeCode()) return false;
  if (!(await yes('Claude Code に登録しますか？'))) return true;
  runClaude(['mcp', 'remove', 'base-shop', '-s', 'user'], 'ignore');
  const r = runClaude(['mcp', 'add', 'base-shop', '-s', 'user', '--', process.execPath, SERVER_PATH]);
  console.log(r.status === 0 ? '✅ Claude Code に登録しました' : '⚠️ Claude Code への登録に失敗しました。READMEの手順で手で登録してください');
  return true;
}

// ---- 本体 ----
console.log('BASE × Claude セットアップ\n');

const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 18 || (major === 18 && minor < 17)) {
  console.log(`❌ Node.js ${process.versions.node} は古いので動きません。https://nodejs.org から LTS 版を入れ直してください`);
  process.exit(1);
}

const env = await readEnv();
console.log('【1/4】BASE Developers のアプリ情報を入れます（BASE Developers → アプリケーション で確認できます）');
const idInput = await ask(`client_id${env.BASE_CLIENT_ID ? `（Enterでそのまま: ${mask(env.BASE_CLIENT_ID)}）` : ''}: `);
const secretInput = await ask(`client_secret${env.BASE_CLIENT_SECRET ? '（Enterでそのまま）' : '（入力しても画面には出ません）'}: `, { secret: true });
const values = {
  BASE_CLIENT_ID: idInput || env.BASE_CLIENT_ID || '',
  BASE_CLIENT_SECRET: secretInput || env.BASE_CLIENT_SECRET || '',
  BASE_REDIRECT_URI: env.BASE_REDIRECT_URI || DEFAULT_REDIRECT,
};
if (!values.BASE_CLIENT_ID || !values.BASE_CLIENT_SECRET) {
  console.log('❌ client_id と client_secret の両方が必要です。もう一度 `npm run setup` してください');
  process.exit(1);
}
await writeEnv(values);
Object.assign(process.env, values);
console.log(`✅ 保存しました（${ENV_PATH}）。このファイルは他人に渡さないでください\n`);

console.log('【2/4】BASEで「許可」を押します');
console.log(`   ※ BASE Developers のコールバックURLが ${values.BASE_REDIRECT_URI} になっている必要があります`);
try {
  await authorize({ open: process.env.BASE_SETUP_NO_BROWSER !== '1' });
} catch (e) {
  console.log(`❌ 認証できませんでした: ${e.message}`);
  console.log('   → client_id / client_secret / コールバックURL を見直して、もう一度 `npm run setup` してください');
  process.exit(1);
}

console.log('\n【3/4】接続チェック');
const healthy = await runDoctor();

console.log('\n【4/4】Claude に登録');
const registered = [await registerClaudeCode(), await registerDesktop()].some(Boolean);
if (!registered) {
  console.log('Claude Code / Claude Desktop が見つかりませんでした。入れたあとで、もう一度 `npm run setup` を実行すれば登録だけやり直せます');
}

console.log(healthy
  ? '\n🎉 完了です。Claude に「昨日の売上は？」と聞いて、BASEの管理画面の数字と合うか確かめてください'
  : '\n⚠️ 接続チェックで ❌ が出ています。その画面を Claude に見せてください');
rl.closedByUs = true;
rl.close();
process.exit(healthy ? 0 : 1);
