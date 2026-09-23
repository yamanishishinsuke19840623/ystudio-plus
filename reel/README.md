# 山西水産 リール動画（35秒・9:16）

- 完成動画：`yamanishi-reel-35s.mp4`（1080×1920 / 30fps / H.264＋AAC）
- BGM：自社テーマソング「潮風と、ふくと。」のサビ（`song.html` と同じメロディ・コード）をもとに `bgm.py` でシンセ合成
- 参考にしたもの：kuro_ai_insta さんのリールの**構成の型だけ**（冒頭フック → 大きなテロップ → 最後に行動を促す一言）。映像・文言・素材は流用していません。

## 台本（5秒＝BGMの2小節ごとに場面転換）

| 時間 | 画面テロップ | 見せ方 | 出典（FACT） |
|---|---|---|---|
| 0:00–0:05 | 下関で**147年**。／ふぐ問屋の**4代目**が／**AI**と組むと、／こうなる。 | 1行ずつポップイン（フック） | song.html / chamber.html |
| 0:05–0:10 | 山口県下関市 富任町／創業 **明治12年**（1878年）／**147** 年、続くふぐ問屋。 | 0→147のカウントアップ | index.html footer / song.html |
| 0:10–0:15 | 山西水産株式会社 代表取締役／**4代目** 山西伸典 | 写真 `shinsuke.jpg` をゆっくりズーム | index.html / chamber.html |
| 0:15–0:20 | **10モール**＋自社サイト／**1人**で運営。 | 11枚のストアカードが順に出現 | index.html Results |
| 0:20–0:25 | AIと自動化で 月**30**時間 削減。／**6種**の自動化が、いまも稼働中／※自社実証データ（2023〜2024年） | 0→30のカウントアップ＋歯車6個 | index.html Results |
| 0:25–0:30 | 下関では「ふぐ」じゃなくて「**ふく**」／不遇じゃなくて、**福**を届けたいから。 | 「ふく」でマスコットがぷくっと膨らむ | song.html |
| 0:30–0:35 | ふくと生きる、**山西水産**。／明治12年創業・下関のふぐ問屋／▶ YouTube @shimofugu／lp.yamanisi.co.jp | エンドカード、BGMの最後の和音 | song.html / index.html |

※ 数字・年号・肩書きは、すでにサイトで公開している内容だけを使っています。新しい数字や実績は足していません。

## キャプション案

```
下関で147年、ふぐ問屋の4代目です。

「ふぐ」じゃなくて「ふく」。
不遇じゃなくて、福を届けたいから。

明治12年創業の山西水産は、
10モール＋自社サイトを1人で運営し、
AIと自動化で月30時間の作業を減らしてきました。
（※自社実証データ 2023〜2024年）

変わらないもの、変えていくもの。
ふくと生きる、山西水産。

▶ ふぐ屋の日常とAI活用はYouTube @shimofugu で
🐡 lp.yamanisi.co.jp

#山西水産 #下関 #ふく #ふぐ #老舗 #4代目 #AI活用 #DX #中小企業DX #山口県
```

## 公開前チェック（本人確認が必要なこと）

- [ ] 数字・年号がサイト表記と一致しているか（147年・1878年・4代目・10モール・月30時間・6種）
- [ ] `shinsuke.jpg` の肖像をこの用途で使ってよいか
- [ ] 「10モール」の画面は MALL 1〜10 という仮の表示です。実際のモール名やロゴを出すなら、各モールのロゴ使用ルールを確認してください
- [ ] BGMはシンセで作った仮の音源です。歌入り・生楽器版やSuno版ができたら `bgm.wav` を差し替えて、下の「作り直す」の手順で合成し直してください
- [ ] Instagramの音源は「オリジナル音源」扱いになります

## 作り直す（テロップや音を変えた場合）

```bash
cd reel
pip install numpy imageio-ffmpeg        # 初回のみ
python3 bgm.py                           # BGM → bgm.wav
export FFMPEG=$(python3 -c "import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())")
NODE_PATH=$(npm root -g) node render.mjs stills   # 確認用の静止画
NODE_PATH=$(npm root -g) node render.mjs          # 映像 → video-only.mp4
$FFMPEG -y -i video-only.mp4 -i bgm.wav -c:v copy -c:a aac -b:a 192k -shortest -movflags +faststart yamanishi-reel-35s.mp4
```

テロップは `reel.html` を直接編集します。場面ごとのタイミングは `window.seek` の中にあります。
