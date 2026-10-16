# YouTube動画自動編集・自動投稿ツール（YouTube Automator）

MirAI Camp「YouTube動画自動編集自動投稿編」の実装。`edit`（結合・タイトル
テロップ・サムネイル生成）と `upload`（YouTube Data API v3経由の投稿）の
2ステップからなるCLIツールです。

## 必要環境

- Python 3.9+（追加のpipパッケージ不要。標準ライブラリ(urllib)のみ）
- `ffmpeg` / `ffprobe`（`edit` コマンドで使用）
- Google Cloud ConsoleでYouTube Data API v3を有効化したOAuthクライアント
  （`upload` コマンドで使用。チャンネルの同意を得たリフレッシュトークンが必要）

```bash
sudo apt-get install -y ffmpeg
```

## 使い方

### 1. 編集（結合・タイトルテロップ・サムネイル生成）

```bash
python3 youtube_automator.py edit \
  --input main.mp4 \
  --intro intro.mp4 --outro outro.mp4 \
  --title-text "今月のAI活用ヒント" \
  --output edited.mp4 \
  --thumbnail-out thumb.jpg --thumbnail-time 3
```

- `--intro` / `--outro` は省略可（本編のみでも動作します）
- 各素材は自動的に同じ解像度・フレームレートに正規化してから結合するため、
  スマホ撮影・別カメラの素材が混在していても結合できます
- `--title-text` を指定すると、動画冒頭（既定5秒間）にテロップを焼き込み、
  サムネイル画像にも同じテキストを中央に大きく合成します

### 2. アップロード内容をプレビュー（既定の動作。実際には投稿しない）

```bash
python3 youtube_automator.py upload \
  --video edited.mp4 --title "今月のAI活用ヒント" \
  --description "本編の説明文です。" --tags "AI,DX,業務効率化"
```

### 3. 実際にアップロードする

事前にOAuthクライアントID/シークレットと、対象チャンネルのリフレッシュ
トークンを取得しておきます（[YouTube Data API v3 クイックスタート](https://developers.google.com/youtube/v3/quickstart)を参照）。

```bash
YOUTUBE_CLIENT_ID=xxx \
YOUTUBE_CLIENT_SECRET=xxx \
YOUTUBE_REFRESH_TOKEN=xxx \
python3 youtube_automator.py upload \
  --video edited.mp4 --title "今月のAI活用ヒント" \
  --description "本編の説明文です。" --tags "AI,DX,業務効率化" \
  --thumbnail thumb.jpg --privacy unlisted --upload
```

短命なアクセストークンを直接渡す場合は `YOUTUBE_ACCESS_TOKEN` を設定して
ください（この場合クライアントID/シークレット/リフレッシュトークンは不要）。

- `--privacy` : `private`（既定・下書き確認用）/ `unlisted` / `public`
- `--category-id` : YouTubeカテゴリID（既定 `22` = Blogs/People）
- 動作確認がまず先の場合は `--privacy private` のまま `--upload` することで、
  自分のチャンネルにのみ表示される状態でアップロードできます

## 仕組み

- `edit` : ffmpegで各素材をリサイズ・パディングして解像度を揃えて結合し、
  `drawtext` フィルタで日本語テロップを焼き込む
- `upload` : YouTube Data API v3の[resumable upload](https://developers.google.com/youtube/v3/guides/using_resumable_upload_protocol)
  プロトコルでアップロードし、続けてサムネイル設定APIを呼び出す
- `--api-base` / `--token-endpoint` でAPIのベースURLを差し替えられます（テスト・モック用）

## 含まれないもの（今後の拡張候補）

- OAuth同意画面を通したリフレッシュトークンの初回取得（別途Googleの認可フローが必要です）
- 自動字幕生成・チャプター自動検出
- 複数動画のスケジュール投稿（`--privacy public` にした瞬間に公開されます）
