#!/usr/bin/env node
// 初回だけ実行する OAuth 認証ヘルパー。
// ローカルでコールバックを受け取り、アクセストークン／リフレッシュトークンを保存する。
import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { API_BASE, TOKEN_PATH, requireEnv, requestToken, saveTokens } from './base-client.mjs';

const DEFAULT_SCOPES = 'read_users read_items read_orders';

const clientId = requireEnv('BASE_CLIENT_ID');
requireEnv('BASE_CLIENT_SECRET');
const redirectUri = new URL(requireEnv('BASE_REDIRECT_URI'));
const scope = process.env.BASE_SCOPES || DEFAULT_SCOPES;
const state = randomBytes(16).toString('hex');

if (!['localhost', '127.0.0.1'].includes(redirectUri.hostname)) {
  console.error('BASE_REDIRECT_URI は http://localhost:<port>/callback の形にしてください（このスクリプトがそこで待ち受けます）');
  process.exit(1);
}

const authorizeUrl = `${API_BASE}/1/oauth/authorize?${new URLSearchParams({
  response_type: 'code',
  client_id: clientId,
  redirect_uri: redirectUri.toString(),
  scope,
  state,
})}`;

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, redirectUri);
  if (url.pathname !== redirectUri.pathname) {
    res.writeHead(404).end();
    return;
  }
  const done = (status, msg) => {
    res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' }).end(msg);
    server.close();
  };
  if (url.searchParams.get('state') !== state) return done(400, 'state が一致しません。もう一度やり直してください。');
  const code = url.searchParams.get('code');
  if (!code) return done(400, `認可されませんでした: ${url.search}`);
  try {
    const tokens = await requestToken({ grant_type: 'authorization_code', code });
    await saveTokens({ ...tokens, scope });
    console.log(`\n✅ 認証完了。トークンを保存しました: ${TOKEN_PATH}`);
    done(200, '認証完了しました。このタブは閉じてOKです。');
  } catch (e) {
    console.error(e.message);
    done(500, e.message);
  }
});

server.listen(Number(redirectUri.port) || 80, redirectUri.hostname, () => {
  console.log(`スコープ: ${scope}`);
  console.log('\n次のURLをブラウザで開き、BASEのショップアカウントで許可してください:\n');
  console.log(authorizeUrl + '\n');
});
