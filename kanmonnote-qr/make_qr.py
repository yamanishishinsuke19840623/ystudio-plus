"""かんもんノート チラシ用QRコード生成＋読み取り検証。
使い方: python3 make_qr.py <名前> <URL>
例:     python3 make_qr.py instagram https://www.instagram.com/<アカウント>/
必要:   pip install qrcode pillow opencv-python-headless
"""
import sys, qrcode, qrcode.image.svg, cv2

name, url = sys.argv[1], sys.argv[2]
q = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_M, box_size=40, border=4)
q.add_data(url); q.make(fit=True)
q.make_image(fill_color="black", back_color="white").save(f"qr-{name}.png")
q.make_image(image_factory=qrcode.image.svg.SvgPathImage).save(f"qr-{name}.svg")
decoded = cv2.QRCodeDetector().detectAndDecode(cv2.imread(f"qr-{name}.png"))[0]
assert decoded == url, f"読み取り失敗: {decoded!r}"
print(f"OK qr-{name}.png / .svg -> {decoded}")
