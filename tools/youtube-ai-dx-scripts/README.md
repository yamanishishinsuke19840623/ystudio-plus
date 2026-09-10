# YouTube台本自動生成（AI・DX活用ノウハウ）

「YouTubeに完全自動で毎日投稿」系のサービスを外部契約するのではなく、
自分たちで小さく動かして検証するためのMVPです。

**現在のスコープ：台本生成まで。** 音声化・動画化・自動アップロードはまだ含みません。

## 仕組み

1. `topics.json` に企画の種（テーマ・切り口）をキューとして持つ
   - すべて PLAN（構想）/ IDEA（仮説）であり、FACTではありません
2. `generate.mjs` が未処理（`status: "pending"`）のトピックを1つ取り出し、
   Claude APIで台本ドラフト（Markdown）を生成
3. 生成結果は `output/` に保存し、`topics.json` の該当トピックを `done` にする
4. GitHub Actions（`.github/workflows/youtube-ai-dx-script.yml`）で定期実行し、
   生成物をリポジトリにコミットする

## ハルシネーション対策

台本生成のシステムプロンプトで「盛らずに、掘る」原則を強制しています。
具体的な数字・事例・実績などは AI が創作せず、`[FACT:要確認]` というプレースホルダーを
挿入するよう指示しています。**生成された台本はすべて DRAFT（下書き）であり、
撮影前に必ず本人が FACT を確認・加筆してください。**

## セットアップ

1. Anthropic の API キーを発行する
2. GitHub リポジトリの Settings → Secrets and variables → Actions で
   `ANTHROPIC_API_KEY` という名前のシークレットを登録する
3. `topics.json` に企画したいテーマを追加していく

## ローカルでの実行

```bash
cd tools/youtube-ai-dx-scripts
npm install
ANTHROPIC_API_KEY=sk-xxxx npm run generate
```

## 今後の拡張ロードマップ（PLAN）

- [ ] 台本 → TTSで音声化
- [ ] 音声＋静止画/テロップで簡易動画を自動生成
- [ ] YouTube Data API 経由での自動アップロード（限定公開から開始し、確認後に公開）

いずれも「まず動かして検証する」方針に沿って、段階的に広げていきます。
