#!/usr/bin/env python3
"""
Threads自動作成・自動投稿ツール (Threads Automator)

hooks.json（フック） × topics.json（本題） × ctas.json（締めの一言）を
組み合わせて投稿文を自動生成し、Threads API（Meta Graph API）経由で投稿する。

依存はPython標準ライブラリのみ（urllib）。追加のpipパッケージ不要。

Threads APIの投稿は2段階:
  1) POST /{threads-user-id}/threads          … メディアコンテナを作成 (creation_id を得る)
  2) POST /{threads-user-id}/threads_publish   … creation_id を公開する

事前にMeta for Developersで「Threads API」アプリを作成し、
長期アクセストークンとThreadsユーザーIDを取得しておく必要があります。

使い方:
    # まず生成される投稿文だけ確認（実際には投稿しない。既定の動作）
    python3 threads_automator.py --count 3 --dry-run

    # 実際に投稿する場合
    THREADS_ACCESS_TOKEN=xxxx THREADS_USER_ID=1234567890 \
    python3 threads_automator.py --count 3 --post --interval 60

詳細は README.md を参照。
"""
from __future__ import annotations

import argparse
import csv
import json
import os
import random
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

HERE = Path(__file__).parent
DEFAULT_API_BASE = "https://graph.threads.net/v1.0"
DEFAULT_POSTED_LOG = "posted_log.csv"


def load_bank(path: Path) -> list[str]:
    if not path.exists():
        sys.exit(f"[エラー] バンクファイルが見つかりません: {path}")
    items = json.loads(path.read_text(encoding="utf-8"))
    if not items:
        sys.exit(f"[エラー] {path} が空です。")
    return items


def load_posted_log(path: Path) -> set[str]:
    if not path.exists():
        return set()
    with path.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        return {row["text_hash"] for row in reader if row.get("status") == "posted"}


def append_posted_log(path: Path, text_hash: str, post_id: str, status: str) -> None:
    is_new = not path.exists()
    with path.open("a", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        if is_new:
            writer.writerow(["timestamp", "text_hash", "post_id", "status"])
        writer.writerow([time.strftime("%Y-%m-%d %H:%M:%S"), text_hash, post_id, status])


def text_hash(text: str) -> str:
    import hashlib

    return hashlib.sha1(text.encode("utf-8")).hexdigest()[:12]


def build_post(hook: str, topic: str, cta: str) -> str:
    return f"{hook}\n\n{topic}\n\n{cta}"


def generate_posts(hooks: list[str], topics: list[str], ctas: list[str], count: int, rng: random.Random) -> list[str]:
    combos = [(h, t, c) for h in hooks for t in topics for c in ctas]
    rng.shuffle(combos)
    if count > len(combos):
        print(f"[警告] 要求件数({count})がフック×トピック×CTAの全組み合わせ({len(combos)})を超えています。"
              "重複が発生します。hooks/topics/ctasを増やすと組み合わせが増えます。")
    picked = []
    i = 0
    while len(picked) < count:
        h, t, c = combos[i % len(combos)]
        picked.append(build_post(h, t, c))
        i += 1
    return picked


def graph_post(api_base: str, path: str, params: dict) -> dict:
    url = f"{api_base}{path}"
    data = urllib.parse.urlencode(params).encode("utf-8")
    req = urllib.request.Request(url, data=data, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {exc.code}: {body}") from exc


def publish_to_threads(api_base: str, user_id: str, access_token: str, text: str) -> str:
    created = graph_post(
        api_base,
        f"/{user_id}/threads",
        {"media_type": "TEXT", "text": text, "access_token": access_token},
    )
    creation_id = created.get("id")
    if not creation_id:
        raise RuntimeError(f"コンテナ作成に失敗: {created}")

    published = graph_post(
        api_base,
        f"/{user_id}/threads_publish",
        {"creation_id": creation_id, "access_token": access_token},
    )
    post_id = published.get("id")
    if not post_id:
        raise RuntimeError(f"公開に失敗: {published}")
    return post_id


def main() -> None:
    parser = argparse.ArgumentParser(description="Threads自動作成・自動投稿ツール")
    parser.add_argument("--hooks", default=HERE / "hooks.json", type=Path)
    parser.add_argument("--topics", default=HERE / "topics.json", type=Path)
    parser.add_argument("--ctas", default=HERE / "ctas.json", type=Path)
    parser.add_argument("--count", type=int, default=1, help="生成/投稿する件数")
    parser.add_argument("--interval", type=float, default=30.0, help="投稿間隔(秒)")
    parser.add_argument("--seed", type=int, default=None, help="乱数シード")
    parser.add_argument("--posted-log", default=Path(DEFAULT_POSTED_LOG), type=Path)
    parser.add_argument("--post", action="store_true", help="実際にThreadsへ投稿する。指定しない場合は生成のみ")
    parser.add_argument("--api-base", default=DEFAULT_API_BASE, help="Graph APIのベースURL(テスト用に上書き可能)")
    args = parser.parse_args()

    hooks = load_bank(args.hooks)
    topics = load_bank(args.topics)
    ctas = load_bank(args.ctas)

    print(f"フック: {len(hooks)}種 / トピック: {len(topics)}種 / CTA: {len(ctas)}種 "
          f"→ 組み合わせ総数: {len(hooks) * len(topics) * len(ctas)}通り\n")

    rng = random.Random(args.seed)
    posts = generate_posts(hooks, topics, ctas, args.count, rng)

    if not args.post:
        print("[プレビューモード] 実際には投稿していません。--post を付けると投稿します。\n")
        for i, text in enumerate(posts, 1):
            print(f"--- {i}/{len(posts)} ({len(text)}文字) ---")
            print(text)
            print()
        return

    access_token = os.environ.get("THREADS_ACCESS_TOKEN")
    user_id = os.environ.get("THREADS_USER_ID")
    if not access_token or not user_id:
        sys.exit("[エラー] 環境変数 THREADS_ACCESS_TOKEN / THREADS_USER_ID を設定してください。")

    posted_hashes = load_posted_log(args.posted_log)
    posted_count = 0
    error_count = 0
    for i, text in enumerate(posts, 1):
        h = text_hash(text)
        if h in posted_hashes:
            print(f"  [スキップ] {i}/{len(posts)}: 既に投稿済み")
            continue
        try:
            post_id = publish_to_threads(args.api_base, user_id, access_token, text)
            append_posted_log(args.posted_log, h, post_id, "posted")
            posted_count += 1
            print(f"  [投稿完了] {i}/{len(posts)}: id={post_id}")
        except Exception as exc:  # noqa: BLE001 - 個別投稿失敗はログに残して続行する
            append_posted_log(args.posted_log, h, "", f"error: {exc}")
            error_count += 1
            print(f"  [失敗] {i}/{len(posts)}: {exc}")
        if i < len(posts):
            time.sleep(args.interval)

    print(f"\n完了。成功 {posted_count} 件 / 失敗 {error_count} 件。ログ: {args.posted_log}")


if __name__ == "__main__":
    main()
