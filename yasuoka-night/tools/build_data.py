"""安岡夜景マップ用の data.js を生成する。

入力（いずれも公開データ。リポジトリには含めず、別途 clone して使う）:
  - 行政区域（海岸線）: niiyz/JapanCityGeoJson  geojson/35/35201.json
      元データ: 国土数値情報 行政区域データ N03（2020年, 国土交通省）
  - 駅の位置: piuccio/open-data-jp-railway-stations  stations.json（駅データ.jp 由来）
  - 町丁目の代表点: geolonia/japanese-addresses  api/ja/山口県/下関市.json

使い方:
  python3 build_data.py <JapanCityGeoJson> <open-data-jp-railway-stations> <japanese-addresses> > ../data.js
"""
import json
import math
import random
import re
import sys
from collections import defaultdict

import numpy as np
import shapely

from shapely.geometry import LineString, Point, Polygon, box
from shapely.ops import unary_union
from shapely.prepared import prep

geo_dir, st_dir, addr_dir = sys.argv[1:4]

LAT0, LON0 = 34.024921, 130.916635  # JR安岡駅（駅データ.jp の座標）
M_PER_UNIT = 15.0
KX = math.cos(math.radians(LAT0)) * 111320 / M_PER_UNIT
KZ = 110574 / M_PER_UNIT


def xz(lon, lat):
    return ((lon - LON0) * KX, -(lat - LAT0) * KZ)


def r1(v):
    return round(v, 1)


# ── 陸地（行政区域）を範囲で切り抜く ──
BBOX = (130.878, 33.994, 130.952, 34.060)
city = json.load(open(f"{geo_dir}/geojson/35/35201.json"))
# このファイルは島ごとのポリゴンが1つのPolygonの「穴」として入っているため、リングを個別の陸地として扱う
rings = [r for f in city["features"] for poly in f["geometry"]["coordinates"] for r in poly if len(r) > 3]
land_ll = unary_union([Polygon(r).buffer(0) for r in rings]).intersection(box(*BBOX))
land_ll = land_ll.simplify(0.00004)  # 約4m

def to_local(geom):
    return shapely.transform(geom, lambda c: np.column_stack(xz(c[:, 0], c[:, 1])))

land = to_local(land_ll)
polys = [land] if land.geom_type == "Polygon" else list(land.geoms)
polys = [p for p in polys if p.area > 4]
LAND = [[[r1(x), r1(z)] for x, z in p.exterior.coords] for p in polys]

# 海岸線 = 陸地の外周のうち、切り抜き枠の上にない部分
frame = to_local(box(*BBOX)).exterior.buffer(0.5)
coast_lines = []
for p in polys:
    rest = p.exterior.difference(frame)
    parts = [rest] if rest.geom_type == "LineString" else list(getattr(rest, "geoms", []))
    for ln in parts:
        if ln.length > 6:
            coast_lines.append([[r1(x), r1(z)] for x, z in ln.coords])

# 海 = 範囲内で陸地でないところ（島などの穴も含めて書き出す）
sea = to_local(box(*BBOX)).difference(land)
sea_polys = [sea] if sea.geom_type == "Polygon" else list(sea.geoms)
SEA = [{"outer": [[r1(x), r1(z)] for x, z in p.exterior.coords],
        "holes": [[[r1(x), r1(z)] for x, z in h.coords] for h in p.interiors]}
       for p in sea_polys if p.area > 4]
FRAME = [r1(v) for v in to_local(box(*BBOX)).bounds]

# ── 駅 ──
stations_all = json.load(open(f"{st_dir}/stations.json"))
WANT = ["幡生", "綾羅木", "梶栗郷台地", "安岡", "福江", "吉見"]
st = {}
for g in stations_all:
    if g.get("name_kanji") in WANT:
        for s in g["stations"]:
            if s.get("ekidata_line_id") == "11702":  # 山陰本線
                st[g["name_kanji"]] = xz(s["lon"], s["lat"])
STATIONS = [{"name": n, "x": r1(st[n][0]), "z": r1(st[n][1])} for n in WANT]

# ── 町丁目 ──
towns = json.load(open(f"{addr_dir}/api/ja/山口県/下関市.json"))
pts = []
for t in towns:
    x, z = xz(float(t["lng"]), float(t["lat"]))
    if land.buffer(30).contains(Point(x, z)) and to_local(box(*BBOX)).contains(Point(x, z)):
        pts.append({"town": t["town"], "x": x, "z": z, "chome": t["town"].endswith("丁目") or t["town"].endswith("町")})

# 町名ラベル：丁目をまとめて平均位置に
groups = defaultdict(list)
for p in pts:
    base = re.sub(r"[一二三四五六七八九十]+丁目$", "", p["town"]).replace("大字", "")
    groups[base].append(p)
TOWNS = [{"name": k, "x": r1(sum(p["x"] for p in v) / len(v)), "z": r1(sum(p["z"] for p in v) / len(v)), "n": len(v)}
         for k, v in groups.items()]

# ── 線路（駅を結んだ近似線） ──
rail = LineString([st[n] for n in WANT])

# ── 道（町丁目の代表点どうしを結んだ模式の道） ──
land_p = prep(land)
ROADS = []
seen = set()
for i, a in enumerate(pts):
    near = sorted(((math.hypot(a["x"] - b["x"], a["z"] - b["z"]), j) for j, b in enumerate(pts) if j != i))[:3]
    for d, j in near:
        if d > 55 or (min(i, j), max(i, j)) in seen:
            continue
        seen.add((min(i, j), max(i, j)))
        b = pts[j]
        ln = LineString([(a["x"], a["z"]), (b["x"], b["z"])])
        if land_p.contains(ln):
            ROADS.append([r1(a["x"]), r1(a["z"]), r1(b["x"]), r1(b["z"])])

# ── 建物（町丁目の代表点の近くほど密に置く。配置そのものは演出） ──
random.seed(19840623)
inner = prep(land.buffer(-1.5))
rail_buf = prep(rail.buffer(2.2))
road_buf = prep(unary_union([LineString([(r[0], r[1]), (r[2], r[3])]) for r in ROADS]).buffer(0.9))
st_pts = [st[n] for n in WANT]
B = []
minx, minz, maxx, maxz = land.bounds
STEP = 2.5
z = minz
while z < maxz:
    x = minx
    while x < maxx:
        jx, jz = x + random.uniform(-0.6, 0.6), z + random.uniform(-0.6, 0.6)
        pt = Point(jx, jz)
        x += STEP
        dens = 0
        for p in pts:
            d2 = (p["x"] - jx) ** 2 + (p["z"] - jz) ** 2
            s2 = 230 if p["chome"] else 900
            dens += (1.0 if p["chome"] else 0.35) * math.exp(-d2 / s2)
        dens = min(0.85, dens * 0.8)
        if dens < 0.04 or random.random() > dens:
            continue
        if not inner.contains(pt) or rail_buf.contains(pt) or road_buf.contains(pt):
            continue
        ds = min(math.hypot(jx - sx, jz - sz) for sx, sz in st_pts)
        flat = ds < 22 and random.random() < 0.14
        if flat:
            w, d, h = random.uniform(3, 4.6), random.uniform(2, 2.8), random.uniform(3.5, 7)
        else:
            w, d, h = random.uniform(1.3, 1.9), random.uniform(1.2, 1.7), random.uniform(0.9, 1.6)
        B.append([r1(jx), r1(jz), r1(w), r1(d), r1(h), round(random.uniform(-0.3, 0.3), 2), 1 if flat else 0])
    z += STEP

out = {
    "unitMeters": M_PER_UNIT,
    "origin": [LAT0, LON0],
    "land": LAND,
    "coast": coast_lines,
    "sea": SEA,
    "frame": FRAME,
    "stations": STATIONS,
    "towns": TOWNS,
    "roads": ROADS,
    "buildings": B,
}
print("// 自動生成: tools/build_data.py（手で編集しない）")
print("export default " + json.dumps(out, ensure_ascii=False, separators=(",", ":")) + ";")
print(f"buildings={len(B)} roads={len(ROADS)} towns={len(TOWNS)} land={len(LAND)} coast={len(coast_lines)}", file=sys.stderr)
