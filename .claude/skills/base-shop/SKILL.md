---
name: base-shop
description: BASE（thebase.in）ネットショップを BASE MCP（tools/base-mcp）で扱うときの進め方。売上・在庫・未発送の確認、売上アップの施策、お客さまへのご案内、商品の登録・在庫や価格の変更、BASE MCP 自体の改修やセットアップの手伝いをするときに使う。
---

# BASE ショップの運用と BASE MCP の改修

## 大原則：盛らずに、掘る
- 情報は FACT（確認できた事実）／VOICE（本人の発言）／IDEA（仮説）／PLAN（これからの構想）／UNKNOWN（未確認）に分ける。FACT 以外を事実として書かない
- 数字・日付・固有名詞・商品の産地や中身・食品表示は、ツールの結果かユーザーの発言だけを使う。足りなければ聞く
- 施策は「データの根拠（FACT）→ 仮説（IDEA）→ 2週間ほどの検証プラン（見る数字・比べ方）」の形で出す。成果を約束しない
- ショップ固有の数字や背景（売上規模・粗利・お得意様など）はこのリポジトリに書かない（公開リポジトリのため）。Notion のナレッジとメモリにある

## 日々の使い方（MCP がつながっているとき）
| やりたいこと | 使うもの |
|---|---|
| 日付の基準 | `base_today`（日本時間。週は月曜始まり） |
| 売上 | `base_sales_summary`（`period` と `compare: previous / last_year`、売れ筋は `include_items`） |
| 在庫 | `base_low_stock`、補充の順番は prompt `restock_plan` |
| 発送 | `base_pending_shipments`、prompt `shipping_check` |
| 売上アップ | `base_growth_insights`、prompt `growth_plan` |
| お客さま | `base_customers`（季節のご案内候補・休眠お得意様）、`base_customer_history`、prompt `customer_followup` |
| 商品を探す | `base_find_items`（書き込みの前に商品IDを調べる） |
| 週次の振り返り | prompt `weekly_report` |

## 書き込み（`BASE_ALLOW_WRITE=1` のときだけ）
- 対象：`base_update_stock`（一括・加算）、`base_update_item`、`base_update_order_status`、`base_create_items`
- 必ず「confirm_token なしでプレビュー → ユーザーに見せて了承 → 同じ引数＋confirm_token で実行」。了承なしに実行しない
- 商品の新規登録は必ず非公開。管理画面で確認してもらってから、言われたときだけ `base_update_item(visible:true)` で公開する
- 食品表示（名称・原材料名・アレルギー・内容量・期限・保存方法・製造者/加工者）は推測で埋めない
- キャンセルは取り消せない可能性が高いので、特に念を押す

## お客さまの個人情報
- 結果に名前・メールが含まれる。このやりとり以外に使わない、外に貼らない
- ご案内メールは下書きまで。送信は絶対にしない（Gmail ツールでも下書き作成のみ）
- リモート版（server-http.mjs）では既定で無効のまま。有効にするのはユーザーが明示したときだけ

## BASE MCP を改修するとき
- 場所：`tools/base-mcp/`。ツール定義は `tools.mjs`、API 呼び出しは `base-client.mjs`
- レスポンスの項目名は `tools.mjs` 先頭の対応表 `F` に集約し、`requireFields` で見つからなければエラーにする（推測で計算しない）
- 本物の BASE API で未検証の項目名・パラメータは README の「未検証の事項」に書き、確認できたら FACT に移して消す
- テスト：`cd tools/base-mcp && npm test`（モック API。偽物の API での確認であって、本物の仕様の確認ではないと明記する）
- 書き込みを足すときは `twoStep`（プレビュー → confirm_token）と `send`（実行ログ）を使い、テストで「プレビューでは送信しない」「内容が変わったらトークンが無効になる」を確かめる
- push・PR の作成・マージはユーザーに言われたときだけ。マージ済み PR のブランチは master から作り直して使う

## ユーザーへの伝え方
- 日本語で、短く。手順はコピペできる形にする
- client_secret などの秘密情報はチャットに貼ってもらわない
- 詰まったらスクショをもらう。本物の API で初めて動かすときは、まず「昨日の売上は？」を BASE の管理画面と照合してもらう
