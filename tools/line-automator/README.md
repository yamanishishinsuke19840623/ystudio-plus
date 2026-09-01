# LINE公式アカウント運用自動化ツール（LINE Automator）

MirAI Camp「LINE公式の無料拡張ツール運用編」の実装。LINE Messaging APIを使い、
一斉配信・セグメント配信（個別プッシュ）・リッチメニュー切り替えをコマンド
ラインから実行するCLIツールです。

## 必要環境

- Python 3.9+（追加のpipパッケージ不要。標準ライブラリ(urllib)のみ）
- LINE Developersコンソールで作成したMessaging APIチャネルの
  **チャネルアクセストークン（長期）**（Messaging APIは無料プランでも
  月200通まで送信できます）

## 使い方

### 一斉配信（友だち全員へ）

```bash
# プレビュー（既定の動作。実際には配信しない）
python3 line_automator.py broadcast --content content.md

# 実際に配信
LINE_CHANNEL_ACCESS_TOKEN=xxxx python3 line_automator.py broadcast --content content.md --send
```

### セグメント配信（友だちリストCSVへ個別プッシュ）

`recipients.example.csv` のように `userId` 列（必須）・`name` 列（任意）を
持つCSVを用意します。本文中で `{{name}}` を使うと差し込まれます。

```bash
# プレビュー
python3 line_automator.py push --content content.md --recipients recipients.csv

# 実際に送信
LINE_CHANNEL_ACCESS_TOKEN=xxxx python3 line_automator.py push \
  --content content.md --recipients recipients.csv --send --interval 0.3
```

### リッチメニューの切り替え

キャンペーンやイベントに合わせて、あらかじめLINE Developersコンソールで
作成しておいたリッチメニューIDへデフォルトメニューを切り替えます。

```bash
LINE_CHANNEL_ACCESS_TOKEN=xxxx python3 line_automator.py richmenu \
  --set-default richmenu-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx --send
```

## オプション

すべてのサブコマンドに共通で `--send`（実際に実行。省略時はプレビューのみ）
と、親コマンド側の `--api-base`（テスト用にAPIのベースURLを差し替え。
**サブコマンドより前に指定**: `line_automator.py --api-base ... broadcast ...`）
があります。

## 含まれないもの（今後の拡張候補）

- 友だち追加時のステップ配信（あいさつメッセージの高度な分岐）
- Flex Message（カード型リッチメッセージ）のテンプレート化（現状はテキストのみ）
- タグ・属性に応じた自動セグメント抽出（現状はCSVを手動で用意する運用）
