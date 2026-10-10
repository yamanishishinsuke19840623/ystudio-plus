# 夜景マップづくりのノウハウ（環境・データ・確認）

安岡 夜景マップ（2026年10月）を作ったときに分かったこと。クラウドのClaude Code環境での話。

## この環境でつながる／つながらない

| 用途 | 結果 | 代わりの方法 |
|---|---|---|
| OpenStreetMap / Overpass API / 地理院タイル | つながらない（プロキシで拒否） | GitHub上の公開データを git clone |
| CDN（jsDelivr / unpkg / cdnjs） | つながらない | `npm pack three@0.160.0` で取得し `vendor/` に同梱 |
| npm レジストリ / PyPI | つながる | three.js、shapely の入手に使う |
| GitHub の公開リポジトリ | git clone できる | `add_repo` で読み取りを確認してから clone |
| WebSearch | 使える | 住所・標高・営業時間などの事実確認 |
| WebFetch | 名前解決できず失敗することが多い | WebSearch の要約から拾い、出典URLを控える |
| 本番サイト（ystudio.yamanisi.co.jp） | 開けない | 公開後の表示確認は本人にお願いする |

## データの取り方

大きいリポジトリは、必要なファイルだけ取り出す（sparse checkout）。

```bash
GIT_LFS_SKIP_SMUDGE=1 git clone -q --depth 1 --filter=blob:none --sparse https://github.com/niiyz/japancitygeojson
cd japancitygeojson && git sparse-checkout set --no-cone /geojson/35/35201.json
```

- **海岸線** `niiyz/JapanCityGeoJson`（国土数値情報 行政区域 N03、2020年）
  - `geojson/<県コード>/<市区町村コード>.json`。下関市は 35/35201
  - **注意**: 島ごとの形が、1つの Polygon の「穴（リング）」として入っている。そのまま読むと一部の島しか出ない。リングを1つずつ別の陸地として union する（`build_data.py` 参照）
  - `git ls-tree -l` は blob:none だと遅いので使わない（`--name-only` で足りる）
- **駅** `piuccio/open-data-jp-railway-stations` の `stations.json`（駅データ.jp 由来）
  - 駅名で探し、`ekidata_line_id` で路線をしぼる（山陰本線は 11702）
  - 線路の形は入っていないので、駅を結んだ近似線で描き、そう明記する
- **町名の位置** `geolonia/japanese-addresses` の `api/ja/<県>/<市区町村>.json`
  - 町丁目ごとの代表点（lat/lng）。施設の住所から「だいたいの位置」を出すのにも使える
  - 「大字〇〇」の点は広い範囲の代表点なので、丁目の点よりずれやすい
  - 表記ゆれがある（例: 富任町 と 大字冨任）
- **施設・山の情報**: WebSearch。座標は Wikipedia の掲載値が検索結果の要約に出ることがある。出ない場合は無理に決めず「おおよそ」で置く

## 描き方のコツ

- 投影: 原点の緯度で経度方向を縮めた平面（`x = (経度-原点)×cos(緯度)×111320/m`、`z = -(緯度-原点)×110574/m`）。1単位=15m
- 建物は町丁目の代表点の近くほど多く置く（ガウスの重ね合わせ）。海岸から少し内側、線路・道の上には置かない
- 建物は InstancedMesh と窓のテクスチャで描き、色（instanceColor）で灯りのオン・オフを切り替える。5,000棟でもスマホで動く
- 光らせたいものは色を1より大きくして UnrealBloomPass で光らせる
- データの範囲の外は暗い地面にして、海は西側（沖）にだけ広げる。範囲外を全部海にすると、陸が東で途切れて変に見える
- 山: ガウス形の山＋尾根＋少しのでこぼこ。シェーダーで等高線を引くと、それっぽく見える。霧が強いと白っぽく平たく見えるので、山だけ霧を弱める
- GLSL で `step` を変数名に使わない（組み込み関数と名前がかぶる）
- 町のオブジェクトを `...` で展開すると `name` が上書きされる（鋤先山が「蒲生野」と表示されたバグ）。必要なキーだけ取り出す

## 確かめ方（Playwright）

```js
const b = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
await p.goto(url, { waitUntil: 'commit' });         // Google Fonts が読めないので load を待たない
await p.evaluate(() => document.getElementById('play').click()); // p.click はWebGLが重いとタイムアウトする
await p.screenshot({ path, timeout: 120000 });      // スマホ幅は特に時間がかかる
```

- `python3 -m http.server 8765` をリポジトリ直下で動かし、`http://localhost:8765/yasuoka-night/` を開く
- PC（1440×900）とスマホ（390×844）、時間を変えて（19時・23時など）撮る
- `document.documentElement.scrollWidth - innerWidth` で横はみ出しを見る。トップページは master の時点で16pxはみ出している（夜景マップのせいではない）

## 公開

- GitHub Pages（CNAME: ystudio.yamanisi.co.jp）。master にマージすると公開される前提で運用している（仕組みそのものは未確認）
- 既定ブランチは `master`（main ではない）
- マージ済みのブランチに続きを積まない。`git checkout -B <branch> origin/master` で作り直してから作業する
- Claude のアーティファクトで見せる場合は、`<!DOCTYPE>`/`<html>`/`<head>`/`<body>` を外したHTMLを作り、`files` で app.js・data.js・vendor 一式を一緒に出す。アーティファクトは非公開で始まり、共有は本人が行う
