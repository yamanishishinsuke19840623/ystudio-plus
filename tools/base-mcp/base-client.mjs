// BASE API の共通クライアント（トークン保存・自動リフレッシュ・API呼び出し）
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';

export const API_BASE = 'https://api.thebase.in';

export const TOKEN_PATH =
  process.env.BASE_TOKEN_PATH || join(homedir(), '.base-mcp', 'tokens.json');

export function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`環境変数 ${name} が未設定です`);
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

async function refresh(tokens) {
  if (!tokens.refresh_token) throw new Error('refresh_token がありません。`npm run auth` で再認証してください');
  const fresh = await requestToken({
    grant_type: 'refresh_token',
    refresh_token: tokens.refresh_token,
  });
  // 新しい refresh_token が返らない場合は既存のものを引き継ぐ
  const merged = { ...tokens, ...fresh, refresh_token: fresh.refresh_token || tokens.refresh_token };
  await saveTokens(merged);
  return merged;
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
    throw new Error(`BASE API エラー ${method} ${path} (${res.status}): ${typeof body === 'string' ? body : JSON.stringify(body)}`);
  }
  return body;
}
