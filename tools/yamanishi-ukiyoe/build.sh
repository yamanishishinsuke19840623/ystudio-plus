#!/bin/sh
# 山西水産 浮世絵30秒をゼロから作り直す: sh build.sh
# LIB = Lemo-Opuscar ライブラリの場所（setup.sh が表示する LIB=...）。ffmpeg 7 以上が必要。
set -e
HERE=$(cd "$(dirname "$0")" && pwd)
LIB=${LIB:-$HOME/lemo-opuscar}
export LIB
[ -f "$LIB/core/render/video.mjs" ] || { echo "set LIB to the Lemo-Opuscar library folder"; exit 1; }
cd "$LIB"
node core/render/events.mjs "$HERE" --size 1080x1920
node core/render/video.mjs "$HERE" --fps 24 --workers 3 --size 1080x1920 --out "$HERE/out/video.mp4"
"$LIB/.venv/bin/python" "$HERE/mix.py"
sh core/render/mux.sh "$HERE/out/video.mp4" "$HERE/out/mix.wav" "$HERE/yamanishi-ukiyoe.mp4" 24 0
