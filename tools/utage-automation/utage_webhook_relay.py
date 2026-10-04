#!/usr/bin/env python3
"""
UTAGE Webhook連携ツール (UTAGE Webhook Relay)

【重要】UTAGEには（本ツール作成時点で確認できる範囲で）外部から呼び出せる
一般公開APIはありません。そのためこのツールは「UTAGE側から送られてくる
Webhook」を受け取るリレーサーバーとして動作します。UTAGEのファネル/ステップ
設定にある「Webhook通知」機能で、このツールのURLを送信先として登録して
ください（フォーム送信・購入完了・ステップ到達などのタイミングで送信できます。
UTAGE管理画面の該当設定項目でご確認ください）。

受け取ったWebhookは、
  1) 生データ(JSON)をそのまま失わずに記録
  2) メールアドレス・氏名・LINEユーザーID・電話番号らしきフィールドを
     ヒューリスティックに抽出してCSV(leads.csv)に正規化保存
します。この leads.csv は、同梱の newsletter-automator や line-automator の
入力（列名を合わせるだけ）としてそのまま使えます。

依存はPython標準ライブラリのみ（http.server）。追加のpipパッケージ不要。

使い方:
    python3 utage_webhook_relay.py --port 8787 --token my-secret-token

    # UTAGE側のWebhook送信先URLに以下を設定:
    #   https://<公開URL>/webhook/utage?token=my-secret-token

ローカルで動作確認する場合は ngrok 等で一時的に公開URLを発行してください。
詳細は README.md を参照。
"""
from __future__ import annotations

import argparse
import csv
import json
import sys
import time
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

FIELD_HINTS = {
    "email": ["mail", "メール"],
    "name": ["name", "氏名", "お名前"],
    "line_user_id": ["lineuserid", "line_user_id", "lineid"],
    "phone": ["tel", "phone", "電話"],
}


def extract_fields(payload: dict) -> dict:
    extracted = {k: "" for k in FIELD_HINTS}
    for key, value in payload.items():
        key_lower = str(key).lower()
        for field, hints in FIELD_HINTS.items():
            if extracted[field]:
                continue
            if any(hint.lower() in key_lower for hint in hints):
                extracted[field] = str(value)
    return extracted


def append_lead(path: Path, extracted: dict, raw_payload: dict) -> None:
    is_new = not path.exists()
    with path.open("a", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        if is_new:
            writer.writerow(["timestamp", "email", "name", "line_user_id", "phone", "raw_payload"])
        writer.writerow([
            time.strftime("%Y-%m-%d %H:%M:%S"),
            extracted["email"],
            extracted["name"],
            extracted["line_user_id"],
            extracted["phone"],
            json.dumps(raw_payload, ensure_ascii=False),
        ])


def make_handler(token: str, webhook_path: str, output: Path):
    class Handler(BaseHTTPRequestHandler):
        def do_POST(self):
            parsed = urllib.parse.urlparse(self.path)
            if parsed.path != webhook_path:
                self.send_response(404)
                self.end_headers()
                return

            query = urllib.parse.parse_qs(parsed.query)
            given_token = query.get("token", [""])[0] or self.headers.get("X-Webhook-Token", "")
            if token and given_token != token:
                self.send_response(401)
                self.end_headers()
                self.wfile.write(b'{"error":"invalid token"}')
                return

            length = int(self.headers.get("Content-Length", 0))
            raw_body = self.rfile.read(length) if length else b""
            content_type = self.headers.get("Content-Type", "")

            try:
                if "application/json" in content_type:
                    payload = json.loads(raw_body.decode("utf-8")) if raw_body else {}
                else:
                    payload = {
                        k: v[0] if len(v) == 1 else v
                        for k, v in urllib.parse.parse_qs(raw_body.decode("utf-8")).items()
                    }
            except (json.JSONDecodeError, UnicodeDecodeError) as exc:
                self.send_response(400)
                self.end_headers()
                self.wfile.write(f'{{"error":"invalid payload: {exc}"}}'.encode("utf-8"))
                return

            extracted = extract_fields(payload)
            append_lead(output, extracted, payload)
            print(f"  [受信] email={extracted['email'] or '(不明)'} name={extracted['name'] or '(不明)'}")

            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(b'{"status":"ok"}')

        def do_GET(self):
            if self.path.rstrip("/") == "/health":
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(b'{"status":"ok"}')
            else:
                self.send_response(404)
                self.end_headers()

        def log_message(self, format, *args):  # noqa: A002 - http.serverの規約に合わせる
            pass

    return Handler


def main() -> None:
    parser = argparse.ArgumentParser(description="UTAGE Webhook連携ツール")
    parser.add_argument("--port", type=int, default=8787)
    parser.add_argument("--path", default="/webhook/utage", help="Webhookを受け付けるパス")
    parser.add_argument("--token", default="", help="URLクエリ or X-Webhook-Tokenヘッダで検証する共有シークレット")
    parser.add_argument("--output", default=Path("leads.csv"), type=Path, help="正規化済みリードの出力先CSV")
    args = parser.parse_args()

    if not args.token:
        print("[警告] --token を指定していません。誰でもこのエンドポイントにデータを送信できてしまいます。"
              "インターネットに公開する場合は必ずトークンを設定してください。", file=sys.stderr)

    handler = make_handler(args.token, args.path, args.output)
    server = ThreadingHTTPServer(("0.0.0.0", args.port), handler)
    print(f"UTAGE Webhookリレーを起動しました: http://0.0.0.0:{args.port}{args.path}")
    print(f"出力先: {args.output}")
    print("Ctrl+C で停止します。")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n停止しました。")


if __name__ == "__main__":
    main()
