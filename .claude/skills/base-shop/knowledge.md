# BASE MCP の技術ノウハウ

実際にやってみて分かったこと。確認した日付を残し、想定のままのものは「未確認」と書く。

## BASE API の実際のふるまい（本物で確認済み）
- **トークン切れは 401 ではなく 400 で返る**。`400 invalid_request`、本文の `error_description` は「アクセストークンが無効です」（2026-10-10 確認）。`base-client.mjs` の `isTokenError` は、401 か「400 で本文がトークンエラー」のときにだけリフレッシュする
- **エラー本文の日本語は `\uXXXX` でエスケープされて届く**。文字列のまま正規表現にかけず、`JSON.parse` してから判定する
- OAuth（`/1/oauth/authorize` → localhost のコールバック → `/1/oauth/token`）は、この実装のまま本物で通った（2026-10-10）

## 環境ごとの注意
- **Windows**：入力（stdin）を開いたまま `process.exit()` すると、`0xC0000409` で異常終了することがある。`process.stdin.destroy()` で入力を閉じ、`process.exitCode` を設定して自然に終わらせる
- **Windows**：PowerShell の実行ポリシーで `npm.ps1` が止められたら、`npm.cmd run setup` で動く
- **OAuth のコールバックサーバー**：ブラウザの keep-alive 接続が残るとプロセスが終わらない。応答に `Connection: close` を付け、`server.closeAllConnections()` を呼ぶ
- **Claude Code / Desktop の自動登録**：Windows の `claude` は `.cmd` なので shell 経由で呼ぶ。空白を含むパス（`C:\Program Files\...`）はクォートする
- **テスト**：setup のテストでは、HOME・APPDATA・USERPROFILE をすべて仮フォルダに向ける。本物の Claude の設定に書き込まないため

## まだ想定のまま（本物で確認したら上に移す）
- レスポンスの項目名（`tools.mjs` の `F`）と、売上合計（total）の中身
- 書き込みのパラメータ名（edit_stock / edit / edit_status / items/add / add_image）
- 注文一覧の期間指定（start_ordered / end_ordered）が効くか
- 複数スコープの区切り方、トークンの有効期限

## 作業の進め方で効いたこと
- **モック API は本物のふるまいに合わせる**。実機で違いが見つかったら、まずモックを実機と同じ返し方に直す。そうしてから実装を直すと、テストが同じ間違いを二度通さない
- **本物の API に届かない作業環境では、項目名を推測で埋めない**。`requireFields` でエラーにして、実データで直す場所（`F`）を1か所にまとめておく
- **マージ済みの PR のブランチ**は master から作り直して使う。push が拒否されたら、上書きせずに fetch して中身を確認し、merge で取り込む（別のセッションで実機の修正が入っていることがある）
