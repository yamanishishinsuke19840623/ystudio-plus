#!/usr/bin/env node
// 接続チェック：設定 → トークン → API の順に確認して、どこで詰まっているかを日本語で表示する
import { fileURLToPath } from 'node:url';
import { TOKEN_PATH, loadTokens, callApi } from './base-client.mjs';

// 問題がなければ true を返す
export async function runDoctor() {
  let failed = false;
  const ok = (m) => console.log(`✅ ${m}`);
  const ng = (m, fix) => { failed = true; console.log(`❌ ${m}${fix ? `\n   → ${fix}` : ''}`); };

  console.log('BASE MCP 接続チェック\n');

  for (const name of ['BASE_CLIENT_ID', 'BASE_CLIENT_SECRET', 'BASE_REDIRECT_URI']) {
    process.env[name] ? ok(`${name} 設定済み`) : ng(`${name} が未設定`, '`npm run setup` を実行するか、.env に値を入れてください');
  }

  let tokens;
  try {
    tokens = await loadTokens();
    ok(`トークンあり（${TOKEN_PATH}、保存: ${tokens.saved_at ?? '不明'}、スコープ: ${tokens.scope ?? '不明'}）`);
  } catch {
    ng('トークンなし', '`npm run auth` で認証してください');
  }

  if (tokens) {
    try {
      const me = await callApi('GET', '/1/users/me');
      const user = me.user ?? me;
      ok(`APIに接続できました（ショップ: ${user.shop_name ?? user.shop_id ?? '名前取得不可'}）`);
    } catch (e) {
      ng(`API呼び出しに失敗: ${e.message}`);
    }
    for (const [label, path, scope] of [['商品', '/1/items', 'read_items'], ['注文', '/1/orders', 'read_orders']]) {
      try {
        await callApi('GET', path, { limit: 1 });
        ok(`${label}を読めます`);
      } catch (e) {
        ng(`${label}を読めません: ${e.message.split('\n')[0]}`, `BASE_SCOPES に ${scope} を入れて \`npm run auth\` をやり直してください`);
      }
    }
  }

  console.log(failed ? '\n要対応の項目があります。' : '\nすべてOK。Claudeに登録して使えます。');
  return !failed;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exit((await runDoctor()) ? 0 : 1);
}
