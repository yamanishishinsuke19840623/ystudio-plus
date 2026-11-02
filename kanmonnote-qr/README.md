# かんもんノート チラシ用QRコード

チラシのQRコードが読み取れなかったため、本物のQRコードを作り直したもの。
（元のQRはデザイン生成時の「QR風の絵」で、データが入っていなかった可能性が高い）

| ファイル | 中身 | 状態 |
|---|---|---|
| qr-homepage.png / .svg | https://www.kanmonnote.com/ | 作成・読み取り確認済み |
| qr-instagram | かんもんノートのInstagram URL | URL未確認のため未作成 |
| qr-contact | お問い合わせ先URL | URL未確認のため未作成 |

## 差し替えのポイント
- 印刷は **SVG** を使う（拡大してもぼやけない）
- 印刷サイズは **2cm角以上**、周りの白い余白（クワイエットゾーン）は削らない
- 黒×白のまま。色付け・ロゴ重ねはしない

## 追加の作り方
```
python3 make_qr.py instagram https://www.instagram.com/<アカウント>/
python3 make_qr.py contact <お問い合わせURL>
```
生成後に自動で読み取りテストを行い、URLが一致しなければエラーになる。
