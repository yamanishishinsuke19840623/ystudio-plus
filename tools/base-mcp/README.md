# base-mcp — BASEショップをClaudeにつなぐMCPサーバー

自社のBASE（thebase.in）ネットショップを、Claudeから見たり操作したりするためのMCPサーバーです。

- **集計**：「先週の売上は？」「在庫が少ない商品は？」「今月の売れ筋は？」に一発で答えられる
- **安全な書き込み**：在庫・価格・公開状態・発送済みの変更は「プレビュー → あなたが了承 → 実行」の2段階。実行履歴は手元に記録
- **PCでもスマホでも**：Claude Desktop / Claude Code（PC）に加えて、claude.ai（Web・スマホ）からも使えるリモート版あり
- 既定は **読み取り専用**。トークンは手元の `~/.base-mcp/` にだけ保存され、リポジトリには入りません

## セットアップ（PC版）

### 1. BASE Developers でアプリ登録
1. https://developers.thebase.com/ で開発者申請 → アプリを作成
2. コールバックURLを `http://localhost:8787/callback` に設定
3. `client_id` と `client_secret` を控える

※ BASE API の利用は申請制です。審査の期間などはBASE側の運用によります。

### 2. インストール・設定・認証

```bash
cd tools/base-mcp
npm install
cp .env.example .env     # .env を開いて client_id / client_secret を入れる
npm run auth             # 表示されたURLをブラウザで開いて「許可」
npm run doctor           # 接続チェック。全部 ✅ ならOK
```

`doctor` は「設定 → トークン → 商品が読めるか → 注文が読めるか」を順に確認し、つまずいた箇所と直し方を表示します。

### 3. Claude に登録

`.env` を読むので、登録時に秘密情報を書く必要はありません。

**Claude Code**
```bash
claude mcp add base-shop -- node /絶対パス/ystudio-plus/tools/base-mcp/server.mjs
```

**Claude Desktop**（`claude_desktop_config.json`）
```json
{
  "mcpServers": {
    "base-shop": {
      "command": "node",
      "args": ["/絶対パス/ystudio-plus/tools/base-mcp/server.mjs"]
    }
  }
}
```

## スマホ・Web（claude.ai）から使う：リモート版

claude.ai のカスタムコネクタはインターネット上の HTTPS の URL が必要です。いちばん手軽なのは、自宅PCやミニPCで HTTP 版を動かし、Cloudflare Tunnel で HTTPS 公開する方法です。

```bash
# .env に BASE_MCP_SECRET（32文字以上のランダム文字列）を設定
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

npm run start:http                      # http://127.0.0.1:8788/mcp/<SECRET> で待ち受け
cloudflared tunnel --url http://127.0.0.1:8788   # https://xxxx.trycloudflare.com が発行される
```

claude.ai →「設定」→「コネクタ」→「カスタムコネクタを追加」で、URL に
`https://xxxx.trycloudflare.com/mcp/<SECRET>` を登録します。

**注意**
- このURLを知っている人は誰でもショップのデータを読めます。URLは他人に見せないでください。漏れたら `BASE_MCP_SECRET` を変えて登録し直します
- リモート版では `BASE_ALLOW_WRITE=0`（読み取り専用）を強く推奨します
- `trycloudflare.com` の一時URLは再起動のたびに変わります。常用するなら Cloudflare の名前付きトンネル（独自ドメイン）にしてください
- PCが止まっている間は使えません。常時動かすなら、ミニPC・VPS・Cloud Run などに置きます（`~/.base-mcp/tokens.json` を書き込める場所が必要）

## ツール一覧

### 集計（おすすめ）
| ツール | できること |
|---|---|
| `base_sales_summary` | 期間（日本時間）の注文数・売上合計・客単価・日別推移・キャンセル数・未発送数。`include_items: true` で商品別ランキングも |
| `base_low_stock` | 在庫が閾値以下の商品・バリエーション（既定3以下、非公開は除外） |
| `base_fetch_all_items` | 全商品をページ送りで取得して要約 |

### 読み取り（APIそのまま）
`base_get_shop` / `base_list_items` / `base_get_item` / `base_list_orders` / `base_get_order` / `base_list_categories` / `base_get_item_categories` / `base_list_savings`

### 書き込み（`BASE_ALLOW_WRITE=1` のときだけ）
| ツール | できること |
|---|---|
| `base_update_stock` | 在庫数の変更（バリエーション対応） |
| `base_update_item` | 商品名・価格・説明・公開/非公開の変更 |
| `base_update_order_status` | 注文商品を「発送済み」または「キャンセル」にする |

書き込みツールは、最初の呼び出しでは**何も変更しません**。現在の値と送信予定の内容、確認トークンを返すだけです。了承後、同じ内容に確認トークンを付けて呼んだときだけ実行されます。確認トークンは10分で失効し、1回しか使えません。内容を変えると無効になります。実行した変更は `~/.base-mcp/write-log.jsonl` に記録されます。

書き込みには、認証時のスコープに `write_items`（商品・在庫）と `write_orders`（注文）が必要です。

## 使い方の例（Claudeへの話しかけ方）

- 「先週（月〜日）の売上をまとめて。前の週とも比べて」
- 「今月の売れ筋トップ10を出して」
- 「在庫5以下の商品を一覧にして、補充の優先順位をつけて」
- 「商品◯◯の在庫を20にして」→ プレビューが出る →「OK」で実行

## テスト

```bash
npm test
```

モックのBASE APIを立てて、PC版・リモート版の両方で、ページ送り・集計・2段階書き込み・トークン自動更新などのロジックを確認します。**本物のBASE APIの仕様を確かめるテストではありません。**

## 未検証の事項（初回接続時に確認）

この実装は、BASE APIの公式ドキュメントにアクセスできない環境で作りました。次の点は実際のショップで確認が必要です。

- **レスポンスの項目名**：`total`・`ordered`・`stock`・`variations` などは記憶にもとづく想定です。`tools.mjs` の先頭にある対応表 `F` にまとめてあります。違っていた場合は、集計ツールが**推測で計算せず**「想定した項目 ◯◯ がありません。実際の項目: …」とエラーを出すので、それを見て `F` を直してください
- **売上合計の定義**：注文一覧の `total` をそのまま足しています。送料・決済手数料を含むかどうかはBASE側の定義次第です
- **注文一覧の期間指定**：`start_ordered` / `end_ordered` を送っています。効かなかった場合も、手元で注文日時による絞り込みをするので集計結果は正しくなります（ただし全件取得になり遅くなります）
- **書き込みのパラメータ**：`edit_stock`（`item_id`・`stock`・`variation_id`・`variation_stock`）、`edit`、`edit_status`（`unique_key`・`order_item_id`・`status`・`add_comment`）の項目名
- **認証まわり**：複数スコープの区切り方（スペース区切りで送信）とトークンの有効期限

確認済みの事実：エンドポイント一覧・スコープ名・レート制限（5,000回/時・100,000回/日）は、BASE公式のgistに記載があります。
