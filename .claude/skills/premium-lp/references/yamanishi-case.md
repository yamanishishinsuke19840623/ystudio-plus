# 実例: 山西水産（2026-10 制作）

- 公開: https://ystudio.yamanisi.co.jp/yamanishi-suisan/ （noindex、トップからリンクなし）
- コード: `yamanishi-suisan/`、`tools/motion-lab/src/yamanishi.js`、`tools/yamanishi-pv/`
- 元LP: https://lp.yamanisi.co.jp/ （ソース = GitHub `yamanishishinsuke19840623/yamanishi-suisan`）
- 自社写真: GitHub `yamanishishinsuke19840623/yamanishisuisan-ig-images`（`posts/`。現場・手元・仕入れ・料理）

## 確定した事実（FACT）
- 明治12年（1879年）創業、2026年で創業147年。4代目 山西伸典（平成23年〜）
- 初代 宇之助（渡海人）→ 2代目 克己（昭和24年 山西水産株式会社設立）→ 3代目 克之助（昭和47年 加工場、1990年 シマフグ）→ 4代目
- 1592年 豊臣秀吉「ふぐ食禁止の令」→ 明治21年（1888年）伊藤博文が山口県でふぐ食解禁
- 南風泊市場＝世界で唯一のふぐ専門卸売市場。南風泊市場から直接買付、毎朝店長自ら目利き
- 楽天市場 上位1%の優良ショップ、10モール以上でEC展開
- 商品6点と BASE の商品ページ（元LPと同じ並び）
- 電話 083-258-0032、販売: 楽天市場・Yahoo!ショッピング・BASE、SNS: YouTube @shimofugu・Instagram @yamanishisuisan・TikTok
- テーマソング「潮風と、ふくと。」（song.html、96BPM、サビ「ふくと生きる　山西水産」）

## お客さん（やまちゃん）の好み・NG
- ◎ 「アニメーションでおっ！すごい」— 大技（文字ズーム・年号カウンター・横年表）が刺さった
- ◎ PVは60秒。曲と連動させる
- ✕ AIっぽい見た目（元LPが濃紺＋金で、それと同じに見えた）
- ✕ 極太ゴシック（Dela Gothic One）→「かっこ悪い。筆フォントにして」。希望は黒龍体（市販・ライセンス要）→ 代替 Yuji Syuku＋同色ふち
- ✕ 「富任町」を出さない（見出し・PV・お問い合わせ欄の住所も外した）
- ✕ あんこう鍋の写真が粗い（元LPの画像が320px）→ 高画質の写真待ち
- ✕ 刺身の写真に「一匹一匹」→ 魚を手に取る写真に
- ✕ 古い規格の箱入りセット写真 → 食卓の写真に
- ✕ スマホで「スライド？スクロールしにくい」→ タッチ端末は Lenis をやめてネイティブスクロール、固定区間を短く
- ✕ ヒーローの「ふく」の中にイメージ写真 →「変。高級感あるふくの文字に」→ 墨一色の筆文字＋朱の落款「山西水産」、墨がにじむ登場

## 残っている宿題
- あんこう鍋の高画質写真（本人から受け取ったら `img/p3.jpg` を差し替え、PVの商品カットにも戻す）
- noindex を外すか・トップからリンクするか（本人判断）

## 構造化データ（2026-10 追加）
- 事実の置き場: `yamanishi-suisan/facts.json`（FACT のみ。富任町は書かない）
- `node tools/yamanishi-seo/build.mjs` で JSON-LD（Organization / Person / WebPage / VideoObject / ItemList）と OGP を `index.html` の `seo:start〜seo:end` に生成。GitHub Actions `yamanishi-seo.yml` が push 時に自動実行
- 商品は価格・在庫が未確認のため Product ではなく ItemList（名前・URL・画像）にしている
- noindex のままなので、検索に効くのは noindex を外す判断の後。外すなら元LP（lp.yamanisi.co.jp）側にも同じ JSON-LD を入れる

## 毎日の自動更新（2026-10 追加）
- セクション「毎日の、山西水産。」（`#now`、やまちゃんと購入の間）。`<!-- feed:start〜feed:end -->` は自動生成
- `tools/yamanishi-content/update.mjs`: 写真リポジトリ `posts/` の新しい6枚を 900px に縮めて `img/feed/` へ（古いものは削除）＋ YouTube @shimofugu の公開RSSから新着3本（タイトルは本人のものをそのまま）
- GitHub Actions `yamanishi-content.yml` が毎日 09:20 JST に実行（写真は毎朝 9:00 追加のため）。取得に失敗した側は前回のまま残す
- キャプションは写真リポジトリに無い（Windows 側の photo_queue.json）ので、写真には日付だけ付けている。AIで文章は作らない
