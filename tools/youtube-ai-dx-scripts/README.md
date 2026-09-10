# YouTube台本自動生成（AI・DX活用ノウハウ）

「YouTubeに完全自動で毎日投稿」系のサービスを外部契約するのではなく、
自分たちで小さく動かして検証するためのMVPです。

**現在のスコープ：台本生成まで。** 音声化・動画化・自動アップロードはまだ含みません。

## 仕組み

1. `topics.json` に企画の種（テーマ・切り口）をキューとして持つ
   - すべて PLAN（構想）/ IDEA（仮説）であり、FACTではありません
2. `generate.mjs` が未処理（`status: "pending"`）のトピックを1つ取り出し、
   GitHub Models で台本ドラフト（Markdown）を生成
3. 生成結果は `output/` に保存し、`topics.json` の該当トピックを `done` にする
4. GitHub Actions（`.github/workflows/youtube-ai-dx-script.yml`）で定期実行し、
   生成物をリポジトリにコミットする

## ハルシネーション対策

台本生成のシステムプロンプトで「盛らずに、掘る」原則を強制しています。
具体的な数字・事例・実績などは AI が創作せず、`[FACT:要確認]` というプレースホルダーを
挿入するよう指示しています。**生成された台本はすべて DRAFT（下書き）であり、
撮影前に必ず本人が FACT を確認・加筆してください。**

## 使っているAI（無料）

外部AIサービスの契約は不要です。**GitHub Models**（GitHubが無料で提供するAI推論API）を使っています。
GitHub Actions上では、ワークフローに `permissions: models: read` を付けるだけで
自動発行される `GITHUB_TOKEN` がそのまま使えます。クレジットカード登録も追加の
アカウント作成も必要ありません（ただし無料枠にはレート制限があります）。

デフォルトのモデルは `openai/gpt-4o-mini` です。変更したい場合はワークフローや
ローカル実行時に環境変数 `GITHUB_MODEL` を指定してください（GitHub Models の
カタログにある他のモデルIDを指定できます）。

## セットアップ

1. GitHub Actions ワークフロー（`.github/workflows/youtube-ai-dx-script.yml`）は
   すでに `permissions: models: read` を持っているので、追加のシークレット登録は不要です
2. `topics.json` に企画したいテーマを追加していく

## ローカルでの実行

GitHub CLI（`gh auth token`）や、`models:read` 権限を持つ Personal Access Token で実行できます。

```bash
cd tools/youtube-ai-dx-scripts
npm install
GITHUB_MODELS_TOKEN=$(gh auth token) npm run generate
```

## 今後の拡張ロードマップ（PLAN）

- [ ] 台本 → TTSで音声化
- [ ] 音声＋静止画/テロップで簡易動画を自動生成
- [ ] YouTube Data API 経由での自動アップロード（限定公開から開始し、確認後に公開）

いずれも「まず動かして検証する」方針に沿って、段階的に広げていきます。
