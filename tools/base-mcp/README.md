# base-mcp — BASEショップをClaudeにつなぐMCPサーバー

自社のBASE（thebase.in）ネットショップの商品・注文データを、Claude（Claude Desktop / Claude Code）から見られるようにするローカルMCPサーバーです。

- 既定は **読み取り専用**（商品・注文・カテゴリ・ショップ情報・振込申請）
- `BASE_ALLOW_WRITE=1` のときだけ書き込みツール `base_write` を公開（商品編集・在庫・注文ステータスなど）
- 認証情報（トークン）は手元PCの `~/.base-mcp/tokens.json` にだけ保存。リポジトリには入りません

## 1. BASE Developers でアプリ登録

1. https://developers.thebase.com/ で開発者申請 → アプリを作成
2. コールバックURLを `http://localhost:8787/callback` に設定
3. `client_id` と `client_secret` を控える

※ BASE API の利用は申請・審査制です。審査の有無や期間は BASE 側の運用によります。

## 2. インストールと初回認証

```bash
cd tools/base-mcp
npm install

export BASE_CLIENT_ID=xxxx
export BASE_CLIENT_SECRET=xxxx
export BASE_REDIRECT_URI=http://localhost:8787/callback
# 必要なスコープだけ。書き込みもしたいなら write_items write_orders を追加
export BASE_SCOPES="read_users read_items read_orders"

npm run auth
```

表示されたURLをブラウザで開き、ショップアカウントで許可すると、トークンが保存されます。
アクセストークンの期限が切れたら、保存済みのリフレッシュトークンで自動更新します。

## 3. Claude に登録

### Claude Desktop（`claude_desktop_config.json`）

```json
{
  "mcpServers": {
    "base-shop": {
      "command": "node",
      "args": ["/絶対パス/ystudio-plus/tools/base-mcp/server.mjs"],
      "env": {
        "BASE_CLIENT_ID": "xxxx",
        "BASE_CLIENT_SECRET": "xxxx",
        "BASE_REDIRECT_URI": "http://localhost:8787/callback"
      }
    }
  }
}
```

### Claude Code

```bash
claude mcp add base-shop \
  -e BASE_CLIENT_ID=xxxx -e BASE_CLIENT_SECRET=xxxx \
  -e BASE_REDIRECT_URI=http://localhost:8787/callback \
  -- node /絶対パス/ystudio-plus/tools/base-mcp/server.mjs
```

書き込みも許可するときは env に `"BASE_ALLOW_WRITE": "1"` を追加（認証時のスコープにも `write_items` / `write_orders` が必要）。

## ツール一覧

| ツール | BASE API | 必要スコープ |
|---|---|---|
| `base_get_shop` | `GET /1/users/me` | read_users |
| `base_list_items` | `GET /1/items` | read_items |
| `base_get_item` | `GET /1/items/detail/:item_id` | read_items |
| `base_list_orders` | `GET /1/orders` | read_orders |
| `base_get_order` | `GET /1/orders/detail/:unique_key` | read_orders |
| `base_list_categories` | `GET /1/categories` | read_items |
| `base_get_item_categories` | `GET /1/item_categories/detail/:item_id` | read_items |
| `base_list_savings` | `GET /1/savings` | read_savings |
| `base_write`（任意） | `POST /1/items/*` `/1/categories/*` `/1/item_categories/*` `/1/orders/edit_status` | write_items / write_orders |

一覧系は `limit` / `offset` のほか、`extra` でドキュメント記載の追加クエリをそのまま渡せます。
`base_write` のパラメータ名は BASE API ドキュメント（https://docs.thebase.in/api/）に従ってください。

## 制限・未確認事項

- レート制限: 1ユーザーあたり 5,000回/時・100,000回/日（BASE公式gist記載）
- 複数スコープの区切り文字（スペース区切りで送っています）、トークンの有効期限、各一覧APIの追加クエリ名は **未検証**。実アカウントで初回接続時に確認してください
- Claude.ai（Web/スマホ）のコネクタとして使うには、このサーバーをリモート（HTTPS）公開する追加作業が必要です。今の形はPC上のClaude Desktop / Claude Code 向けです
