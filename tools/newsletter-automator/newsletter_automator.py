#!/usr/bin/env python3
"""
自動メルマガ配信ツール (Newsletter Automator)

原稿ファイル(Markdown風テキスト) + 購読者リスト(CSV)から、
パーソナライズ済みHTMLメールを合成し、SMTP経由で配信するCLIツール。

依存はPython標準ライブラリのみ（smtplib / email）。追加のpipパッケージ不要。

使い方:
    # まずプレビュー（実際には送信しない。既定の動作）
    python3 newsletter_automator.py --content content.md --subscribers subscribers.csv \
        --subject "今月のAI活用ヒント"

    # 実際に送信する場合は --send を付ける（SMTP設定は環境変数で渡す）
    SMTP_HOST=smtp.example.com SMTP_PORT=587 SMTP_USER=you@example.com \
    SMTP_PASS=xxxx FROM_ADDR="Yスタジオ+ <you@example.com>" \
    python3 newsletter_automator.py --content content.md --subscribers subscribers.csv \
        --subject "今月のAI活用ヒント" --send

詳細は README.md を参照。
"""
from __future__ import annotations

import argparse
import csv
import html
import os
import smtplib
import ssl
import sys
import time
from dataclasses import dataclass
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path

DEFAULT_TEMPLATE = Path(__file__).parent / "template.html"
DEFAULT_SENT_LOG = "sent_log.csv"


@dataclass
class Subscriber:
    email: str
    name: str
    extra: dict


def load_subscribers(path: Path) -> list[Subscriber]:
    if not path.exists():
        sys.exit(f"[エラー] 購読者リストが見つかりません: {path}")
    subs: list[Subscriber] = []
    with path.open(newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        if "email" not in (reader.fieldnames or []):
            sys.exit("[エラー] CSVに 'email' 列が必要です（'name' 列は任意）。")
        for row in reader:
            email = (row.get("email") or "").strip()
            if not email:
                continue
            name = (row.get("name") or "").strip()
            extra = {k: v for k, v in row.items() if k not in ("email", "name")}
            subs.append(Subscriber(email=email, name=name, extra=extra))
    return subs


def load_sent_log(path: Path) -> set[str]:
    if not path.exists():
        return set()
    with path.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        return {row["email"] for row in reader if row.get("status") == "sent"}


def append_sent_log(path: Path, email: str, status: str) -> None:
    is_new = not path.exists()
    with path.open("a", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        if is_new:
            writer.writerow(["timestamp", "email", "status"])
        writer.writerow([time.strftime("%Y-%m-%d %H:%M:%S"), email, status])


def text_to_html_paragraphs(text: str) -> str:
    """簡易Markdown風変換: 空行区切りを<p>に、単一改行を<br>に変換するだけ。"""
    blocks = [b.strip() for b in text.strip().split("\n\n") if b.strip()]
    html_blocks = []
    for block in blocks:
        escaped = html.escape(block).replace("\n", "<br>\n")
        html_blocks.append(f"<p>{escaped}</p>")
    return "\n".join(html_blocks)


def render_email(template: str, subject: str, body_html: str, subscriber: Subscriber, unsubscribe_url: str) -> str:
    rendered = template
    rendered = rendered.replace("{{subject}}", html.escape(subject))
    rendered = rendered.replace("{{body_html}}", body_html)
    rendered = rendered.replace("{{name}}", html.escape(subscriber.name or "ご担当者"))
    rendered = rendered.replace("{{unsubscribe_url}}", html.escape(unsubscribe_url))
    for key, value in subscriber.extra.items():
        rendered = rendered.replace(f"{{{{{key}}}}}", html.escape(value))
    return rendered


def send_via_smtp(
    smtp_host: str,
    smtp_port: int,
    smtp_user: str,
    smtp_pass: str,
    from_addr: str,
    to_addr: str,
    subject: str,
    html_body: str,
) -> None:
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = from_addr
    msg["To"] = to_addr
    msg.attach(MIMEText(html_body, "html", "utf-8"))

    context = ssl.create_default_context()
    with smtplib.SMTP(smtp_host, smtp_port, timeout=30) as server:
        server.starttls(context=context)
        server.login(smtp_user, smtp_pass)
        server.sendmail(from_addr, [to_addr], msg.as_string())


def main() -> None:
    parser = argparse.ArgumentParser(description="自動メルマガ配信ツール")
    parser.add_argument("--content", required=True, type=Path, help="本文原稿ファイル(テキスト/簡易Markdown)")
    parser.add_argument("--subscribers", required=True, type=Path, help="購読者リストCSV(email,name列)")
    parser.add_argument("--subject", required=True, help="件名")
    parser.add_argument("--template", default=DEFAULT_TEMPLATE, type=Path, help="HTMLテンプレート")
    parser.add_argument("--unsubscribe-url", default="https://example.com/unsubscribe", help="配信停止URL")
    parser.add_argument("--sent-log", default=Path(DEFAULT_SENT_LOG), type=Path, help="送信済みログCSV(再実行時の重複送信防止)")
    parser.add_argument("--interval", type=float, default=1.0, help="送信間隔(秒)。SMTPサーバへの負荷・レート制限対策")
    parser.add_argument("--limit", type=int, default=None, help="今回送信する最大件数(テスト送信などに)")
    parser.add_argument("--send", action="store_true", help="実際に送信する。指定しない場合はプレビューのみ")
    args = parser.parse_args()

    if not args.content.exists():
        sys.exit(f"[エラー] 原稿ファイルが見つかりません: {args.content}")
    if not args.template.exists():
        sys.exit(f"[エラー] テンプレートが見つかりません: {args.template}")

    content_text = args.content.read_text(encoding="utf-8")
    template_html = args.template.read_text(encoding="utf-8")
    body_html = text_to_html_paragraphs(content_text)

    subscribers = load_subscribers(args.subscribers)
    already_sent = load_sent_log(args.sent_log)
    targets = [s for s in subscribers if s.email not in already_sent]

    if args.limit is not None:
        targets = targets[: args.limit]

    print(f"購読者: {len(subscribers)}件 / 送信済み(スキップ): {len(already_sent)}件 / 今回の対象: {len(targets)}件\n")

    if not args.send:
        print("[プレビューモード] 実際には送信していません。--send を付けると送信します。\n")
        preview = targets[:1]
        for s in preview:
            rendered = render_email(template_html, args.subject, body_html, s, args.unsubscribe_url)
            print(f"--- プレビュー: {s.email} 宛 ---")
            print(f"件名: {args.subject}")
            print(rendered[:2000])
            print("... (以下省略)\n" if len(rendered) > 2000 else "\n")
        print(f"合計 {len(targets)} 件に配信予定です。")
        return

    smtp_host = os.environ.get("SMTP_HOST")
    smtp_port = int(os.environ.get("SMTP_PORT", "587"))
    smtp_user = os.environ.get("SMTP_USER")
    smtp_pass = os.environ.get("SMTP_PASS")
    from_addr = os.environ.get("FROM_ADDR", smtp_user or "")

    if not all([smtp_host, smtp_user, smtp_pass, from_addr]):
        sys.exit(
            "[エラー] SMTP設定が不足しています。環境変数 SMTP_HOST / SMTP_PORT / "
            "SMTP_USER / SMTP_PASS / FROM_ADDR を設定してください。"
        )

    sent_count = 0
    error_count = 0
    for s in targets:
        rendered = render_email(template_html, args.subject, body_html, s, args.unsubscribe_url)
        try:
            send_via_smtp(smtp_host, smtp_port, smtp_user, smtp_pass, from_addr, s.email, args.subject, rendered)
            append_sent_log(args.sent_log, s.email, "sent")
            sent_count += 1
            print(f"  [送信済み] {s.email}")
        except Exception as exc:  # noqa: BLE001 - 個別配信失敗はログに残して続行する
            append_sent_log(args.sent_log, s.email, f"error: {exc}")
            error_count += 1
            print(f"  [失敗] {s.email}: {exc}")
        time.sleep(args.interval)

    print(f"\n完了。成功 {sent_count} 件 / 失敗 {error_count} 件。ログ: {args.sent_log}")


if __name__ == "__main__":
    main()
