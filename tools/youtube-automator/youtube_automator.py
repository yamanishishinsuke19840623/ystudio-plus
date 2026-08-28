#!/usr/bin/env python3
"""
YouTube動画自動編集・自動投稿ツール (YouTube Automator)

edit  : 本編素材 + 任意のオープニング/エンディング動画を結合し、
        タイトルテロップとサムネイル画像を自動生成する。
upload: 編集済み動画をYouTube Data API v3経由でアップロードする。

依存はPython標準ライブラリのみ（urllib）。動画処理にはffmpeg/ffprobeを使用する。

事前にGoogle Cloud ConsoleでYouTube Data API v3を有効化したOAuthクライアントを
作成し、当該チャンネルの同意を得たリフレッシュトークンを取得しておく必要が
あります。

使い方:
    # 1) 編集（結合・タイトルテロップ・サムネイル生成）
    python3 youtube_automator.py edit --input main.mp4 --intro intro.mp4 --outro outro.mp4 \
        --title-text "今月のAI活用ヒント" --output edited.mp4 --thumbnail-out thumb.jpg

    # 2) アップロード内容をプレビュー（既定の動作。実際には投稿しない）
    python3 youtube_automator.py upload --video edited.mp4 \
        --title "今月のAI活用ヒント" --description "..." --tags "AI,DX,業務効率化"

    # 3) 実際にアップロード
    YOUTUBE_CLIENT_ID=xxx YOUTUBE_CLIENT_SECRET=xxx YOUTUBE_REFRESH_TOKEN=xxx \
    python3 youtube_automator.py upload --video edited.mp4 \
        --title "今月のAI活用ヒント" --description "..." --tags "AI,DX,業務効率化" \
        --thumbnail thumb.jpg --privacy unlisted --upload

詳細は README.md を参照。
"""
from __future__ import annotations

import argparse
import json
import mimetypes
import os
import shutil
import subprocess
import sys
import tempfile
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

DEFAULT_FONT_CANDIDATES = [
    "/usr/share/fonts/truetype/fonts-japanese-gothic.ttf",
    "/usr/share/fonts/opentype/ipafont-gothic/ipag.ttf",
    "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc",
]
TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token"
UPLOAD_API_BASE = "https://www.googleapis.com"


def find_tool(name: str) -> str:
    path = shutil.which(name)
    if not path:
        sys.exit(f"[エラー] {name} が見つかりません。`apt-get install ffmpeg` 等でインストールしてください。")
    return path


def find_default_font() -> str | None:
    for candidate in DEFAULT_FONT_CANDIDATES:
        if Path(candidate).exists():
            return candidate
    return None


def escape_ffmpeg_path(path: Path) -> str:
    return str(path.resolve()).replace("\\", "\\\\").replace(":", "\\:")


# ---------------------------------------------------------------------------
# edit
# ---------------------------------------------------------------------------

def cmd_edit(args: argparse.Namespace) -> None:
    ffmpeg = find_tool("ffmpeg")
    ffprobe = find_tool("ffprobe")

    clips = [c for c in [args.intro, args.input, args.outro] if c is not None]
    for c in clips:
        if not c.exists():
            sys.exit(f"[エラー] 素材が見つかりません: {c}")

    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        normalized = []
        for i, clip in enumerate(clips):
            out = tmp_path / f"norm_{i}.mp4"
            cmd = [
                ffmpeg, "-y", "-i", str(clip),
                "-vf", f"scale={args.width}:{args.height}:force_original_aspect_ratio=decrease,"
                       f"pad={args.width}:{args.height}:(ow-iw)/2:(oh-ih)/2",
                "-r", "30", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
                "-c:a", "aac", "-ar", "44100", "-ac", "2",
                "-pix_fmt", "yuv420p", str(out), "-loglevel", "error",
            ]
            print(f"  [正規化中] {clip.name}")
            subprocess.run(cmd, check=True)
            normalized.append(out)

        concat_list = tmp_path / "concat.txt"
        concat_list.write_text(
            "\n".join(f"file '{escape_ffmpeg_path(p)}'" for p in normalized), encoding="utf-8"
        )

        merged = tmp_path / "merged.mp4"
        subprocess.run(
            [ffmpeg, "-y", "-f", "concat", "-safe", "0", "-i", str(concat_list),
             "-c", "copy", str(merged), "-loglevel", "error"],
            check=True,
        )

        args.output.parent.mkdir(parents=True, exist_ok=True)
        font = args.font or find_default_font()
        if args.title_text and not font:
            print("[警告] 日本語フォントが見つからないためタイトルテロップなしで出力します。"
                  "--font で明示的に指定できます。")
        if args.title_text and font:
            caption_file = tmp_path / "title.txt"
            caption_file.write_text(args.title_text, encoding="utf-8")
            drawtext = (
                f"drawtext=textfile={escape_ffmpeg_path(caption_file)}:"
                f"fontfile={escape_ffmpeg_path(Path(font))}:"
                f"fontsize={args.font_size}:fontcolor=white:line_spacing=10:"
                "box=1:boxcolor=black@0.55:boxborderw=24:"
                f"x=(w-text_w)/2:y=h*0.85:enable='lt(t,{args.title_duration})'"
            )
            subprocess.run(
                [ffmpeg, "-y", "-i", str(merged), "-vf", drawtext,
                 "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
                 "-c:a", "copy", str(args.output), "-loglevel", "error"],
                check=True,
            )
        else:
            shutil.copy(merged, args.output)

        print(f"[編集完了] {args.output}")

        if args.thumbnail_out:
            args.thumbnail_out.parent.mkdir(parents=True, exist_ok=True)
            thumb_filters = [f"scale={args.width}:{args.height}"]
            if args.title_text:
                font = args.font or find_default_font()
                caption_file = tmp_path / "thumb_title.txt"
                caption_file.write_text(args.title_text, encoding="utf-8")
                if font:
                    thumb_filters.append(
                        f"drawtext=textfile={escape_ffmpeg_path(caption_file)}:"
                        f"fontfile={escape_ffmpeg_path(Path(font))}:"
                        f"fontsize={int(args.font_size * 1.4)}:fontcolor=white:line_spacing=14:"
                        "box=1:boxcolor=black@0.6:boxborderw=30:"
                        "x=(w-text_w)/2:y=(h-text_h)/2"
                    )
            subprocess.run(
                [ffmpeg, "-y", "-ss", str(args.thumbnail_time), "-i", str(args.output),
                 "-vf", ",".join(thumb_filters), "-vframes", "1", str(args.thumbnail_out),
                 "-loglevel", "error"],
                check=True,
            )
            print(f"[サムネイル生成完了] {args.thumbnail_out}")


# ---------------------------------------------------------------------------
# upload
# ---------------------------------------------------------------------------

def get_access_token(api_base_token: str) -> str:
    token = os.environ.get("YOUTUBE_ACCESS_TOKEN")
    if token:
        return token
    client_id = os.environ.get("YOUTUBE_CLIENT_ID")
    client_secret = os.environ.get("YOUTUBE_CLIENT_SECRET")
    refresh_token = os.environ.get("YOUTUBE_REFRESH_TOKEN")
    if not all([client_id, client_secret, refresh_token]):
        sys.exit(
            "[エラー] 認証情報が不足しています。YOUTUBE_ACCESS_TOKEN を直接指定するか、"
            "YOUTUBE_CLIENT_ID / YOUTUBE_CLIENT_SECRET / YOUTUBE_REFRESH_TOKEN を設定してください。"
        )
    data = urllib.parse.urlencode({
        "client_id": client_id,
        "client_secret": client_secret,
        "refresh_token": refresh_token,
        "grant_type": "refresh_token",
    }).encode("utf-8")
    req = urllib.request.Request(api_base_token, data=data, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode("utf-8"))["access_token"]
    except urllib.error.HTTPError as exc:
        sys.exit(f"[エラー] アクセストークンの取得に失敗しました: {exc.read().decode('utf-8', errors='replace')}")


def upload_video(api_base: str, access_token: str, video_path: Path, title: str, description: str,
                  tags: list[str], category_id: str, privacy: str) -> str:
    metadata = {
        "snippet": {"title": title, "description": description, "tags": tags, "categoryId": category_id},
        "status": {"privacyStatus": privacy},
    }
    body = json.dumps(metadata).encode("utf-8")
    size = video_path.stat().st_size
    mime = mimetypes.guess_type(str(video_path))[0] or "video/mp4"

    init_url = f"{api_base}/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status"
    req = urllib.request.Request(init_url, data=body, method="POST")
    req.add_header("Authorization", f"Bearer {access_token}")
    req.add_header("Content-Type", "application/json; charset=UTF-8")
    req.add_header("X-Upload-Content-Type", mime)
    req.add_header("X-Upload-Content-Length", str(size))
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            upload_url = resp.headers.get("Location")
    except urllib.error.HTTPError as exc:
        raise RuntimeError(f"アップロード初期化に失敗: HTTP {exc.code}: "
                            f"{exc.read().decode('utf-8', errors='replace')}") from exc
    if not upload_url:
        raise RuntimeError("アップロード先URL(Location)が取得できませんでした。")

    with video_path.open("rb") as f:
        video_bytes = f.read()
    put_req = urllib.request.Request(upload_url, data=video_bytes, method="PUT")
    put_req.add_header("Content-Type", mime)
    try:
        with urllib.request.urlopen(put_req, timeout=None) as resp:
            result = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        raise RuntimeError(f"アップロードに失敗: HTTP {exc.code}: "
                            f"{exc.read().decode('utf-8', errors='replace')}") from exc
    return result["id"]


def set_thumbnail(api_base: str, access_token: str, video_id: str, thumbnail_path: Path) -> None:
    mime = mimetypes.guess_type(str(thumbnail_path))[0] or "image/jpeg"
    url = f"{api_base}/upload/youtube/v3/thumbnails/set?videoId={urllib.parse.quote(video_id)}"
    req = urllib.request.Request(url, data=thumbnail_path.read_bytes(), method="POST")
    req.add_header("Authorization", f"Bearer {access_token}")
    req.add_header("Content-Type", mime)
    try:
        with urllib.request.urlopen(req, timeout=60):
            pass
    except urllib.error.HTTPError as exc:
        raise RuntimeError(f"サムネイル設定に失敗: HTTP {exc.code}: "
                            f"{exc.read().decode('utf-8', errors='replace')}") from exc


def cmd_upload(args: argparse.Namespace) -> None:
    if not args.video.exists():
        sys.exit(f"[エラー] 動画ファイルが見つかりません: {args.video}")
    tags = [t.strip() for t in (args.tags or "").split(",") if t.strip()]

    print("--- アップロード内容プレビュー ---")
    print(f"ファイル: {args.video} ({args.video.stat().st_size / 1_000_000:.1f} MB)")
    print(f"タイトル: {args.title}")
    print(f"説明文: {args.description[:200]}{'...' if len(args.description) > 200 else ''}")
    print(f"タグ: {', '.join(tags) if tags else '(なし)'}")
    print(f"公開設定: {args.privacy}")
    if args.thumbnail:
        print(f"サムネイル: {args.thumbnail}")
    print()

    if not args.upload:
        print("[プレビューモード] 実際にはアップロードしていません。--upload を付けるとアップロードします。")
        return

    access_token = get_access_token(args.token_endpoint)
    print("[アップロード中] ...")
    video_id = upload_video(
        args.api_base, access_token, args.video, args.title, args.description,
        tags, args.category_id, args.privacy,
    )
    print(f"[アップロード完了] video_id={video_id} "
          f"https://youtu.be/{video_id}")

    if args.thumbnail:
        if not args.thumbnail.exists():
            print(f"[警告] サムネイル画像が見つかりません: {args.thumbnail}（スキップ）")
        else:
            set_thumbnail(args.api_base, access_token, video_id, args.thumbnail)
            print("[サムネイル設定完了]")


def main() -> None:
    parser = argparse.ArgumentParser(description="YouTube動画自動編集・自動投稿ツール")
    sub = parser.add_subparsers(dest="action", required=True)

    p_edit = sub.add_parser("edit", help="動画の結合・タイトルテロップ・サムネイル生成")
    p_edit.add_argument("--input", required=True, type=Path, help="本編素材")
    p_edit.add_argument("--intro", type=Path, default=None, help="オープニング動画(任意)")
    p_edit.add_argument("--outro", type=Path, default=None, help="エンディング動画(任意)")
    p_edit.add_argument("--output", required=True, type=Path, help="編集後の出力先")
    p_edit.add_argument("--title-text", default=None, help="動画冒頭に焼き込むタイトルテロップ")
    p_edit.add_argument("--title-duration", type=float, default=5.0, help="テロップの表示秒数")
    p_edit.add_argument("--thumbnail-out", type=Path, default=None, help="サムネイル画像の出力先")
    p_edit.add_argument("--thumbnail-time", type=float, default=3.0, help="サムネイルに使うフレームの位置(秒)")
    p_edit.add_argument("--width", type=int, default=1920)
    p_edit.add_argument("--height", type=int, default=1080)
    p_edit.add_argument("--font", default=None)
    p_edit.add_argument("--font-size", type=int, default=54)
    p_edit.set_defaults(func=cmd_edit)

    p_upload = sub.add_parser("upload", help="YouTubeへアップロード")
    p_upload.add_argument("--video", required=True, type=Path)
    p_upload.add_argument("--title", required=True)
    p_upload.add_argument("--description", default="")
    p_upload.add_argument("--tags", default="", help="カンマ区切りのタグ")
    p_upload.add_argument("--category-id", default="22", help="YouTubeカテゴリID(既定: 22=Blogs/People)")
    p_upload.add_argument("--privacy", default="private", choices=["private", "unlisted", "public"])
    p_upload.add_argument("--thumbnail", type=Path, default=None)
    p_upload.add_argument("--api-base", default=UPLOAD_API_BASE, help="テスト用にAPIベースURLを上書き")
    p_upload.add_argument("--token-endpoint", default=TOKEN_ENDPOINT, help="テスト用にトークンエンドポイントを上書き")
    p_upload.add_argument("--upload", action="store_true", help="実際にアップロードする")
    p_upload.set_defaults(func=cmd_upload)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
