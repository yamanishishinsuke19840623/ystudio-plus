// BASE API の共通クライアント（設定読み込み・トークン保存・自動リフレッシュ・API呼び出し）
import { readFile, writeFile, mkdir, appendFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

// tools/base-mcp/.env があれば読み込む（既に設定済みの環境変数は上書きしない）
try {
  process.loadEnvFile(join(dirname(fileURLToPath(import.meta.url)), '.env'));
} catch {}

// テスト時はモックAPIに向けられるよう上書き可能にしている
export const API_BASE = process.env.BASE_API_BASE || 'https://api.thebase.in';

export const DATA_DIR = process.env.BASE_DATA_DIR || join(homedir(), '.base-mcp');
export const TOKEN_PATH = process.env.BASE_TOKEN_PATH || join(DATA_DIR, 'tokens.json');
export const WRITE_LOG_PATH = join(DATA_DIR, 'write-log.jsonl');

export function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`環境変数 ${name} が未設定です（tools/base-mcp/.env に書くか、MCP設定の env に追加してください）`);
  return v;
}

export async function loadTokens() {
  try {
    return JSON.parse(await readFile(TOKEN_PATH, 'utf8'));
  } catch {
    throw new Error(
      `トークンが見つかりません（${TOKEN_PATH}）。先に \`npm run auth\` で認証してください`
    );
  }
}

export async function saveTokens(tokens) {
  await mkdir(dirname(TOKEN_PATH), { recursive: true });
  await writeFile(
    TOKEN_PATH,
    JSON.stringify({ ...tokens, saved_at: new Date().toISOString() }, null, 2),
    { mode: 0o600 }
  );
}

export async function appendWriteLog(entry) {
  await mkdir(DATA_DIR, { recursive: true });
  await appendFile(WRITE_LOG_PATH, JSON.stringify({ at: new Date().toISOString(), ...entry }) + '\n', { mode: 0o600 });
}

// POST /1/oauth/token（authorization_code / refresh_token 共通）
export async function requestToken(params) {
  const res = await fetch(`${API_BASE}/1/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: requireEnv('BASE_CLIENT_ID'),
      client_secret: requireEnv('BASE_CLIENT_SECRET'),
      redirect_uri: requireEnv('BASE_REDIRECT_URI'),
      ...params,
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.access_token) {
    throw new Error(`トークン取得に失敗しました (${res.status}): ${JSON.stringify(body)}`);
  }
  return body;
}

// 同時に複数のリクエストが401になっても、リフレッシュは1回にまとめる
let refreshing = null;
async function refresh(tokens) {
  if (!tokens.refresh_token) throw new Error('refresh_token がありません。`npm run auth` で再認証してください');
  refreshing ??= (async () => {
    try {
      const fresh = await requestToken({
        grant_type: 'refresh_token',
        refresh_token: tokens.refresh_token,
      });
      // 新しい refresh_token が返らない場合は既存のものを引き継ぐ
      const merged = { ...tokens, ...fresh, refresh_token: fresh.refresh_token || tokens.refresh_token };
      await saveTokens(merged);
      return merged;
    } catch (e) {
      throw new Error(`${e.message}\nリフレッシュトークンが失効している可能性があります。\`npm run auth\` で再認証してください`);
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

// BASE API を呼ぶ。401 のときは1回だけリフレッシュして再試行する
export async function callApi(method, path, params = {}) {
  let tokens = await loadTokens();
  const clean = Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => [k, String(v)])
  );

  const send = (accessToken) => {
    const qs = method === 'GET' && Object.keys(clean).length ? `?${new URLSearchParams(clean)}` : '';
    return fetch(`${API_BASE}${path}${qs}`, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(method === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
      },
      body: method === 'POST' ? new URLSearchParams(clean) : undefined,
    });
  };

  let res = await send(tokens.access_token);
  if (res.status === 401) {
    tokens = await refresh(tokens);
    res = await send(tokens.access_token);
  }
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  if (!res.ok) {
    const detail = typeof body === 'string' ? body : JSON.stringify(body);
    const hint = /api_limit/.test(detail) ? '\nAPI利用回数の上限（5,000回/時・100,000回/日）に達しました。時間をおいてください' : '';
    throw new Error(`BASE API エラー ${method} ${path} (${res.status}): ${detail}${hint}`);
  }
  return body;
}

// 一覧APIのレスポンスから配列を取り出す（{ items: [...] } / { orders: [...] } / 配列 のどれでも）
export function pickList(body, key) {
  if (Array.isArray(body)) return body;
  if (body && Array.isArray(body[key])) return body[key];
  throw new Error(`想定外のレスポンス形式です（"${key}" 配列が見つかりません）: ${JSON.stringify(body).slice(0, 300)}`);
}

// limit/offset でページを最後までたどる。maxPages を超えたら truncated を返す
export async function fetchAllPages(path, key, query = {}, { pageSize = 100, maxPages = 50 } = {}) {
  const all = [];
  for (let page = 0; page < maxPages; page++) {
    const list = pickList(await callApi('GET', path, { ...query, limit: pageSize, offset: page * pageSize }), key);
    all.push(...list);
    if (list.length < pageSize) return { list: all, truncated: false };
  }
  return { list: all, truncated: true };
}
