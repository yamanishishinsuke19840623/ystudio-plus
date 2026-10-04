# Design notes: washi-scroll RPG look

This is what worked for a 147-year fugu wholesaler in Shimonoseki when the
user asked for a Japanese gacha-RPG title-screen feel (parchment scroll
dialogs, vermillion ribbon headers, gold-bordered buttons). Treat it as a
worked example of *how to translate a reference screenshot into tokens*,
not as a palette to reuse verbatim for a different brand — a tea shop, a
tech startup, and a fish wholesaler should not all get the same reds and
golds.

## Reading a reference screenshot

When the user pastes a screenshot and says "like this," extract the
*structural* patterns, not just the colors:
- What separates content into panels? (here: parchment cards with a
  ribbon-shaped header banner overlapping the top edge)
- What reads as "pressable"? (here: chunky buttons with a hard drop-shadow
  edge that shifts down on `:active`, mimicking a physical button press)
- What's the border language? (here: a single gold hairline on cards, a
  thicker vermillion edge on the hero banner)
- Is there a recurring motif tying screens together? (here: the red
  ribbon/scroll-end shape reappears on the HUD strip and every dialog)

## Token system used here

```css
--paper:#f3e3ba; --paper2:#e8d199; --paper-edge:#d3b271;
--ink:#3b2716;   --ink-sub:rgba(59,39,22,.64);
--red:#a5311f;   --red-dark:#7a2216;
--gold:#c8963c;  --gold-light:#eecf8e;
--sea-deep:#0b2438; --sea:#123a58; --sea-light:#2c6a8f; --foam:#eef6f4;
```

Display face: `Shippori Mincho` (a calligraphic serif, Google Fonts) for
titles/buttons. Body face: `Noto Sans JP`. Numeric HUD values: `Inter`
with `font-variant-numeric: tabular-nums`.

## Patterns worth reusing (structurally, with new colors)

- **Ribbon header on a card**: an absolutely-positioned pill straddling the
  top edge of a panel (`top:-15px; left:50%; transform:translateX(-50%)`),
  filled with the accent color, containing a short label. Reads instantly
  as "this panel has a name."
- **Pressable button**: solid bottom border-shadow (`box-shadow:0 4px 0
  var(--accent-dark)`) that collapses on `:active`
  (`transform:translateY(3px); box-shadow:0 1px 0 ...`). Cheap to build,
  immediately reads as tappable.
- **Scalloped wave/seigaiha edge**: a repeating radial-gradient arc trick
  for a stage floor edge —
  `background-image:radial-gradient(circle at 10px 0, transparent 9px,
  var(--dark) 10px); background-size:20px 20px;` — cheap texture that reads
  as "Japanese wave motif" without needing an actual image.

## Hero illustration: hand-drawn SVG, kept simple

A full illustrated banner (sunset, waterline, a local landmark silhouette,
a mascot built from the product) sells "this is a real game" far more than
a plain gradient. Keep paths short — layered simple shapes (circles,
short quadratic-bezier paths, small repeated dot clusters for texture) read
as intentional, while long hand-authored path data is slow to write and
easy to get subtly wrong. Build it in layers back-to-front: sky gradient →
soft glow behind the light source → distant/blurred landmark silhouette
(low opacity) → midground → foreground wave/ground band → the mascot →
one or two small live-feeling details (birds, a boat, floating bubbles)
that cost little but sell scale and atmosphere.
