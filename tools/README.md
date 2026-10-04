# MirAI Camp 自動化ツール集

MirAI Campで扱っているSNS・マーケティング自動化の実装例です。いずれも
Python標準ライブラリのみで動作し（動画系のみffmpegが別途必要）、既定では
実際の送信・投稿を行わない「プレビュー(dry-run)モード」で安全に試せます。

| ディレクトリ | 内容 |
|---|---|
| [`reel-automator/`](./reel-automator) | 無限リール自動編集。素材×フック×BGMを組み合わせて9:16縦型リールをバッチ生成 |
| [`newsletter-automator/`](./newsletter-automator) | 自動メルマガ配信。原稿×購読者リストからHTMLメールを合成しSMTP配信 |
| [`youtube-automator/`](./youtube-automator) | YouTube動画自動編集・自動投稿。結合・テロップ・サムネイル生成からAPIアップロードまで |
| [`threads-automator/`](./threads-automator) | Threads自動作成・自動投稿。フック×トピック×CTAで投稿文を自動生成しAPI投稿 |
| [`utage-automation/`](./utage-automation) | UTAGE Webhook連携。UTAGEのWebhook通知を受け取り他ツールへ橋渡しするリレー |
| [`line-automator/`](./line-automator) | LINE公式アカウント運用自動化。一斉配信・セグメント配信・リッチメニュー切り替え |

各ツールの詳しい使い方は、それぞれのディレクトリ内の `README.md` を参照してください。

## 共通の設計方針

- **依存ライブラリなし**: 追加のpipインストールを求めない（標準ライブラリのみ）
- **既定はプレビューのみ**: `--send` / `--post` / `--upload` 等を明示しない限り、
  実際の配信・投稿・アップロードは行わない
- **重複防止のログ**: 送信・投稿済みの記録をCSV/JSONに残し、再実行しても
  二重送信しない設計
- **バンク型の組み合わせ生成**: フック・トピック・BGM等をJSON/フォルダで
  管理し、追加するだけで生成パターンが増える（＝「無限」に作れる）
