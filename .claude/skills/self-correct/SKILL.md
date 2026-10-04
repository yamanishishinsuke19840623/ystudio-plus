---
name: self-correct
description: builderで成果物（HTMLページ・提案資料・チラシ文面など）を作成・修正し、judgeで独立検証し、合格条件を満たすまで改善するときに使用する。
---

# Self Correction Workflow

## 1. Define

最初に整理する。

- 目的（誰に何を伝えるか）
- 入力（対象ファイル、参照すべき既存ページ・PDF）
- 完了条件
- 評価基準
- 変更禁止範囲
- 最大修正回数

## 2. Build

builderを使用して成果物を作成・修正する。

## 3. Judge

judgeを使用して独立検証する。

judgeは成果物を変更しない。

## 4. Decide

Critical > 0
→ RETRY

Major > 0
→ RETRY

重要項目がUNVERIFIED
→ 既存ページ・PDFを再確認 または ESCALATE

Critical = 0
Major = 0
重要なUNVERIFIED = 0
→ PASS

## 5. Retry

judgeの最新フィードバックのみbuilderへ渡す。

問題がない箇所は変更しない。

## 6. Stop

最大3回でPASSしなければ停止する。

最後に報告する。

- 現在の成果物
- 残課題
- 試した修正
- 人間に判断してほしいこと（例：料金・実績の最終確認、公開の可否）
