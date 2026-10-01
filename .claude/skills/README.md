# YouTube スキル（yt-*）

出典：[Jakeschincariol/youtube-agent-skill](https://github.com/Jakeschincariol/youtube-agent-skill)
（commit `a2feb21`, MIT License → `YT-AGENT-LICENSE`）を、このリポジトリ用に取り込んだもの。

## 何ができて、何ができないか（FACT）

- **YouTubeには接続しません。** APIキー・ログイン不要。投稿もしません。
  入力は「文字起こし（srt / vtt / whisper json）」「YouTube Studioから書き出したCSV」「貼り付けたテキスト」です。
- すべてのスキルは最後に「出す？直す？」で終わり、公開は本人が行います。
- Python 3 だけで動きます（依存ライブラリなし）。

## 11のスキル

| コマンド | 内容 | 道具 |
| --- | --- | --- |
| `/yt-script` | 企画 → フック5案（21の型）→ 台本（画面指示つき） | `hookscore.py` |
| `/yt-package` | タイトルとサムネ文言をセットで点検 | `title.py` |
| `/yt-edit` | 文字起こし → カット指示リスト（無音・フィラー・言い直し） | `deadair.py` |
| `/yt-chapters` | 文字起こし → チャプター（YouTubeの表示ルールを検証） | `chapters.py` |
| `/yt-retention` | 視聴維持率CSV → どこで離脱したか | `retention.py` |
| `/yt-viral` | ジャンル内で「そのチャンネルの中央値の何倍伸びたか」で比較 | `swipe.py` |
| `/yt-shorts` | 長尺の中からショートになる箇所を探す | — |
| `/yt-seo` | 概要欄・タグ・狙う検索語 | — |
| `/yt-comment` | コメントを4分類して返信案 | — |
| `/yt-plan` | 使える時間に合わせた週の投稿計画 | — |
| `/yt-audit` | チャンネル全体を見て「直すべき1つ」 | — |

## 日本語対応で手を入れた箇所

| 道具 | 日本語での状態 |
| --- | --- |
| `deadair.py` | 日本語フィラー（えーと／あのー／まあ 等）と言い直しを検出するよう追加。動作確認済み |
| `chapters.py` | 漢字・カタカナの語で話題の切れ目を判定するよう追加。動作確認済み |
| `title.py` | 漢字・カタカナで「サムネがタイトルと同じ言葉を繰り返していないか」を判定するよう追加。動作確認済み。ただし文字数の基準（60/40字）とサムネ「3語まで」は英語基準のまま |
| `hookscore.py` | **日本語では未校正。** 点数は出るが当てにならないため、日本語のときは注意書きを表示するようにした。21の型はチェックリストとして使う |
| `retention.py` / `swipe.py` | 数値処理なので言語に関係なく動く（`swipe.py` の「型」判定は英語タイトルのみ） |

## 最初にやること

1. `.claude/youtube/voice.md` の `UNKNOWN` を埋める（自分の動画の文字起こし3本を渡して「voice.mdを書いて」でも可）
2. 試しに `/yt-package` でタイトル案を点検してみる

## 既存の仕組みとのつなぎ方（IDEA）

- `tools/youtube-ai-dx-scripts/` が毎日つくる台本ドラフト → `/yt-script` でフックを作り直す → `/yt-package` でタイトル・サムネを決める
- 撮影後の文字起こし → `/yt-edit`（カット）→ `/yt-chapters` → `/yt-seo`
- 公開後の維持率CSV → `/yt-retention` → 次の台本へ
