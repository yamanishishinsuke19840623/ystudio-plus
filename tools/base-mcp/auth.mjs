#!/usr/bin/env node
// 初回だけ実行する OAuth 認証ヘルパー。
// ローカルでコールバックを受け取り、アクセストークン／リフレッシュトークンを保存する。
import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { API_BASE, TOKEN_PATH, requireEnv, requestToken, saveTokens } from './base-client.mjs';

const DEFAULT_SCOPES = 'read_users read_items read_orders';

// 既定のブラウザでURLを開く（失敗しても気にしない。URLは画面にも出す）
export function openBrowser(url) {
  const [cmd, args] =
    process.platform === 'darwin' ? ['open', [url]]
    : process.platform === 'win32' ? ['rundll32', ['url.dll,FileProtocolHandler', url]]
    : ['xdg-open', [url]];
  try {
    spawn(cmd, args, { stdio: 'ignore', detached: true }).on('error', () => {}).unref();
  } catch {}
}

// 認可URLを出してコールバックを待ち、トークンを保存したら解決する
export function authorize({ open = true } = {}) {
  const clientId = requireEnv('BASE_CLIENT_ID');
  requireEnv('BASE_CLIENT_SECRET');
  const redirectUri = new URL(requireEnv('BASE_REDIRECT_URI'));
  const scope = process.env.BASE_SCOPES || DEFAULT_SCOPES;
  const state = randomBytes(16).toString('hex');

  if (!['localhost', '127.0.0.1'].includes(redirectUri.hostname)) {
    throw new Error('BASE_REDIRECT_URI は http://localhost:<port>/callback の形にしてください（このスクリプトがそこで待ち受けます）');
  }

  const authorizeUrl = `${API_BASE}/1/oauth/authorize?${new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri.toString(),
    scope,
    state,
  })}`;

  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      const url = new URL(req.url, redirectUri);
      if (url.pathname !== redirectUri.pathname) {
        res.writeHead(404).end();
        return;
      }
      const finish = (status, msg, err) => {
        res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', Connection: 'close' }).end(msg);
        server.close();
        server.closeAllConnections(); // ブラウザの keep-alive 接続が残ってプロセスが終われなくなるのを防ぐ
        err ? reject(err) : resolve();
      };
      if (url.searchParams.get('state') !== state) return finish(400, 'state が一致しません。もう一度やり直してください。', new Error('state が一致しません'));
      const code = url.searchParams.get('code');
      if (!code) return finish(400, `認可されませんでした: ${url.search}`, new Error(`認可されませんでした: ${url.search}`));
      try {
        const tokens = await requestToken({ grant_type: 'authorization_code', code });
        await saveTokens({ ...tokens, scope });
        console.log(`\n✅ 認証完了。トークンを保存しました: ${TOKEN_PATH}`);
        finish(200, '認証完了しました。このタブは閉じてOKです。');
      } catch (e) {
        finish(500, e.message, e);
      }
    });
    server.on('error', (e) => reject(e.code === 'EADDRINUSE'
      ? new Error(`ポート ${redirectUri.port} が使用中です。前に起動した auth / setup が残っていたら閉じてください`)
      : e));
    server.listen(Number(redirectUri.port) || 80, redirectUri.hostname, () => {
      console.log(`スコープ: ${scope}`);
      console.log('\nブラウザでBASEの許可画面を開きます。開かない場合は次のURLを開いてください:\n');
      console.log(authorizeUrl + '\n');
      if (open) openBrowser(authorizeUrl);
    });
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  authorize().catch((e) => { console.error(`❌ ${e.message}`); process.exit(1); });
}
