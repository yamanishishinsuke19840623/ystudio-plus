# YouTube Agent スキル（YSTUDIO版）

Claude Code 用のプロジェクトスキル11本。YouTubeチャンネル運用を
「FACT → WHY → SHAPE → MAKE → DO → LEARN」の流れで回すためのもの。
全スキル共通で「盛らずに、掘る」を守る。

| 段階 | スキル | 用途 |
|---|---|---|
| FACT/WHY | `yt-channel-strategy` | チャンネル設計・シリーズ構成 |
| SHAPE | `yt-topic-ideas` | 企画出し → `topics.json` へ追加 |
| MAKE | `yt-script` | 台本ドラフト |
| MAKE | `yt-hook` | 冒頭15秒のつかみ |
| MAKE | `yt-title` | タイトル案 |
| MAKE | `yt-thumbnail` | サムネ文言・構図・試作 |
| MAKE | `yt-description` | 概要欄・チャプター・タグ |
| MAKE | `yt-shorts` | ショート／リール切り出し |
| DO | `yt-fact-check` | 公開前FACTチェック |
| DO | `yt-comment-reply` | コメント返信の下書き |
| LEARN | `yt-analytics-review` | 数値の振り返りと次の打ち手 |

使い方：Claude Code で `/yt-script` のように呼ぶか、「台本書いて」等と頼めば自動で選ばれる。
自動生成パイプラインは `tools/youtube-ai-dx-scripts/`（毎朝 GitHub Actions で台本ドラフト生成）。
