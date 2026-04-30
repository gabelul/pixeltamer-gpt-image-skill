# Recipe: Editorial Cover

Magazine covers, book covers, podcast art, conference posters. Anything that needs hero typography fused with a striking image. gpt-image-2's text rendering plus its grasp of editorial composition makes this much cheaper than the old design-then-typeset workflow.

## When to use

- Magazine cover (digital or print)
- Book / report cover
- Podcast or playlist cover art
- Conference / event poster
- Standalone "issue cover" stylized image for content marketing

## When NOT to use

- Pure photography with no typography → just generate the photo
- Design that needs editable layered files → use Figma
- Brand materials with strict logo placement → manually composite the logo

## Defaults

- **Size:** `2048x3072` (2:3 portrait, magazine cover) or `1024x1536` (smaller spec) or `2160x3840` (4K portrait poster)
- **Quality:** `high`
- **Backend:** API (text quality matters; codex works but with less control)

## Prompt skeleton

```
Editorial [magazine / book / poster] cover, [PORTRAIT / LANDSCAPE] composition.

Hero image: [DESCRIBE THE IMAGE — subject, style, lighting, color grade,
camera framing, mood].

Typography overlay:
- Masthead (top, [POSITION]): "[MAGAZINE NAME]" in [FONT STYLE], [COLOR].
- Hero headline (centered, large): "[HEADLINE — under 8 words]"
  in [FONT STYLE], [COLOR], [PLACEMENT NOTES].
- Subline / dek (small, below or above hero): "[SUBLINE — under 16 words]".
- Issue / date stamp (corner): "[ISSUE NO / DATE]".

Style anchor: [referenced magazine, era, photographer, or movement —
e.g. "1990s Wallpaper magazine", "early Wired", "Bauhaus poster series",
"Wes Anderson film palette"].

Render all text exactly as written. Do not invent additional text or logos.
```

## Worked example: tech magazine cover

```bash
pixeltamer generate -o cover.png --size 2048x3072 -p '
Editorial magazine cover, 2:3 portrait composition.

Hero image: a photorealistic mechanical keyboard partially submerged in
a shimmering pool of liquid chrome, dramatic violet and amber rim lighting
from upper left and lower right, pitch-black background. Shot on 35mm film
with subtle grain. The keyboard keys are crisp and legible despite the
chrome distortion.

Typography overlay:
- Masthead (top center, large): "FORESIGHT" in tall condensed serif,
  cream off-white #f5e6d3, with a thin amber underline rule below.
- Issue stamp (top right corner, small): "ISSUE 14 — APRIL 2026"
  in monospaced caps, same cream color.
- Hero headline (lower third, centered, MASSIVE): "THE END OF THE KEYBOARD"
  in heavy condensed serif, cream color, three lines, generous letter spacing.
- Dek (below hero, small): "Why the next decade of input devices abandons
  the QWERTY assumption — by Maya Chen".

Style anchor: late-90s Wallpaper magazine cover meets Wired'\''s 2008 era.
Editorial, premium, bold without being loud.

Render all text exactly as written. Do not invent additional text or logos.
No barcode, no UPC stripe, no "subscribe today" sash.
'
```

## Worked example: podcast cover art

```bash
pixeltamer generate -o podcast.png --size 1024x1024 -p '
Podcast cover art, 1:1 square.

Hero image: a single fountain pen mid-stroke writing on cream paper,
extreme close-up, shallow depth of field, ink pooling slightly at the
nib. Warm side lighting, deep shadow, single accent color in the ink
(saturated teal #0d9488).

Typography overlay:
- Show name (centered, lower third): "SECOND DRAFT" in tall condensed
  serif, deep navy #1c1917, all caps, generous letter spacing.
- Tagline (below show name, small): "Conversations with people who
  rewrite for a living."

Style anchor: Aperture magazine meets a New Yorker book review.
Editorial, restrained, premium.

Render all text exactly as written. No host names, no episode numbers,
no decorative borders.
'
```

## Composition tips

- **Hero image first, typography second.** Describe the image with the same care as if you were generating it standalone, THEN list the type overlay.
- **One headline only.** Editorial covers have one hero headline. Two competing headlines = mush.
- **Specify the masthead's font style explicitly.** "Tall condensed serif", "blackletter", "geometric sans-bold". Otherwise the model defaults to generic display fonts.
- **Use a real magazine reference for style anchor.** "1990s Wallpaper", "early Wired", "Aperture", "Monocle". One reference per prompt.
- **Reserve corners for issue / date stamps.** Editorial covers have these. Add them in small caps to look authentic.
- **Negative directives matter here.** "No barcode, no UPC stripe, no 'subscribe today' sash, no fake QR code." The model adds these unprompted because real magazines have them.

## Common failure modes

| Symptom | Fix |
|---|---|
| Magazine name misspelled | Quote it twice in the prompt: once in the masthead instruction, once in a reminder line. |
| Generic stock-cover look | Cut praise language; add a specific magazine reference and an era. |
| Headline competes with hero image | Move headline to lower third; reduce hero image visual weight; or strip imagery (full-typography cover) |
| Random extra text appears | Add: "No barcode, UPC stripe, subscribe-today sash, hashtags, additional cover lines" |
| Issue date wrong | Quote the exact issue / date string, including the dash and capitalization |
