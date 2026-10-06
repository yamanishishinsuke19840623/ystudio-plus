---
name: yt-topic-ideas
description: YouTube動画の企画の種を出し、tools/youtube-ai-dx-scripts/topics.json のキューに追加する。「ネタ出し」「企画を考えて」「次の動画何にする」で使う。
---

# 企画出し

## 手順
1. `tools/youtube-ai-dx-scripts/topics.json` を読み、既存トピック（重複回避）と最大IDを確認。
2. テーマの方向性を本人に確認（なければ `yt-channel-strategy` の柱に沿う）。
3. 企画を5〜10案、各案に「topic（テーマ）」「angle（切り口）」「想定視聴者」「本人の実体験が必要か」を付けて提示。
4. 本人が選んだ案だけを `topics.json` に追記する：`{"id": "連番3桁", "topic": "...", "angle": "...", "status": "pending"}`。
5. JSONが壊れていないか `jq empty tools/youtube-ai-dx-scripts/topics.json` で検証。

## 注意
- 企画はすべて IDEA/PLAN。実在の事例や数字を前提にした企画は「本人FACTが必要」と明記する。

## 共通原則：盛らずに、掘る
- 情報は FACT／VOICE／IDEA／PLAN／UNKNOWN に分けて扱う。FACT以外を事実として書かない。
- 数字・実績・事例・固有名詞・日時・肩書きは創作しない。必要な箇所は `[FACT:要確認]` と置き、最後に「要確認リスト」を出す。
- 足りない情報は推測で埋めず、本人（やまちゃん）に質問する。アイデアは大胆に、事実は保守的に。
