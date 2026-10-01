---
name: yt-edit
description: >-
  Turn a raw recording's transcript into an edit decision list - dead air,
  filler cues and retakes, with timecodes. Use for "edit this", "cut the
  dead space", "tighten this video", "I rambled", or any request to shorten
  footage from a transcript.
---

# yt-edit

An edit decision list from a timestamped transcript. It prints the cuts. You apply them.

```bash
python3 deadair.py transcript.srt              # srt, vtt or whisper json
python3 deadair.py transcript.srt --floor 0.35 --json
```

No transcript yet? Ask for one, or produce one first - `whisper`, `faster-whisper`, or the caption
track YouTube generates on an unlisted upload all work. Do not guess at timings.

## What it finds

- **DEAD** - gaps longer than the floor, trimmed from the MIDDLE so both sides keep a breath.
  Cutting flush against speech is what makes a tightened take sound gasping.
- **FILLER** - cues that are nothing but "um", "so yeah", "basically".
- **REPEAT** - a sentence restarted. Compared against the last cue that was actually speech, not
  the literal previous cue, because most retakes have an "um" between the two attempts.

## What it will not do

It does not touch media. It has no opinion about your B-roll. A 40% cut on the report is a 40% cut
of SPEECH, and if the video has a long silent demo in it that number is wrong - check the report
against the footage before you trust the runtime at the bottom.

## 日本語チャンネルで使うとき

- ユーザーが日本語なら、出力（台本・タイトル・返信・説明）も日本語で書く。
- FACT（確認できる事実）とIDEA・PLAN（構想）を分けて扱う。数字・実績・固有名詞・肩書きは推測で補わず、不明なら `[FACT:要確認]` と書くか本人に聞く。
- 道具ごとの日本語対応状況は `.claude/skills/README.md` を参照。`hookscore.py` は日本語では未校正なので、点数を根拠に判断しない。

## The gate

Nothing here publishes. This skill writes and you publish. Every output ends in a block the user
copies, and the last line of every run is the question: **ship it, or change it?**
