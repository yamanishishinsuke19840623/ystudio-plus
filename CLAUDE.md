# Project

Yスタジオ＋（下関・山口のAI Field Deployment支援）のWebサイト・提案資料・チラシ・PDF資料を管理するリポジトリ。

主なコンテンツ：
- `index.html`, `nightbubble.html`, `chamber.html`, `training.html`, `privacy.html` — 公開Webページ
- `proposal.html` — 法人向け提案書・チラシ
- `subsidy_guide.pdf`, `training_service_guide.pdf` — 資料PDF
- 画像・写真アセット一式

# Working Rules

- 編集前に、対象ページおよび関連する既存ページ（料金・実績・連絡先など重複情報を持つページ）を確認する
- 事実と推測を区別する
- 料金・実績数値・日付・固有名詞・お客様の声など、既存ページやPDFに根拠のない内容を新たに作らない
- 不明な情報は「未確認」として明記し、勝手に数値や実績を埋めない
- PDF（`subsidy_guide.pdf`, `training_service_guide.pdf`）は原本として扱い、内容を転記する際は改変しない
- 修正は問題がある箇所に限定し、無関係な文言・レイアウトを書き換えない

# Quality Rules

成果物（HTMLページ・提案書・チラシ文面）を完成とする前に、以下を確認する。

- 目的（誰に何を伝えるか）を満たしている
- 完了条件を満たしている
- 他ページと矛盾する料金・実績・連絡先がない
- og:title / meta description など既存ページと重複・矛盾しない
- スマートフォン幅でレイアウトが崩れていない（style内のレスポンシブ指定を確認）
- JudgeのCritical / Majorが残っていない

# Safety

- サイトの公開（デプロイ・pushによる本番反映）は実行前に確認する
- 個人情報（顧客名・連絡先・実績データ）を実在の許可なく追加・公開しない
- 料金・キャンペーン情報など対外的コミットメントを伴う変更は実行前に確認する
- APIキーや秘匿情報を出力・コミットしない
