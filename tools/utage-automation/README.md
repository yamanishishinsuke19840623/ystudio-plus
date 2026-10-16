# UTAGE Webhook連携ツール（UTAGE Webhook Relay）

MirAI Camp「UTAGEの自動化編」の実装。

## 【重要】前提について

UTAGEには、本ツール作成時点で確認できる範囲では、外部アプリからUTAGE内の
コンテンツ（ファネル・ステップ・配信リストなど）を直接操作できる**一般公開API
はありません**。そのため、これは「UTAGE→外部」への一方向連携ツールです。

UTAGEのファネル/ステップ設定にある **Webhook通知機能**（フォーム送信・購入
完了・ステップ到達などのタイミングで指定URLへデータをPOSTする機能。項目名は
UTAGEのバージョンにより異なる場合があります。管理画面の該当ステップの設定を
ご確認ください）の送信先として、このツールが立てるURLを登録することで、
UTAGEで発生したイベント（フォーム送信など）を他の自動化ツール（本リポジトリの
`newsletter-automator` / `line-automator` 等）に橋渡しできます。

## 必要環境

- Python 3.9+（追加のpipパッケージ不要。標準ライブラリ(http.server)のみ）
- インターネットに公開するための手段（常設サーバー、または動作確認時は
  [ngrok](https://ngrok.com/) などのトンネリングツール）

## 使い方

### 1. リレーサーバーを起動する

```bash
python3 utage_webhook_relay.py --port 8787 --token "任意の推測されにくい文字列" --output leads.csv
```

`--token` を設定すると、URLに `?token=...` を付けたリクエストしか受け付けなく
なります（インターネットに公開する場合は必須です）。

### 2. UTAGE側にWebhook送信先を登録する

UTAGEの該当ステップの設定画面で、Webhook送信先URLとして

```
https://<公開したホスト>:8787/webhook/utage?token=任意の推測されにくい文字列
```

を登録してください。ローカルで試す場合は `ngrok http 8787` 等で一時的に
公開URLを発行できます。

### 3. 受信したリードを確認する

送信された内容は `leads.csv` に自動的に記録されます。列名やキー名は
UTAGE側のフォーム設定次第で変わるため、メールアドレス・氏名・LINEユーザーID・
電話番号らしきフィールドをキー名から推測して抽出しつつ、**元データは
`raw_payload` 列にJSONとしてそのまま保存**しているので、抽出漏れがあっても
後から確認・再処理できます。

### 4. 他ツールへつなぐ

`leads.csv` の列を `email,name`（newsletter-automator用）や
`userId,name`（line-automator用。LINEユーザーIDが取得できている場合）に
リネーム・整形すれば、そのまま配信リストとして使えます。

```bash
# 例: emailとname列だけ抜き出してnewsletter-automatorの購読者リストに変換
python3 -c "
import csv
with open('leads.csv') as f, open('subscribers.csv', 'w', newline='') as out:
    r = csv.DictReader(f)
    w = csv.writer(out)
    w.writerow(['email', 'name'])
    for row in r:
        if row['email']:
            w.writerow([row['email'], row['name']])
"
```

## エンドポイント

| メソッド/パス | 説明 |
|---|---|
| `POST /webhook/utage?token=...` | UTAGEからのWebhookを受信（JSON / フォームエンコード両対応） |
| `GET /health` | 死活監視用 |

## 含まれないもの（今後の拡張候補）

- UTAGE側への書き込み（一般公開APIが無いため未対応）
- 受信データの重複排除（同一リードが複数回送られてくる場合、`leads.csv` には
  都度追記されます）
- HTTPS終端（本体はHTTPのみです。公開する場合はリバースプロキシ等でTLS終端してください）
