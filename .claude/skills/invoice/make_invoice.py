#!/usr/bin/env python3
"""請求書PDFをつくる（Ystudioプラス用）。

使い方:
  python3 -I make_invoice.py invoice.json 出力先ディレクトリ [--light]

出力:
  <出力先>/<file_name>.pdf   … 請求書本体
  <出力先>/<file_name>.png   … 目視確認用のプレビュー
  <出力先>/<file_name>.b64   … Gmail create_draft の attachments.content にそのまま入れる文字列

既定は IPAゴシックの「使う文字だけ」を埋め込む（20KB前後）。どの閲覧アプリでも同じ見た目で開ける。
  ・埋め込まない版はスマホのGmailで「¥」が「\」に化け、「PDFを表示できません」にもなった（2026/10/20）。
  ・輪郭の座標を 1/64em 刻みに丸め、ヒンティングを外して小さくしている（印刷サイズでは見分けがつかない）。
--light を付けると埋め込まない4KB前後の版を作る（非常用）。
金額は「22,000円」のように「円」で書く。¥ / ￥ / バックスラッシュは検出したら止める。
"""
import json
import os
import sys

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

# 埋め込む日本語TrueTypeフォント。上から順に探す。
FONT_CANDIDATES = [
    "/usr/share/fonts/opentype/ipafont-gothic/ipagp.ttf",
    "/usr/share/fonts/opentype/ipafont-gothic/ipag.ttf",
    "/usr/share/fonts/truetype/fonts-japanese-gothic.ttf",
    "/usr/share/fonts/truetype/ipaexfont-gothic/ipaexg.ttf",
]
# 閲覧環境で化ける・意味が変わる文字。見つけたら止める。
BANNED = {"¥": "円表記にする", "￥": "円表記にする", "\\": "円表記にする"}


def yen(n):
    return f"{n:,}円"


def check_text(data):
    def walk(v, path):
        if isinstance(v, str):
            for ch, fix in BANNED.items():
                if ch in v:
                    sys.exit(f"NG: {path} に「{ch}」があります（{fix}）: {v}")
        elif isinstance(v, dict):
            for k, x in v.items():
                walk(x, f"{path}.{k}")
        elif isinstance(v, list):
            for i, x in enumerate(v):
                walk(x, f"{path}[{i}]")
    walk(data, "invoice")


class RecordingCanvas(canvas.Canvas):
    """描いた文字を集める（フォントを使う文字だけに絞るため）。"""

    def __init__(self, *a, **kw):
        super().__init__(*a, **kw)
        self.used = set()

    def drawString(self, x, y, text, *a, **kw):
        self.used.update(text)
        return super().drawString(x, y, text, *a, **kw)

    def drawRightString(self, x, y, text, *a, **kw):
        self.used.update(text)
        return super().drawRightString(x, y, text, *a, **kw)

    def drawCentredString(self, x, y, text, *a, **kw):
        self.used.update(text)
        return super().drawCentredString(x, y, text, *a, **kw)


def slim_font(src, chars, dst):
    """使う文字だけ・ヒンティングなしのフォントを作る。PDFが小さくなり、Gmail添付の受け渡しが楽になる。"""
    from fontTools import subset
    from fontTools.ttLib import TTFont as FTFont
    opts = subset.Options()
    opts.hinting = False
    opts.layout_features = []
    opts.drop_tables += ["DSIG", "GSUB", "GPOS", "GDEF", "kern", "vhea", "vmtx", "gasp"]
    opts.name_IDs = [1, 2, 6]
    f = FTFont(src)
    sub = subset.Subsetter(opts)
    sub.populate(text="".join(chars))
    sub.subset(f)
    # 輪郭の座標を 1/64em 刻みに丸める。印刷サイズでは見分けがつかず、圧縮が効いて小さくなる
    q = max(1, f["head"].unitsPerEm // 64)
    glyf = f["glyf"]
    for name in glyf.keys():
        g = glyf[name]
        if g.numberOfContours > 0:
            g.coordinates.toInt()
            for i, (x, y) in enumerate(g.coordinates):
                g.coordinates[i] = (round(x / q) * q, round(y / q) * q)
    f.save(dst)


def build(d, out_pdf, font_name, record=False):
    W, H = A4
    L, R = 18 * mm, W - 18 * mm
    c = RecordingCanvas(out_pdf, pagesize=A4)
    FONT = font_name
    c.setTitle(f"請求書 {d['to']['company']}様")
    c.setAuthor(f"{d['from']['name']} {d['from']['person']}")

    subtotal = sum(it["qty"] * it["unit_price"] for it in d["items"])
    tax = subtotal * d.get("tax_rate", 10) // 100
    total = subtotal + tax

    y = H - 22 * mm
    c.setFont(FONT, 22)
    c.drawCentredString(W / 2, y, "請　求　書")
    y -= 5 * mm
    c.setLineWidth(1.5)
    c.line(L, y, R, y)

    y -= 9 * mm
    c.setFont(FONT, 10)
    c.drawRightString(R, y, f"請求日：{d['date']}")
    if d.get("number"):
        y -= 5.5 * mm
        c.drawRightString(R, y, f"請求番号：{d['number']}")

    # 宛名
    y -= 12 * mm
    c.setFont(FONT, 14)
    c.drawString(L, y, f"{d['to']['company']}　御中")
    c.setLineWidth(0.8)
    c.line(L, y - 2 * mm, L + 92 * mm, y - 2 * mm)
    if d["to"].get("person"):
        c.setFont(FONT, 12)
        c.drawString(L, y - 9 * mm, f"{d['to']['person']} 様")

    # 差出人
    fx, fy = W / 2 + 6 * mm, y
    c.setFont(FONT, 12)
    c.drawString(fx, fy, d["from"]["name"])
    c.setFont(FONT, 9.5)
    for t in [d["from"]["person"], *d["from"].get("lines", [])]:
        fy -= 5 * mm
        c.drawString(fx, fy, t)

    # ご請求金額
    y = min(fy, y - 9 * mm) - 12 * mm
    c.setFont(FONT, 10.5)
    c.drawString(L, y, "下記のとおりご請求申し上げます。")
    y -= 14 * mm
    c.setLineWidth(1.5)
    c.rect(L, y, 115 * mm, 11 * mm)
    c.setFont(FONT, 12)
    c.drawString(L + 5 * mm, y + 3.8 * mm, "ご請求金額")
    c.setFont(FONT, 18)
    c.drawString(L + 35 * mm, y + 3.3 * mm, yen(total))
    c.setFont(FONT, 9.5)
    c.drawString(L + 85 * mm, y + 3.8 * mm, "（税込）")

    # 明細
    y -= 12 * mm
    cols = [L, L + 92 * mm, L + 112 * mm, L + 143 * mm, R]
    item_h = []
    for it in d["items"]:
        item_h.append(9 * mm + 4 * mm * len(it.get("notes", [])))
    rows = [9 * mm, *item_h] + [8 * mm] * max(0, 3 - len(d["items"]))
    top = y
    c.setLineWidth(0.6)
    c.setFillGray(0.92)
    c.rect(L, top - rows[0], R - L, rows[0], fill=1, stroke=0)
    c.setFillGray(0)
    yy = top
    for h in rows:
        c.line(L, yy, R, yy)
        yy -= h
    c.line(L, yy, R, yy)
    for x in cols:
        c.line(x, top, x, yy)
    c.setFont(FONT, 10)
    for i, t in enumerate(["内容", "数量", "単価", "金額"]):
        c.drawCentredString((cols[i] + cols[i + 1]) / 2, top - 6 * mm, t)
    ry = top - rows[0]
    for it, h in zip(d["items"], item_h):
        c.setFont(FONT, 10)
        c.drawString(L + 3 * mm, ry - 5.5 * mm, it["name"])
        c.setFont(FONT, 8.5)
        ny = ry - 10 * mm
        for n in it.get("notes", []):
            c.drawString(L + 3 * mm, ny, n)
            ny -= 4 * mm
        c.setFont(FONT, 10)
        my = ry - h / 2 - 1.5 * mm
        c.drawCentredString((cols[1] + cols[2]) / 2, my, f"{it['qty']}{it.get('unit', '式')}")
        c.drawRightString(cols[3] - 3 * mm, my, yen(it["unit_price"]))
        c.drawRightString(R - 3 * mm, my, yen(it["qty"] * it["unit_price"]))
        ry -= h

    # 小計・税・合計
    sy, sx = yy - 7 * mm, W / 2 + 10 * mm
    for lab, val in [("小計（税別）", subtotal), (f"消費税（{d.get('tax_rate', 10)}%）", tax)]:
        c.drawString(sx, sy, lab)
        c.drawRightString(R - 3 * mm, sy, yen(val))
        sy -= 7 * mm
    c.setLineWidth(1.5)
    c.line(sx - 2 * mm, sy + 4.5 * mm, R, sy + 4.5 * mm)
    c.drawString(sx, sy - 0.5 * mm, "合計（税込）")
    c.drawRightString(R - 3 * mm, sy - 0.5 * mm, yen(total))

    # 振込先
    lines = [("お振込先", 10), *[(t, 10) for t in d["bank"]], (f"お振込期限：{d['due']}", 10)]
    if d.get("bank_note"):
        lines.append((d["bank_note"], 8.5))
    bh = 6 * mm * len(lines) + 2 * mm
    by = sy - 12 * mm
    c.setLineWidth(0.6)
    c.rect(L, by - bh, R - L, bh)
    ty = by - 6.5 * mm
    for t, s in lines:
        c.setFont(FONT, s)
        c.drawString(L + 4 * mm, ty, t)
        ty -= 6 * mm

    c.save()
    return subtotal, tax, total, c.used


def main():
    args = [a for a in sys.argv[1:] if a != "--light"]
    embed = "--light" not in sys.argv[1:]
    if len(args) != 2:
        sys.exit(__doc__)
    with open(args[0], encoding="utf-8") as f:
        d = json.load(f)
    check_text(d)
    os.makedirs(args[1], exist_ok=True)
    base = os.path.join(args[1], d["file_name"])
    if not embed:
        pdfmetrics.registerFont(UnicodeCIDFont("HeiseiKakuGo-W5"))
        subtotal, tax, total, _ = build(d, base + ".pdf", "HeiseiKakuGo-W5")
        return finish(base, subtotal, tax, total)
    src = next((p for p in FONT_CANDIDATES if os.path.exists(p)), None)
    if src is None:
        sys.exit("NG: 埋め込める日本語フォントがない（FONT_CANDIDATES を確認）")
    # 1回目：使う文字を集める（ここで元のTTFを登録すると、本番でもそちらが丸ごと埋め込まれてしまう）
    import io
    pdfmetrics.registerFont(UnicodeCIDFont("HeiseiKakuGo-W5"))
    *_, used = build(d, io.BytesIO(), "HeiseiKakuGo-W5")
    # 2回目：使う文字だけのフォントで本番
    try:
        slim = base + ".font.ttf"
        slim_font(src, used, slim)
        pdfmetrics.registerFont(TTFont("JP", slim))
        font = "JP"
    except ImportError:
        print("fonttools が無いのでフォントを絞れない（pip install fonttools）。PDFが大きくなる")
        pdfmetrics.registerFont(TTFont("JPFULL", src))
        font = "JPFULL"
    subtotal, tax, total, _ = build(d, base + ".pdf", font)
    if font == "JP":
        os.remove(slim)
    finish(base, subtotal, tax, total)


def finish(base, subtotal, tax, total):
    import base64
    with open(base + ".pdf", "rb") as f:
        b = f.read()
    with open(base + ".b64", "w") as f:
        f.write(base64.b64encode(b).decode())
    try:
        import pypdfium2
        pypdfium2.PdfDocument(base + ".pdf")[0].render(scale=1.3).to_pil().save(base + ".png")
    except ImportError:
        print("pypdfium2 が無いのでプレビューPNGは省略")
    print(f"小計 {yen(subtotal)} / 消費税 {yen(tax)} / 合計 {yen(total)}")
    print(f"PDF {len(b)} bytes -> {base}.pdf")


if __name__ == "__main__":
    main()
