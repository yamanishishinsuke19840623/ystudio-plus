#!/usr/bin/env python3
"""
LINE公式アカウント運用自動化ツール (LINE Automator)

LINE Messaging APIを使い、一斉配信・セグメント配信（個別プッシュ）・
リッチメニューの切り替えをコマンドラインから実行する。

依存はPython標準ライブラリのみ（urllib）。追加のpipパッケージ不要。

事前に LINE Developers コンソールでMessaging APIチャネルを作成し、
チャネルアクセストークン（長期）を取得しておく必要があります
（Messaging APIは無料プランでも月200通まで送信できます）。

使い方:
    # 一斉配信の内容をプレビュー（既定の動作。実際には送信しない）
    python3 line_automator.py broadcast --content content.md

    # 実際に一斉配信する
    LINE_CHANNEL_ACCESS_TOKEN=xxxx python3 line_automator.py broadcast --content content.md --send

    # セグメント配信（友だちリストCSVへ個別プッシュ、{{name}}差し込み対応）
    LINE_CHANNEL_ACCESS_TOKEN=xxxx python3 line_automator.py push \
        --content content.md --recipients recipients.csv --send

    # デフォルトのリッチメニューを切り替える
    LINE_CHANNEL_ACCESS_TOKEN=xxxx python3 line_automator.py richmenu \
        --set-default richmenu-xxxxxxxxxxxx --send

詳細は README.md を参照。
"""
from __future__ import annotations

import argparse
import csv
import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

DEFAULT_API_BASE = "https://api.line.me"


def call_line_api(api_base: str, method: str, path: str, token: str, body: dict | None) -> dict:
    url = f"{api_base}{path}"
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", f"Bearer {token}")
    req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            raw = resp.read().decode("utf-8")
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {exc.code}: {detail}") from exc


def load_content(path: Path) -> str:
    if not path.exists():
        sys.exit(f"[エラー] 本文ファイルが見つかりません: {path}")
    text = path.read_text(encoding="utf-8").strip()
    if len(text) > 5000:
        sys.exit("[エラー] LINEのテキストメッセージは5000文字以内にしてください。")
    return text


def load_recipients(path: Path) -> list[dict]:
    if not path.exists():
        sys.exit(f"[エラー] 配信先リストが見つかりません: {path}")
    with path.open(newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        if "userId" not in (reader.fieldnames or []):
            sys.exit("[エラー] CSVに 'userId' 列が必要です（'name' 列は任意）。")
        return [row for row in reader if (row.get("userId") or "").strip()]


def personalize(text: str, row: dict) -> str:
    rendered = text
    for key, value in row.items():
        rendered = rendered.replace(f"{{{{{key}}}}}", value or "")
    return rendered


def cmd_broadcast(args: argparse.Namespace) -> None:
    text = load_content(args.content)
    print("--- 配信内容プレビュー ---")
    print(text)
    print()
    if not args.send:
        print("[プレビューモード] 実際には配信していません。--send を付けると配信します。")
        return

    token = require_token()
    result = call_line_api(
        args.api_base, "POST", "/v2/bot/message/broadcast", token,
        {"messages": [{"type": "text", "text": text}]},
    )
    print(f"[配信完了] 全友だちへブロードキャストしました。response={result}")


def cmd_push(args: argparse.Namespace) -> None:
    text = load_content(args.content)
    recipients = load_recipients(args.recipients)
    print(f"配信先: {len(recipients)}件\n")

    if not args.send:
        print("[プレビューモード] 実際には送信していません。--send を付けると送信します。\n")
        sample = recipients[:1]
        for row in sample:
            print(f"--- {row['userId']} 宛プレビュー ---")
            print(personalize(text, row))
            print()
        return

    token = require_token()
    sent, errors = 0, 0
    for row in recipients:
        rendered = personalize(text, row)
        try:
            call_line_api(
                args.api_base, "POST", "/v2/bot/message/push", token,
                {"to": row["userId"], "messages": [{"type": "text", "text": rendered}]},
            )
            sent += 1
            print(f"  [送信済み] {row['userId']}")
        except Exception as exc:  # noqa: BLE001 - 個別送信失敗はログに残して続行する
            errors += 1
            print(f"  [失敗] {row['userId']}: {exc}")
        time.sleep(args.interval)
    print(f"\n完了。成功 {sent} 件 / 失敗 {errors} 件。")


def cmd_richmenu(args: argparse.Namespace) -> None:
    print(f"デフォルトリッチメニューを '{args.set_default}' に切り替えます。")
    if not args.send:
        print("[プレビューモード] 実際には切り替えていません。--send を付けると切り替えます。")
        return
    token = require_token()
    call_line_api(
        args.api_base, "POST", f"/v2/bot/user/all/richmenu/{args.set_default}", token, None,
    )
    print("[切り替え完了]")


def require_token() -> str:
    token = os.environ.get("LINE_CHANNEL_ACCESS_TOKEN")
    if not token:
        sys.exit("[エラー] 環境変数 LINE_CHANNEL_ACCESS_TOKEN を設定してください。")
    return token


def main() -> None:
    parser = argparse.ArgumentParser(description="LINE公式アカウント運用自動化ツール")
    parser.add_argument("--api-base", default=DEFAULT_API_BASE, help="APIのベースURL(テスト用に上書き可能)")
    sub = parser.add_subparsers(dest="action", required=True)

    p_broadcast = sub.add_parser("broadcast", help="全友だちへ一斉配信")
    p_broadcast.add_argument("--content", required=True, type=Path)
    p_broadcast.add_argument("--send", action="store_true")
    p_broadcast.set_defaults(func=cmd_broadcast)

    p_push = sub.add_parser("push", help="友だちリストCSVへ個別配信（セグメント配信）")
    p_push.add_argument("--content", required=True, type=Path)
    p_push.add_argument("--recipients", required=True, type=Path, help="userId,name列を持つCSV")
    p_push.add_argument("--interval", type=float, default=0.3, help="送信間隔(秒)")
    p_push.add_argument("--send", action="store_true")
    p_push.set_defaults(func=cmd_push)

    p_richmenu = sub.add_parser("richmenu", help="デフォルトのリッチメニューを切り替える")
    p_richmenu.add_argument("--set-default", required=True, help="リッチメニューID")
    p_richmenu.add_argument("--send", action="store_true")
    p_richmenu.set_defaults(func=cmd_richmenu)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
