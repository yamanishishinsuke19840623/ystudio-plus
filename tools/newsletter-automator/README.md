# 自動メルマガ配信ツール（Newsletter Automator）

MirAI Camp「自動メルマガ編」の実装。原稿ファイルと購読者リストから
パーソナライズ済みHTMLメールを合成し、SMTP経由で配信するCLIツールです。

## 必要環境

- Python 3.9+（追加のpipパッケージ不要。標準ライブラリ(smtplib)のみ）
- 送信に使うSMTPアカウント（Gmail・独自ドメインメール・送信専用SMTPサービス等）

## 使い方

### 1. 購読者リストを用意する（CSV）

`subscribers.example.csv` を参考に、`email` 列（必須）と `name` 列（任意）を持つ
CSVを用意してください。それ以外の列も用意すれば `{{列名}}` として本文中で使えます。

### 2. 原稿を書く

`content.example.md` のように、空行区切りの段落で本文を書きます
（見出しタグ等は使わない簡易フォーマットです）。

### 3. プレビュー（既定の動作。実際には送信しません）

```bash
python3 newsletter_automator.py \
  --content content.md \
  --subscribers subscribers.csv \
  --subject "今月のAI活用ヒント"
```

先頭1件分のレンダリング結果と、配信予定件数が表示されます。

### 4. 本番配信

環境変数でSMTP情報を渡し、`--send` を付けて実行します。

```bash
SMTP_HOST=smtp.example.com \
SMTP_PORT=587 \
SMTP_USER=you@example.com \
SMTP_PASS=xxxxxxxx \
FROM_ADDR="Yスタジオ+ <you@example.com>" \
python3 newsletter_automator.py \
  --content content.md \
  --subscribers subscribers.csv \
  --subject "今月のAI活用ヒント" \
  --send
```

- `--limit N` : まず数件だけテスト送信したい場合に指定
- `--interval 1.0` : 1通ごとの送信間隔（秒）。SMTPサーバのレート制限対策
- `--sent-log sent_log.csv` : 送信結果のログ。**同じログファイルを指定して再実行すると、
  既に送信済み(`sent`)のアドレスへは再送しません**（送信失敗時のリトライ運用を想定）

## オプション一覧

| オプション | 説明 |
|---|---|
| `--content` | 本文原稿ファイル（必須） |
| `--subscribers` | 購読者CSV（必須） |
| `--subject` | 件名（必須） |
| `--template` | HTMLテンプレート（既定: `template.html`） |
| `--unsubscribe-url` | 配信停止ページのURL |
| `--sent-log` | 送信済みログCSVのパス |
| `--interval` | 送信間隔（秒） |
| `--limit` | 今回送信する最大件数 |
| `--send` | 実際に送信する（省略時はプレビューのみ） |

## 含まれないもの（今後の拡張候補）

- 開封率・クリック率のトラッキング
- 配信停止フォームの自動処理（`--unsubscribe-url` の先はご自身でご用意ください）
- ESP（SendGrid等のメール配信サービス）のAPI連携（現状はSMTP直送のみ）
