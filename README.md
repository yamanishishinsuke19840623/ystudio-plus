# ystudio-plus

Yスタジオ＋ の Web サイト（GitHub Pages / 独自ドメイン `ystudio.yamanisi.co.jp`）と、
それに付随する自動化ツールのリポジトリです。

> この README はリポジトリ内のファイル・リンク関係から確認できた事実（FACT）だけで書いています。
> 各ページの目的や公開状況について、ファイルから読み取れないものは「不明」としています。

## 1. ページ一覧

ファイル名がそのまま公開 URL になります（例: `ystudio.yamanisi.co.jp/nightbubble.html`）。
外部からリンクされている可能性があるため、**ファイル名の変更・移動は URL が変わる点に注意**してください。

### トップページ（index.html）からリンクされているページ

| ファイル | タイトル | 主に使う素材 |
|---|---|---|
| `index.html` | Yスタジオ＋ \| AI Field Deployment — 下関・山口 | `flyer.png`, `media/showreel-kanmon.*` |
| `training.html` | AI・DX研修パッケージ｜人材開発支援助成金対応 | `subsidy_guide.pdf`, `training_service_guide.pdf` |
| `nightbubble.html` | ナイトバブルショー 下関 | `kaosuya-nightbubble-*.jpg`, `otsukimi-*.jpg`, `event-day*.jpg`, `bubble-bg.png`, `nightbubble-logo.png`, `shabon-ojisan2.jpeg` |
| `pv.html` | 山西水産 ブランドPV制作ガイド | `shinsuke.jpg`, `fuku-to-ikiru.mid` |
| `song.html` | 潮風と、ふくと。｜山西水産 オリジナルテーマソング | `fuku-to-ikiru.mid` |
| `kanmon-reel.html` | かんもんノート 新着リール | `reel-data/`, `reel-out/`, `kanmonnote-logo.png` |
| `showreel.html` | かんもんノート Showreel | `kanmonnote-logo.png` |
| `privacy.html` | プライバシーポリシー | — |

### どのページからもリンクされていないページ（URL 直打ち・個別共有用と思われる）

| ファイル | タイトル | 主に使う素材 |
|---|---|---|
| `chamber.html` | 下関商工会議所 会員事業者AI支援 提案資料 | `shinsuke.jpg` |
| `proposal.html` | Yスタジオ＋ 法人向けチラシ | — |
| `kanmon-kaigi.html` | 関門カイギ | `kanmon-kaigi/` |
| `kanmon-kaigi-reel.html` | 関門カイギ ショーリール | `kanmon-kaigi/flyer-*.jpg`, `harbor.jpg`, `logo-circle.png` |

## 2. フォルダ構成

```
/                     … 公開ページ(*.html) と ページ用の画像・PDF（ルート直下に混在）
media/                … トップのショーリール動画・サムネイル
kanmon-kaigi/         … 関門カイギ用のチラシ画像・ロゴ
  video/              … 関門カイギ動画（約28MB）
reel-data/            … かんもんノート記事データ（自動生成）
reel-out/             … かんもんノート リール動画・投稿文（自動生成）
tools/
  kanmon-reel/        … 記事取得・動画生成・Instagram投稿スクリプト
  youtube-ai-dx-scripts/ … YouTube台本の自動生成（詳細は同フォルダの README）
.github/workflows/    … 上記ツールの定期実行
```

## 3. 自動化（GitHub Actions）

| ワークフロー | スケジュール(UTC) | 内容 | 自動で更新するもの |
|---|---|---|---|
| `kanmon-reel-data.yml` | 毎週日曜 21:00（日本時間 月曜 6:00） | WordPress から記事取得 → 動画生成 → コミット → Instagram リール投稿 | `reel-data/`, `reel-out/` |
| `youtube-ai-dx-script.yml` | 毎日 21:00（日本時間 6:00） | GitHub Models で YouTube 台本ドラフトを生成 | `tools/youtube-ai-dx-scripts/` 配下 |

`reel-data/` と `reel-out/` は自動生成物なので、手で編集しないでください。
コミット履歴の「かんもんノート リール用データと動画を更新」はこのワークフローによるものです。

## 4. 現在どのファイルからも参照されていない素材

コード上（*.html / tools / workflows）で参照が見つからなかったファイルです。
外部（SNS・メール等）で直接リンクしている可能性もあるため、**削除前に用途を確認**してください。

- `kiyosue-1.jpg` 〜 `kiyosue-4.jpg`
- `shabon-ojisan.jpeg`（`shabon-ojisan2.jpeg` は使用中）
- `kanmonnote-logo.svg`（`.png` 版は使用中）
- `kanmon-kaigi/video/kanmon-kaigi-B-9x16.mp4`, `kanmon-kaigi-B-16x9.mp4`（D パターンのみ使用中）
- `kanmon-kaigi/logo-text.png`
