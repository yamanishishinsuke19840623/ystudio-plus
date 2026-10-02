#!/usr/bin/env bash
# 下関ふぐ屋やまちゃん（@shimofugu）の公開動画情報と自動字幕を集める。
# 公開情報のみ。ログインはしない。www.youtube.com への接続許可が必要。
set -euo pipefail
cd "$(dirname "$0")"
CH="https://www.youtube.com/@shimofugu"
mkdir -p data subs
command -v yt-dlp >/dev/null || pip install -q yt-dlp

# 1) 動画・ショートの一覧（タイトル・再生数・長さ・投稿日）
for tab in videos shorts; do
  yt-dlp --flat-playlist -J "$CH/$tab" > "data/$tab.json" || echo "skip $tab"
done

# 2) 各動画の詳細（投稿日・高評価・コメント数・説明欄）と日本語の自動字幕
yt-dlp --skip-download --write-info-json --write-auto-subs --write-subs \
  --sub-langs "ja.*" --sub-format vtt --ignore-errors \
  -o "subs/%(id)s.%(ext)s" "$CH/videos" "$CH/shorts"

# 3) /yt-viral 用の入力に変換
python3 - <<'PY'
import json, glob
rows = []
for f in glob.glob("subs/*.info.json"):
    d = json.load(open(f))
    rows.append({"channel": "shimofugu", "id": d["id"], "title": d.get("title", ""),
                 "views": d.get("view_count") or 0, "likes": d.get("like_count"),
                 "comments": d.get("comment_count"), "duration": d.get("duration"),
                 "upload_date": d.get("upload_date"), "url": d.get("webpage_url")})
json.dump(rows, open("data/collected.json", "w"), ensure_ascii=False, indent=1)
print(f"{len(rows)} videos -> data/collected.json")
PY
