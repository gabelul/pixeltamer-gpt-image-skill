# Recipe: Infographic

Editorial magazine-spread infographic. gpt-image-2's sweet spot — precise text rendering, clean section hierarchy, mixed typography + iconography in one composition.

## When to use

- Educational visual explaining a framework, model, or process
- Stats roundup (e.g. "State of X in 2026")
- Comparison spread (X vs Y)
- Listicle visualized as a single page
- Conference-poster summary of a paper or talk

## When NOT to use

- More than 6–8 sections of dense text → output gets crowded; build a carousel instead
- Real data accuracy required → the model paraphrases. Pre-supply exact numbers in the prompt.
- Transparent background needed → strip locally with rembg, or generate green-screen and key it.

## Defaults

- **Size:** `1024x1536` (portrait magazine spread) or `1536x1024` (landscape)
- **Quality:** `high`
- **Backend:** API (codex's `image_gen` works too but the API gives you crisper text)

## Prompt skeleton

```
Editorial magazine-style infographic titled "[TITLE]".

Layout: [GRID DESCRIPTION — e.g. "3-column grid with a tall hero panel
on the left and 6 small data callouts on the right"].

Sections:
- [SECTION 1 NAME]: [1-line description + key stat/quote]
- [SECTION 2 NAME]: [1-line description + key stat/quote]
- [SECTION 3 NAME]: [1-line description + key stat/quote]
[…]

Typography: [SERIF / SANS / DISPLAY] for headlines, clean sans for body.
Color palette: [COLOR 1], [COLOR 2], [COLOR 3] on [BACKGROUND] background.
Visual style: [editorial / Bauhaus / Swiss design / contemporary magazine / academic poster].

Include: small icons or geometric shapes between sections, one hero
illustration or photo block, page-style chrome (margins, header line,
page number).
Render all text legibly. Do NOT distort or invent statistics — use
exactly the numbers above.
```

## Worked example: "5 Stages of Customer Awareness"

```bash
pixeltamer generate -o awareness.png --size 1024x1536 -p '
Editorial magazine-style infographic titled "The 5 Stages of Customer Awareness".

Layout: 5 horizontal rows stacked top-to-bottom, each row representing one stage.
Left side of each row shows a numbered roman numeral and the stage name in large
serif. Right side shows a 1-sentence description and a small icon.

Sections:
- I. Unaware: "Doesn'\''t know they have a problem." Icon: closed eye.
- II. Problem-aware: "Feels the pain, hasn'\''t named it." Icon: question mark.
- III. Solution-aware: "Knows solutions exist, comparing categories." Icon: scale.
- IV. Product-aware: "Knows your product, comparing to alternatives." Icon: target.
- V. Most aware: "Ready to buy, needs the right offer." Icon: handshake.

Typography: bold modern serif (Tiempos / GT Sectra style) for headlines,
clean grotesque sans for body.
Color palette: warm cream background, deep navy text, single accent in
burnt orange for the roman numerals.
Visual style: contemporary editorial magazine, generous whitespace,
thin hairline rules separating rows.

Include: tasteful "Issue 01" header chrome, hairline divider between
each stage, no photos, all text legible.
'
```

## Composition tips

- **Lead the prompt with the title** — the model anchors the whole layout around it.
- **Spell out the grid** — "3-column", "5 stacked rows", "hero panel + sidebar" all work.
- **Number sections** — improves the model's spatial reasoning vs unordered lists.
- **State the typography contrast explicitly** ("bold serif headlines, clean sans body").
- **Pin the palette to 3 colors max** — anything more and the output muddies.
- **End with constraint reminders** — "render all text legibly", "do not invent statistics".

## Common failure modes

| Symptom | Fix |
|---|---|
| Garbled or duplicated text | Reduce text volume; ensure quality is `high`; restate "render all text legibly" |
| Crowded layout | Cut sections; add explicit "generous whitespace" instruction |
| Wrong color cast | Name the background color first, accents second; cap palette at 3 colors |
| Illustrations dominate text | Specify "no photos" or "small icons only, text-led layout" |
