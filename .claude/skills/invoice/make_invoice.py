#!/usr/bin/env python3
"""請求書PDFをつくる（Ystudioプラス用）。

使い方:
  python3 -I make_invoice.py invoice.json 出力先ディレクトリ

出力:
  <出力先>/<file_name>.pdf   … 請求書本体（4KB前後。Gmail添付にそのまま使える）
  <出力先>/<file_name>.png   … 目視確認用のプレビュー
  <出力先>/<file_name>.b64   … Gmail create_draft の attachments.content にそのまま入れる文字列

フォントは埋め込まない（HeiseiKakuGo-W5 = 閲覧側の日本語フォントで表示）ので軽い。
その代わり、閲覧アプリによっては「¥」が「\」に化ける（スマホのGmailで実際に起きた）。
だから金額は必ず「22,000円」のように「円」で書き、¥ / ￥ / バックスラッシュは使わない。
"""
import json
import os
import sys

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from reportlab.pdfgen import canvas

FONT = "HeiseiKakuGo-W5"
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


def build(d, out_pdf):
    pdfmetrics.registerFont(UnicodeCIDFont(FONT))
    W, H = A4
    L, R = 18 * mm, W - 18 * mm
    c = canvas.Canvas(out_pdf, pagesize=A4)
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
    fx, fy = W / 2 + 12 * mm, y
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
    return subtotal, tax, total


def main():
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    with open(sys.argv[1], encoding="utf-8") as f:
        d = json.load(f)
    check_text(d)
    os.makedirs(sys.argv[2], exist_ok=True)
    base = os.path.join(sys.argv[2], d["file_name"])
    subtotal, tax, total = build(d, base + ".pdf")

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
