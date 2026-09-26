#!/usr/bin/env python3
"""Cut short vertical clips from the Night Bubble videos for nightbubble-reels.html.

  fetch  ID [ID ...]                 download the YouTube videos (yt-dlp) into tools/.clip-src/ (not committed)
  sheet  SRC [--every 1] [--out F]   contact sheet: one thumbnail every N seconds, labelled with the time
  cut    SRC START DUR NAME [--fx .5] [--fy .5]
                                     START..START+DUR -> nightbubble-clips/NAME.webm
                                     (9:16 crop around fx/fy, 30fps, VP9, no audio, <=1080px tall)

  FFMPEG=/path/to/ffmpeg (defaults to imageio-ffmpeg's binary, then "ffmpeg" on PATH)
"""
import argparse, math, os, subprocess, sys, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_DIR = os.path.join(ROOT, 'tools', '.clip-src')
OUT_DIR = os.path.join(ROOT, 'nightbubble-clips')


def ffmpeg():
    if os.environ.get('FFMPEG'):
        return os.environ['FFMPEG']
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except ImportError:
        return 'ffmpeg'


def probe(src):
    """(width, height, duration) — parsed from ffmpeg's banner so ffprobe isn't needed."""
    err = subprocess.run([ffmpeg(), '-hide_banner', '-i', src], capture_output=True, text=True).stderr
    import re
    w, h = map(int, re.search(r'Video:.*?(\d{2,5})x(\d{2,5})', err).groups())
    hh, mm, ss = re.search(r'Duration: (\d+):(\d+):([\d.]+)', err).groups()
    return w, h, int(hh) * 3600 + int(mm) * 60 + float(ss)


def fetch(ids):
    os.makedirs(SRC_DIR, exist_ok=True)
    for i in ids:
        subprocess.run([sys.executable, '-m', 'yt_dlp', '-f', 'bv*[height<=1080][ext=mp4]/bv*[height<=1080]/bv*',
                        '-o', os.path.join(SRC_DIR, '%(id)s.%(ext)s'), f'https://www.youtube.com/watch?v={i}'], check=True)


def sheet(src, every, out):
    from PIL import Image, ImageDraw
    w, h, dur = probe(src)
    tw = 320 if w >= h else 180
    th = round(tw * h / w)
    with tempfile.TemporaryDirectory() as d:
        subprocess.run([ffmpeg(), '-v', 'error', '-i', src, '-vf', f'fps=1/{every},scale={tw}:{th}',
                        os.path.join(d, '%04d.jpg')], check=True)
        frames = sorted(os.listdir(d))
        cols = 6 if w >= h else 10
        rows = math.ceil(len(frames) / cols)
        img = Image.new('RGB', (cols * tw, rows * (th + 18)), '#070b22')
        dr = ImageDraw.Draw(img)
        for k, f in enumerate(frames):
            x, y = (k % cols) * tw, (k // cols) * (th + 18)
            img.paste(Image.open(os.path.join(d, f)), (x, y))
            s = k * every
            dr.text((x + 4, y + th + 3), f'{int(s // 60)}:{s % 60:04.1f}', fill='#f3dc9a')
    out = out or os.path.splitext(src)[0] + '-sheet.jpg'
    img.save(out, quality=82)
    print(out, f'({len(frames)} frames, {w}x{h}, {dur:.1f}s)')


def cut(src, start, dur, name, fx, fy):
    w, h, _ = probe(src)
    # largest 9:16 window, centred on the focus point, never upscaled past 1080 tall
    cw, ch = (round(h * 9 / 16) // 2 * 2, h) if w / h > 9 / 16 else (w, round(w * 16 / 9) // 2 * 2)
    x = min(max(0, round(w * fx - cw / 2)), w - cw)
    y = min(max(0, round(h * fy - ch / 2)), h - ch)
    oh = min(1080, ch) // 2 * 2
    ow = round(oh * 9 / 16) // 2 * 2
    os.makedirs(OUT_DIR, exist_ok=True)
    out = os.path.join(OUT_DIR, f'{name}.webm')
    subprocess.run([ffmpeg(), '-y', '-v', 'error', '-ss', str(start), '-i', src, '-t', str(dur), '-an',
                    '-vf', f'crop={cw}:{ch}:{x}:{y},scale={ow}:{oh}:flags=lanczos,fps=30',
                    '-c:v', 'libvpx-vp9', '-crf', '34', '-b:v', '0', '-g', '15', '-row-mt', '1',
                    '-deadline', 'good', '-cpu-used', '2', out], check=True)
    print(out, f'{os.path.getsize(out) / 1024:.0f} KB', f'{ow}x{oh}')


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest='cmd', required=True)
    a = sub.add_parser('fetch'); a.add_argument('ids', nargs='+')
    a = sub.add_parser('sheet'); a.add_argument('src'); a.add_argument('--every', type=float, default=1); a.add_argument('--out')
    a = sub.add_parser('cut'); a.add_argument('src'); a.add_argument('start', type=float); a.add_argument('dur', type=float); a.add_argument('name')
    a.add_argument('--fx', type=float, default=.5); a.add_argument('--fy', type=float, default=.5)
    o = ap.parse_args()
    if o.cmd == 'fetch': fetch(o.ids)
    elif o.cmd == 'sheet': sheet(o.src, o.every, o.out)
    else: cut(o.src, o.start, o.dur, o.name, o.fx, o.fy)
