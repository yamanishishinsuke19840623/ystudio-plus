# Threads自動作成・自動投稿ツール（Threads Automator）

MirAI Camp「Threads自動作成自動投稿編」の実装。`hooks.json`（フック）×
`topics.json`（本題）× `ctas.json`（締めの一言）を組み合わせて投稿文を自動生成し、
Threads API（Meta Graph API）経由で自動投稿するCLIツールです。

```
フック 数 × トピック 数 × CTA 数 = 生成できる投稿パターン数
```

各バンクに文言を追加するだけで組み合わせは際限なく増えます（＝「無限」に投稿文を作れる）。

## 必要環境

- Python 3.9+（追加のpipパッケージ不要。標準ライブラリ(urllib)のみ）
- Meta for Developersで作成した「Threads API」アプリと、長期アクセストークン・
  ThreadsユーザーID（[Meta公式ドキュメント](https://developers.facebook.com/docs/threads)を参照）

## 使い方

### 1. まず生成される投稿文を確認する（既定の動作。実際には投稿しない）

```bash
python3 threads_automator.py --count 3 --dry-run
```

（`--post` を付けなければ常にプレビューのみです）

### 2. 実際に投稿する

```bash
THREADS_ACCESS_TOKEN=xxxx \
THREADS_USER_ID=1234567890 \
python3 threads_automator.py --count 3 --post --interval 60
```

- `--interval 60` : 投稿間隔（秒）。連投を避けてアカウントへの負荷・スパム判定を抑える
- `--posted-log posted_log.csv` : 投稿済みの記録。**同じログファイルを指定して再実行すると、
  同一内容（フック×トピック×CTAの組み合わせ）は再投稿しません**
- `--seed 42` : 乱数シードを固定すると、同じ組み合わせが再現されます

## バンクの編集

`hooks.json` / `topics.json` / `ctas.json` はいずれも文字列配列のJSONです。
自社の商材・ターゲットに合わせて自由に書き換え・追加してください。件数を
増やすほど生成パターンが増えます。

```json
[
  "知らないと損してます。",
  "え、まだ手作業でやってるんですか？"
]
```

## 仕組み（Threads APIの投稿フロー）

1. `POST /{threads-user-id}/threads` でメディアコンテナを作成（`creation_id` を取得）
2. `POST /{threads-user-id}/threads_publish` で `creation_id` を公開

`--api-base` オプションでAPIのベースURLを差し替えられます（テスト・モック用）。

## 含まれないもの（今後の拡張候補）

- 画像・動画付き投稿（現状はテキスト投稿のみ）
- 投稿後の反応（いいね・返信数）の自動集計
- アクセストークンの自動更新（長期トークンは60日で失効するため、定期的な再発行が必要です）
