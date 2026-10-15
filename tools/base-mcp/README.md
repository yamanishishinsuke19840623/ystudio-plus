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

### 2. PCでセットアップ（コマンド1つ）

必要なもの：Node.js（https://nodejs.org の LTS 版）

```bash
git clone https://github.com/yamanishishinsuke19840623/ystudio-plus.git
cd ystudio-plus/tools/base-mcp
npm install
npm run setup
```

`npm run setup` は次の順に進みます。

1. client_id と client_secret を聞く（secret は入力しても画面に出ません）→ `.env` に保存
2. ブラウザでBASEの許可画面を開く →「許可」を押す
3. 接続チェック（商品・注文が読めるか）
4. Claude Code / Claude Desktop が入っていれば登録する（Desktop の既存設定は残し、元のファイルは `.bak` に保存）

最後に「🎉 完了です」と出たら、Claude（Desktop は一度終了して開き直す）に **「昨日の売上は？」** と聞いて、BASEの管理画面の数字と合うか確かめてください。

途中で止まったら、その画面のスクショを Claude に見せてください。もう一度 `npm run setup` を実行すると、入力済みの値はEnterでそのまま使えます。

### 個別に実行する場合

```bash
npm run auth     # BASEの許可だけやり直す
npm run doctor   # 接続チェックだけ
```

手で Claude に登録する場合：

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

### 毎日使う
| ツール | できること |
|---|---|
| `base_sales_summary` | 売上集計。`period` に `yesterday` / `last_week` / `this_month` / `last_30_days` などの呼び名、または日付で期間を指定。注文数・売上・客単価・日別（売上0の日も含む）・キャンセル・未発送の数を出す。`compare: previous`（前の期間）や `last_year`（前年同期）で増減％も。`include_items: true` で売れ筋ランキング |
| `base_pending_shipments` | 未発送の注文を古い順に、待ち日数つきで一覧にする（3日以上待ちの件数も） |
| `base_low_stock` | 在庫が閾値以下の商品・バリエーション（売り切れ数つき） |
| `base_find_items` | 商品名・品番の一部で検索して、商品IDやバリエーションIDを調べる（全角/半角を区別しない） |
| `base_growth_insights` | **売上アップの機会を洗い出す**：売れ筋の在庫切れ・在庫切れ間近（あと何日もつか）／一緒に買われている組み合わせ（セット候補）／売れていない在庫／在庫があるのに非公開／曜日・時間帯ごとの売れ方／注文金額の分布とまとめ買い率。数字（事実）と施策案（仮説）を分けて返す |
| `base_today` | 今日の日付（日本時間）と、各期間の開始日・終了日 |

### お客さま（顧客価値を届ける）
| ツール | できること |
|---|---|
| `base_customers` | 2年分の注文を購入者ごとにまとめ、**お得意様／リピーター／1回購入**に分ける。**「去年の今ごろ（これから6週間）に買っていて、今年はまだのお客さま」**（季節のご案内候補・去年買ったものつき）と、**「半年以上注文のないお得意様」**を出す。リピーターの割合と、売上に占めるリピーターの割合も |
| `base_customer_history` | 1人のお客さまの購入履歴と「いつもの商品」。電話やメールで「いつものを」と言われたとき、お礼を書く前の確認に |

- 同じメールアドレスを同じ人とみなします。贈り物の注文は、お届け先ではなく注文した人で数えます
- 注文詳細は `~/.base-mcp/order-cache/` にキャッシュします。注文から45日以上たったものは再取得しないので、2回目からは速くなります。最近の注文は発送やキャンセルで状態が変わりうるので毎回読み直します
- **個人情報を扱います。** PC版では使えます。リモート版（スマホ・Web）では既定で無効で、`BASE_ALLOW_CUSTOMER_DATA=1` のときだけ出ます

### 読み取り（APIそのまま）
`base_get_shop` / `base_list_items` / `base_get_item` / `base_list_orders` / `base_get_order` / `base_list_categories` / `base_get_item_categories` / `base_list_savings` / `base_fetch_all_items`

### 書き込み（`BASE_ALLOW_WRITE=1` のときだけ）
| ツール | できること |
|---|---|
| `base_update_stock` | 在庫の変更。**最大50件をまとめて**変更でき、各行は「この数にする（`stock`）」か「今の在庫に足す（`add`、入荷なら+10など）」を選べる。バリエーション対応 |
| `base_update_item` | 商品名・価格・説明・公開/非公開の変更 |
| `base_update_order_status` | 注文商品を「発送済み」または「キャンセル」にする |

書き込みツールは、最初の呼び出しでは**何も変更しません**。変更前後の値と確認トークンを返すだけです。了承後、同じ内容に確認トークンを付けて呼んだときだけ実行されます。確認トークンは10分で失効し、1回しか使えず、内容を変えると無効になります。在庫の変更では実行の直前にも最新の在庫を読み直すので、プレビューのあとに注文が入って在庫が動いた場合は実行されず、プレビューからやり直しになります。まとめて変更している途中で失敗したら、そこで止めて「どこまで済んだか」を返します。実行した変更は `~/.base-mcp/write-log.jsonl` に記録されます。

書き込みには、認証時のスコープに `write_items`（商品・在庫）と `write_orders`（注文）が必要です。

### 定型の依頼（プロンプト）
Claude Desktop の「＋」メニューや、Claude Code の `/mcp__base-shop__weekly_report` のように呼び出せます。

| 名前 | 内容 |
|---|---|
| `weekly_report` | 先週の売上を前週と比べ、売れ筋・在庫・未発送をまとめ、「今週やること」を3つ出す |
| `restock_plan` | 在庫が少ない商品を直近30日の売れ行きと合わせ、「あと何日で売り切れるか」の順に並べる（提案だけで在庫は変えない） |
| `growth_plan` | 売上アップ施策。現状（FACT）→ 伸びしろ上位3つ → 施策案（すぐできる／準備がいる）→ 最初に試す1つの検証プラン（2週間・見る数字）→ 足りない情報（UNKNOWN）の順にまとめる。目標（例：客単価を上げたい）も渡せる |
| `customer_followup` | 季節のご案内候補・休眠お得意様を表で見せ、**送る相手を選んでもらってから**、一人ひとりに合わせたご案内メールを下書きする。前回買ってもらった商品名は履歴にあるものだけを使い、価格・在庫・割引・発送日は「◯◯」の空欄にする。Gmail が使えれば下書き保存、**送信は絶対にしない** |
| `shipping_check` | 未発送の注文を「今日発送すべき／入金待ち／要確認」に分ける（確認だけでステータスは変えない） |

## 使い方の例（Claudeへの話しかけ方）

- 「去年の今ごろ買ってくれたお客さんに、ご案内の下書きを作って」（または `customer_followup`）
- 「鈴木さんがいつも買うのは何だっけ？」
- 「売上アップの施策を考えて」（または `growth_plan` を呼ぶ）
- 「昨日の売上は？」
- 「今月の売上を去年の同じ時期と比べて」
- 「発送が遅れている注文ある？」
- 「Tシャツ白のMを10個入荷した」→ 商品を検索 → 在庫 3→13 のプレビュー →「OK」で実行
- 「在庫5以下の商品を、売れ行きを見て補充の優先順に並べて」

## テスト

```bash
npm test
```

モックのBASE APIを立てて、PC版・リモート版の両方で、ページ送り・集計・2段階書き込み・トークン自動更新などのロジックを確認します。**本物のBASE APIの仕様を確かめるテストではありません。**

## 未検証の事項（初回接続時に確認）

この実装は、BASE APIの公式ドキュメントにアクセスできない環境で作りました。次の点は実際のショップで確認が必要です。

- **レスポンスの項目名**：`total`・`ordered`・`stock`・`variations` などは記憶にもとづく想定です。`tools.mjs` の先頭にある対応表 `F` にまとめてあります。違っていた場合は、集計ツールが**推測で計算せず**「想定した項目 ◯◯ がありません。実際の項目: …」とエラーを出すので、それを見て `F` を直してください
- **購入者の項目名**：注文詳細の `mail_address`・`last_name`・`first_name`・`prefecture`（`F.customer`）。違っていればお客さまツールがエラーで止まります
- **売上合計の定義**：注文一覧の `total` をそのまま足しています。送料・決済手数料を含むかどうかはBASE側の定義次第です
- **注文一覧の期間指定**：`start_ordered` / `end_ordered` を送っています。効かなかった場合も、手元で注文日時による絞り込みをするので集計結果は正しくなります（ただし全件取得になり遅くなります）
- **書き込みのパラメータ**：`edit_stock`（`item_id`・`stock`・`variation_id`・`variation_stock`）、`edit`、`edit_status`（`unique_key`・`order_item_id`・`status`・`add_comment`）の項目名
- **認証まわり**：複数スコープの区切り方（スペース区切りで送信）とトークンの有効期限

確認済みの事実：エンドポイント一覧・スコープ名・レート制限（5,000回/時・100,000回/日）は、BASE公式のgistに記載があります。
