#!/usr/bin/env python3
"""Gmail下書きに入った添付PDFが、元のPDFと1バイトも違わないか確かめる。

使い方:
  python3 -I verify_draft.py <get_draft(RAW)の結果ファイル> <元のPDF>

get_draft を messageFormat=RAW で呼ぶと、結果が大きいので自動でファイルに保存される
（"Output has been saved to ..." と出る）。そのパスを渡す。
base64 を手で写すときに行の取り違えが実際に起きたので、作ったら毎回これで確かめる。
"""
import base64
import email
import json
import sys


def main():
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    with open(sys.argv[1], encoding="utf-8") as f:
        raw = json.load(f)["raw"]
    msg = email.message_from_bytes(base64.urlsafe_b64decode(raw + "=" * (-len(raw) % 4)))
    with open(sys.argv[2], "rb") as f:
        ref = f.read()
    pdfs = [p for p in msg.walk() if p.get_content_type() == "application/pdf"]
    if not pdfs:
        sys.exit("NG: 下書きにPDFの添付がない")
    for p in pdfs:
        got = p.get_payload(decode=True)
        if got == ref:
            print(f"OK: {p.get_filename()}（{len(got)} bytes）は元のPDFと一致")
            return
        sb, rb = base64.b64encode(got).decode(), base64.b64encode(ref).decode()
        i = next((k for k in range(min(len(sb), len(rb))) if sb[k] != rb[k]), min(len(sb), len(rb)))
        print(f"NG: {p.get_filename()} {len(got)} bytes / 元 {len(ref)} bytes。"
              f"base64 の {i} 文字目（{i // 2000 + 1} 行目付近、2000字折り返し）から違う")
    sys.exit(1)


if __name__ == "__main__":
    main()
