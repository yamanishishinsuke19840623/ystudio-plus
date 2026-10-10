#!/usr/bin/env bash
# premium-lp スターターを、静的サイト（GitHub Pages など）のリポジトリに展開する。
#
#   bash <skill>/scripts/init-project.sh <プロジェクトのルート> <ページのフォルダ名>
#   例: bash .claude/skills/premium-lp/scripts/init-project.sh . kaosuya-lp
#
# できるもの（既にあるファイルは上書きしない）:
#   <ページ>/index.html        … 山西水産LPの完成形（文言・写真・色を入れ替えて使う見本）
#   <ページ>/img/ <ページ>/media/
#   tools/lp/                  … 動き（src/app.js）・ビルド・動作チェック
#   tools/pv/                  … 60秒PVの描画（pv.html / music.js / render.mjs / stills.mjs）
set -euo pipefail

ROOT="${1:?プロジェクトのルートを指定してください}"
PAGE="${2:?ページのフォルダ名を指定してください（例: kaosuya-lp）}"
case "$PAGE" in
  */*|.*|"") echo "ページのフォルダ名は1階層の名前にしてください（例: kaosuya-lp）" >&2; exit 1 ;;
esac

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STARTER="$SKILL_DIR/assets/starter"

copy() { # copy <src> <dst>: 既にあれば残す
  if [ -e "$2" ]; then
    echo "そのまま: $2（既にあります）"
  else
    mkdir -p "$(dirname "$2")"
    sed "s#__PAGE__#${PAGE}#g" "$1" > "$2"
    echo "作成: $2"
  fi
}

copy "$STARTER/page/index.html"        "$ROOT/$PAGE/index.html"
copy "$STARTER/tools/lp/src/app.js"    "$ROOT/tools/lp/src/app.js"
copy "$STARTER/tools/lp/check.mjs"     "$ROOT/tools/lp/check.mjs"
copy "$STARTER/tools/lp/package.json"  "$ROOT/tools/lp/package.json"
for f in pv.html music.js render.mjs stills.mjs package.json; do
  copy "$STARTER/tools/pv/$f" "$ROOT/tools/pv/$f"
done
mkdir -p "$ROOT/$PAGE/img" "$ROOT/$PAGE/media"
grep -qs '^\.tmp/$' "$ROOT/tools/pv/.gitignore" || echo ".tmp/" >> "$ROOT/tools/pv/.gitignore"

cat <<EOF

次の手順:
  1. $PAGE/index.html の文言・写真・リンクを、その会社の事実（fact-sheet）に入れ替える
     写真は $PAGE/img/ に置く（index.html が参照している名前: logo.jpg, spread.jpg, p1〜p6.jpg, crate.jpg, hands.jpg, yamachan.jpg など）
  2. cd $ROOT/tools/lp && npm install && npm run build
  3. OUT_DIR=<スクショ置き場> npm run check   （PC・スマホ(タッチ)・動き控えめの3通り）
  4. PV: cd $ROOT/tools/pv && npm install && npm run stills / npm run render
EOF
