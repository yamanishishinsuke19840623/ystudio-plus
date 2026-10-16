#!/usr/bin/env python3
"""
無限リール自動編集ツール (Reel Automator)

素材動画のフォルダと、フックテキスト・BGMのバンクを組み合わせて、
9:16 縦型リール動画をバッチで自動生成する。

  素材クリップ数 x フックの数 x BGMの数 = 出力パターン数

フックやBGMをhooks.json / music/ に追加していくだけで生成できる
組み合わせは際限なく増えていく（＝「無限リール」）。

依存はffmpeg / ffprobeのみ（追加のpipパッケージ不要）。

使い方:
    python3 reel_automator.py --input ./raw_clips --output ./output \
        --music-dir ./music --variants-per-clip 3

詳細は README.md を参照。
"""
from __future__ import annotations

import argparse
import json
import random
import shutil
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path

VIDEO_EXTS = {".mp4", ".mov", ".m4v", ".mkv", ".avi", ".webm"}
AUDIO_EXTS = {".mp3", ".wav", ".m4a", ".aac", ".flac"}

DEFAULT_HOOKS_FILE = Path(__file__).parent / "hooks.json"
DEFAULT_FONT_CANDIDATES = [
    "/usr/share/fonts/truetype/fonts-japanese-gothic.ttf",
    "/usr/share/fonts/opentype/ipafont-gothic/ipag.ttf",
    "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc",
]


def find_ffmpeg_tool(name: str) -> str:
    path = shutil.which(name)
    if not path:
        sys.exit(
            f"[エラー] {name} が見つかりません。`apt-get install ffmpeg` 等でインストールしてください。"
        )
    return path


def find_default_font() -> str | None:
    for candidate in DEFAULT_FONT_CANDIDATES:
        if Path(candidate).exists():
            return candidate
    return None


def probe_duration(ffprobe: str, path: Path) -> float:
    out = subprocess.run(
        [
            ffprobe,
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            str(path),
        ],
        capture_output=True,
        text=True,
        check=True,
    )
    return float(out.stdout.strip())


def wrap_caption(text: str, max_chars_per_line: int = 12) -> str:
    """改行済みならそのまま尊重し、なければ簡易的に折り返す。"""
    if "\n" in text:
        return text
    lines: list[str] = []
    line = ""
    for ch in text:
        line += ch
        if len(line) >= max_chars_per_line:
            lines.append(line)
            line = ""
    if line:
        lines.append(line)
    return "\n".join(lines)


@dataclass
class Variant:
    clip: Path
    hook: str
    music: Path | None
    index: int

    def output_name(self) -> str:
        stem = self.clip.stem
        return f"reel_{stem}_{self.index:02d}.mp4"


@dataclass
class Manifest:
    entries: list[dict] = field(default_factory=list)

    def add(self, variant: Variant, output_path: Path) -> None:
        self.entries.append(
            {
                "output": str(output_path.name),
                "source_clip": str(variant.clip.name),
                "hook": variant.hook,
                "bgm": str(variant.music.name) if variant.music else None,
            }
        )

    def write(self, path: Path) -> None:
        path.write_text(
            json.dumps(self.entries, ensure_ascii=False, indent=2), encoding="utf-8"
        )


def collect_files(directory: Path | None, exts: set[str]) -> list[Path]:
    if directory is None or not directory.exists():
        return []
    return sorted(
        p for p in directory.iterdir() if p.is_file() and p.suffix.lower() in exts
    )


def build_variants(
    clips: list[Path],
    hooks: list[str],
    music_files: list[Path],
    variants_per_clip: int,
    rng: random.Random,
) -> list[Variant]:
    variants: list[Variant] = []
    for clip in clips:
        hook_pool = hooks.copy()
        rng.shuffle(hook_pool)
        for i in range(variants_per_clip):
            hook = hook_pool[i % len(hook_pool)]
            music = rng.choice(music_files) if music_files else None
            variants.append(Variant(clip=clip, hook=hook, music=music, index=i + 1))
    return variants


def render_variant(
    ffmpeg: str,
    ffprobe: str,
    variant: Variant,
    output_dir: Path,
    width: int,
    height: int,
    duration: float,
    font: str | None,
    font_size: int,
    music_volume: float,
    overwrite: bool,
    tmp_dir: Path,
) -> Path:
    out_path = output_dir / variant.output_name()
    if out_path.exists() and not overwrite:
        print(f"  [スキップ] {out_path.name}（既に存在。--overwrite で上書き）")
        return out_path

    src_duration = probe_duration(ffprobe, variant.clip)
    clip_len = min(duration, src_duration)

    caption_file = tmp_dir / f"{out_path.stem}_caption.txt"
    caption_file.write_text(wrap_caption(variant.hook), encoding="utf-8")

    vf_parts = [
        f"scale={width}:{height}:force_original_aspect_ratio=increase",
        f"crop={width}:{height}",
    ]
    if font:
        drawtext = (
            f"drawtext=textfile={escape_ffmpeg_path(caption_file)}:"
            f"fontfile={escape_ffmpeg_path(Path(font))}:"
            f"fontsize={font_size}:fontcolor=white:line_spacing=14:"
            "box=1:boxcolor=black@0.55:boxborderw=26:"
            f"x=(w-text_w)/2:y=h*0.12"
        )
        vf_parts.append(drawtext)
    video_filter = ",".join(vf_parts)

    cmd = [ffmpeg, "-y" if overwrite else "-n", "-i", str(variant.clip)]

    if variant.music:
        cmd += ["-stream_loop", "-1", "-i", str(variant.music)]
        filter_complex = (
            f"[0:v]{video_filter}[v];"
            f"[1:a]atrim=0:{clip_len},afade=t=in:st=0:d=1,"
            f"afade=t=out:st={max(clip_len - 1, 0)}:d=1,"
            f"volume={music_volume}[bgm];"
            f"[0:a]atrim=0:{clip_len}[orig];"
            "[orig][bgm]amix=inputs=2:duration=first:dropout_transition=2[a]"
        )
        cmd += [
            "-filter_complex",
            filter_complex,
            "-map",
            "[v]",
            "-map",
            "[a]",
        ]
    else:
        cmd += ["-vf", video_filter]

    cmd += [
        "-t",
        str(clip_len),
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "20",
        "-c:a",
        "aac",
        "-pix_fmt",
        "yuv420p",
        str(out_path),
        "-loglevel",
        "error",
    ]

    print(f"  [生成中] {out_path.name}  hook=「{variant.hook.replace(chr(10), ' / ')}」"
          f"  bgm={variant.music.name if variant.music else 'なし'}")
    subprocess.run(cmd, check=True)
    return out_path


def escape_ffmpeg_path(path: Path) -> str:
    # drawtextのfilename系オプションはコロン・バックスラッシュをエスケープする必要がある
    s = str(path.resolve())
    return s.replace("\\", "\\\\").replace(":", "\\:")


def main() -> None:
    parser = argparse.ArgumentParser(description="無限リール自動編集ツール")
    parser.add_argument("--input", required=True, type=Path, help="素材動画フォルダ")
    parser.add_argument("--output", default=Path("./output"), type=Path, help="出力フォルダ")
    parser.add_argument("--hooks", default=DEFAULT_HOOKS_FILE, type=Path, help="フックテキストのJSON")
    parser.add_argument("--music-dir", type=Path, default=None, help="BGM音源フォルダ（任意）")
    parser.add_argument("--variants-per-clip", type=int, default=3, help="1素材あたりの生成本数")
    parser.add_argument("--duration", type=float, default=30.0, help="リールの最大秒数")
    parser.add_argument("--width", type=int, default=1080)
    parser.add_argument("--height", type=int, default=1920)
    parser.add_argument("--font", default=None, help="キャプション用フォントファイル(.ttf/.otf)")
    parser.add_argument("--font-size", type=int, default=64)
    parser.add_argument("--music-volume", type=float, default=0.18, help="BGM音量(0.0-1.0)")
    parser.add_argument("--no-caption", action="store_true", help="フックテキストを焼き込まない")
    parser.add_argument("--seed", type=int, default=None, help="乱数シード（再現性が欲しい場合）")
    parser.add_argument("--overwrite", action="store_true", help="既存の出力ファイルを上書き")
    parser.add_argument("--dry-run", action="store_true", help="組み合わせだけ表示して実際には生成しない")
    args = parser.parse_args()

    ffmpeg = find_ffmpeg_tool("ffmpeg")
    ffprobe = find_ffmpeg_tool("ffprobe")

    if not args.input.exists():
        sys.exit(f"[エラー] 入力フォルダが見つかりません: {args.input}")

    clips = collect_files(args.input, VIDEO_EXTS)
    if not clips:
        sys.exit(f"[エラー] {args.input} に動画ファイル({', '.join(sorted(VIDEO_EXTS))})が見つかりません。")

    hooks = json.loads(args.hooks.read_text(encoding="utf-8")) if not args.no_caption else ["_"]
    if not hooks:
        sys.exit(f"[エラー] {args.hooks} にフックテキストがありません。")

    music_files = collect_files(args.music_dir, AUDIO_EXTS)

    font = args.font or (find_default_font() if not args.no_caption else None)
    if not args.no_caption and not font:
        print("[警告] 日本語フォントが見つからないためキャプションなしで生成します。"
              "--font で明示的に指定できます。")

    rng = random.Random(args.seed)
    variants = build_variants(clips, hooks, music_files, args.variants_per_clip, rng)

    print(f"素材クリップ: {len(clips)}本 / フック: {len(hooks)}種 / BGM: {len(music_files)}曲")
    print(f"→ 生成予定: {len(variants)}本のリール\n")

    if args.dry_run:
        for v in variants:
            print(f"  {v.output_name()}: hook=「{v.hook.replace(chr(10), ' / ')}」 "
                  f"bgm={v.music.name if v.music else 'なし'}")
        return

    args.output.mkdir(parents=True, exist_ok=True)
    tmp_dir = args.output / ".tmp_captions"
    tmp_dir.mkdir(parents=True, exist_ok=True)

    manifest = Manifest()
    try:
        for variant in variants:
            out_path = render_variant(
                ffmpeg,
                ffprobe,
                variant,
                args.output,
                args.width,
                args.height,
                args.duration,
                None if args.no_caption else font,
                args.font_size,
                args.music_volume,
                args.overwrite,
                tmp_dir,
            )
            manifest.add(variant, out_path)
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)

    manifest_path = args.output / "manifest.json"
    manifest.write(manifest_path)
    print(f"\n完了。{len(variants)}本のリールを {args.output} に出力しました。")
    print(f"内訳は {manifest_path.name} を参照してください。")


if __name__ == "__main__":
    main()
