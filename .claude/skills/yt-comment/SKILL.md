---
name: yt-comment
description: >-
  Draft replies to YouTube comments in the creator's voice, triaged by which
  ones are worth answering. Use for "reply to my comments", "handle the
  comment section", "someone asked X", or a pasted comment thread.
---

# yt-comment

The comment section is a retention surface, not a chore. Replies in the first few hours are what
decide whether a thread becomes a conversation other people read.

## Before you write

1. Read `.claude/youtube/voice.md` in this repo (fall back to `~/.claude/youtube/voice.md`) if it exists. Treat any line still marked `UNKNOWN` as unknown - never fill it in yourself. That is the user's voice profile: how they talk
   on camera, the words they never use, who they are talking to, what they will not claim. If it
   does not exist, ask for **three of their own videos**, read or transcribe them, infer the voice,
   and write the file. A script in the wrong voice is worse than no script, because they have to
   read it out loud.
2. Never invent a number, a result or a source. If a figure would strengthen it and you do not have
   one, ask for it or write the line without it.

## Triage first, always

Sort what the user pastes into four piles and say how many are in each before writing anything:

1. **Questions** - answer them. These are your next video's topics, so note the repeats.
2. **Corrections** - if they are right, say so plainly and thank them. Never argue a fact you
   cannot check.
3. **Praise** - reply to a few, briefly, with something specific from their comment. A wall of
   identical "thank you!" replies reads as automated because it is.
4. **Bait** - do not reply. Say so and move on. Never write a comeback, however deserved.

## Writing the reply

- Under 30 words. A long reply in a comment thread is a blog post nobody asked for.
- Answer the actual question in the first sentence.
- One question back, only when it is real.
- No emoji unless the user's own replies use them. Check their voice file.
- Never promise a video you have not agreed to make.

## The heart and the pin

Say which ONE comment to pin and why. Pin the question the most people also have, not the nicest
one. Heart generously - it costs nothing and it is visible.

## 日本語チャンネルで使うとき

- ユーザーが日本語なら、出力（台本・タイトル・返信・説明）も日本語で書く。
- FACT（確認できる事実）とIDEA・PLAN（構想）を分けて扱う。数字・実績・固有名詞・肩書きは推測で補わず、不明なら `[FACT:要確認]` と書くか本人に聞く。
- 道具ごとの日本語対応状況は `.claude/skills/README.md` を参照。`hookscore.py` は日本語では未校正なので、点数を根拠に判断しない。

## The gate

Nothing here publishes. This skill writes and you publish. Every output ends in a block the user
copies, and the last line of every run is the question: **ship it, or change it?**
