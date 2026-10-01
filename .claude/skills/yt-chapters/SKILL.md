---
name: yt-chapters
description: >-
  Write YouTube chapters from a transcript, validated against YouTube's own
  rules so they actually render. Use for "add chapters", "timestamps",
  "break this video into sections".
---

# yt-chapters

```bash
python3 chapters.py transcript.srt --target 8
```

## The rules, which are not optional

A chapter list that breaks any of these silently does not become chapters at all - the block just
sits in the description doing nothing:

- The first entry must be **00:00**.
- There must be **at least three**.
- Each must be **at least 10 seconds** long.

The tool checks all three and tells you when a list is invalid rather than letting you paste it.

## Retitle every line

`chapters.py` finds the BOUNDARIES well - it scores the pauses you actually took by how much the
vocabulary shifts across them. The titles it emits are the topic words, and they are a draft. A
chapter called "Thumbnails Titles Packaging" is a placeholder. Rewrite each one as the promise of
that section, in the user's voice, three to five words.

Chapters are also a retention diagnostic: if a section cannot be named in five words, it is two
sections or it is filler.

## 日本語チャンネルで使うとき

- ユーザーが日本語なら、出力（台本・タイトル・返信・説明）も日本語で書く。
- FACT（確認できる事実）とIDEA・PLAN（構想）を分けて扱う。数字・実績・固有名詞・肩書きは推測で補わず、不明なら `[FACT:要確認]` と書くか本人に聞く。
- 道具ごとの日本語対応状況は `.claude/skills/README.md` を参照。`hookscore.py` は日本語では未校正なので、点数を根拠に判断しない。

## The gate

Nothing here publishes. This skill writes and you publish. Every output ends in a block the user
copies, and the last line of every run is the question: **ship it, or change it?**
