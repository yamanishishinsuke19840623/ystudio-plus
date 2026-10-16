---
name: giftmall-shop
description: ギフトモール（giftmall.co.jp）の出店運営を giftmall-mcp（tools/giftmall-mcp）で扱うときの進め方。注文メールの取り込みと出荷準備（のし・メモ）、月別明細の確認と照合、商品別の売れ行き、giftmall-mcp の改修をするときに使う。
---

# ギフトモールの運用と giftmall-mcp の改修

## 前提（2026-10-16 時点の FACT）
- 出店者向けの公開 API は見つかっていない。材料は「注文確認メール」と「月別明細CSV」だけ。**ギフトモール側を変える操作はできない**と最初に伝える
- 注文確認メール：差出人 `oiwai@giftmall.co.jp`、件名「【ギフトモール】ご注文ありがとうございます」
- 月別明細：管理画面「売上集計 > 月別明細ダウンロード」。毎月1日ごろ sd@giftmall.co.jp から案内が届く。月末締め翌月末支払。相違は案内受領後2営業日以内に連絡
- 明細は「その月に発送済みにした注文」だけ。受注月ではない

## 進め方
- 出荷前は `giftmall_sync_orders` → 出荷準備リスト。**のし・メモ・お届け日時を必ず目立たせる**（「価格のわかるものを入れない」など、贈り物ならではの指示がある）
- 月初は `giftmall_monthly_close`。食い違いがあれば問い合わせの下書きまで。送信はしない
- お客さまの住所・電話番号は会話に書き出さない。ツールも保存しない（都道府県だけ）
- 数字はツールの結果だけを使う。比較や施策は FACT と IDEA を分けて書く（BASE と同じ原則。`.claude/skills/base-shop/SKILL.md`）

## 改修するとき
- 解析は `tools/giftmall-mcp/giftmall.mjs`。CSV の列は `DETAIL_COLUMNS`、メールは `parseOrderEmail` に集約。見つからなければ推測せずエラーにする
- テストの材料（`test/fixtures/`）は実物と同じ構造で、お客さまの情報は架空にする。実物の個人情報をリポジトリに入れない（公開リポジトリ）
- テスト：`cd tools/giftmall-mcp && npm test`
