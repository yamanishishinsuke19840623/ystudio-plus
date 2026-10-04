# 無限リール自動編集ツール（Reel Automator）

MirAI Camp「無限リール編」の実装。素材動画・フックテキスト・BGMを
組み合わせて、9:16縦型のリール動画（Instagram Reels / TikTok / YouTube Shorts向け）
をバッチで自動生成するCLIツールです。

```
素材クリップ 数 × フックテキスト 数 × BGM 数 = 出力パターン数
```

`hooks.json` にフックを増やす、`music/` にBGMを足す、素材動画を増やす
——それだけで組み合わせは際限なく増えていきます（＝「無限リール」）。
投稿は含みません（生成した動画ファイルを書き出すところまでです）。

## 必要環境

- Python 3.9+（追加のpipパッケージ不要。標準ライブラリのみ）
- `ffmpeg` / `ffprobe`

```bash
# Ubuntu/Debian系の場合
sudo apt-get install -y ffmpeg
```

## 使い方

```bash
python3 reel_automator.py \
  --input ./raw_clips \
  --output ./output \
  --music-dir ./music \
  --variants-per-clip 3
```

- `--input` : 素材動画（mp4/mov/m4v/mkv/avi/webm）を置いたフォルダ
- `--output`: 生成した動画の出力先（`manifest.json` に生成内容の一覧も出力）
- `--music-dir`: BGM音源（mp3/wav/m4a/aac/flac）を置いたフォルダ。省略時はBGMなし
- `--variants-per-clip`: 素材1本あたり何パターン生成するか（既定3）
- `--hooks`: フックテキストのJSONファイル（既定は同梱の `hooks.json`）
- `--duration`: リールの最大秒数（既定30秒。素材がこれより短ければ素材の長さを使用）
- `--font` / `--font-size`: キャプションのフォント・サイズ
- `--music-volume`: BGM音量（0.0〜1.0、既定0.18）
- `--no-caption`: フックテキストを焼き込まない
- `--seed`: 乱数シード（同じ組み合わせを再現したい場合に指定）
- `--overwrite`: 既存の出力ファイルを上書き
- `--dry-run`: 実際には生成せず、生成予定の組み合わせだけ表示

### まず組み合わせだけ確認する

```bash
python3 reel_automator.py --input ./raw_clips --dry-run
```

### 本番生成

```bash
python3 reel_automator.py --input ./raw_clips --output ./output --music-dir ./music
```

生成後、`output/manifest.json` に各動画がどのフック・BGMの組み合わせで
作られたかの一覧が出力されます。SNS投稿時の管理や、反応が良かった
フックの傾向分析に使ってください。

## フックテキストの編集

`hooks.json` は文字列の配列です。`\n` で改行位置を指定できます
（指定しない場合は自動で折り返します）。自社の商材・ターゲットに合わせて
自由に書き換え・追加してください。件数を増やすほど生成パターンが増えます。

```json
[
  "知らないと\n損してます",
  "3秒で\n結論だけ言います"
]
```

## BGMの追加

`music/` フォルダに著作権フリー・利用許諾済みの音源ファイル（mp3等）を
置くだけで、自動的にランダムで組み合わされます。

## やっていること（処理内容）

1. 各素材動画を中央クロップで9:16（既定1080x1920）に変換
2. 指定秒数にトリミング
3. フックテキストを日本語フォントで焼き込み（半透明ボックス付きで可読性確保）
4. BGMをループ・トリミングし、フェードイン/アウトをかけて元音声とミックス
5. `reel_<素材名>_<連番>.mp4` として書き出し

## 含まれないもの（今後の拡張候補）

- SNSへの自動投稿（Instagram/TikTok API連携）
- 音声からの自動字幕起こし（Whisper等の音声認識）
- シーン検出による自動カット編集

まずは「編集の自動化」だけを対象にしています。投稿の自動化まで
必要な場合は別途ご相談ください。
