# Template: image-generation handoff brief

Use this shape when the user wants to generate art with an external tool
(Codex, ChatGPT image, Midjourney, Firefly's own web app, etc.) instead of
your hand-drawn SVG. Fill in the bracketed parts from the actual game; don't
reuse the fugu-specific example verbatim for a different brand.

Deliver the filled-in version as a file via the user-file-delivery tool
(not just pasted in chat) so it's trivial for the user to copy into the
external tool. Always end it with the same "how to hand it back" section —
that's the part that makes the loop actually close, since otherwise the
user has a nice image and no idea what to do with it.

```markdown
## Prompt to paste into [tool]

\```
[One or two sentences: what game this is for, and the single scene to
depict — be concrete about setting, era, and the one or two named
landmarks/objects the brand is actually known for. Pull these from what
you verified in step 1 of the main skill, not invented detail.]

[Style line: name the visual register explicitly — e.g. "flat, warm
retro-JRPG title-screen illustration, not photorealistic" — and state any
copyright guardrail plainly: don't resemble real people, existing
copyrighted characters, or trademarked logos.]

[Color palette: list the actual hex values from your CSS tokens, labeled
by what they're for — sky, water, accent, mascot color, etc. — so the
result will actually match the page it's going into instead of needing a
recolor pass.]

[Output spec: exact pixel dimensions and aspect ratio matching the CSS
container (e.g. a `.hero{aspect-ratio:16/8}` wants a 2:1 image — generate
at 2x the rendered size for retina, so 1600x800 not 800x400), file format,
and whether it needs a transparent background (standalone
character/prop) or can be a flat rectangle (full-bleed background). Ask
for no embedded text/logos — you'll composite real text over it yourself.]
\```

## If a standalone transparent asset is also useful

\```
[Same character/mascot, transparent background, square, for reuse as an
icon or on a results screen.]
\```

## When the image comes back

1. Attach the file(s) directly in this chat — no special naming needed.
2. Say which is which if there's more than one (hero background vs.
   standalone character).
3. Multiple variants are fine — say so, and offer to pick the best fit or
   combine them.
```
