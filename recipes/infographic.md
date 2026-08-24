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
- Transparent background needed → generate with `--background transparent` and add the plot-area clause from `references/transparency.md`. Charts default hard to a white card, so say it explicitly.
- **Numbers that have to be right** → don't generate the chart at all. See below.

## Generated charts are artwork, not data

OpenAI says this in their own transparency cookbook and it's worth repeating in full: a generated chart is raster artwork. You can hand the model exact values and it will still paraphrase a label, nudge a bar height, or round a percentage. Nothing in the pipeline errors.

So split the job by whether the numbers are load-bearing:

| The chart is… | Do this |
|---|---|
| Illustrative — a shape, a trend, a concept | Generate it. Speed and visual character win. |
| Reporting real figures anyone will act on | Render it deterministically (HTML + headless Chrome, matplotlib, whatever), generate the *illustration around it* |
| A board slide with both | Generate the transparent background art, composite the deterministic chart on top |

If you do generate a data chart, pre-supply the exact values in the prompt and then verify every label and proportion against the source before it ships. Read the numbers off the image, not off your prompt.

This is the same "how many times will I edit this, and does it have to be exact?" split that governs render-vs-generate everywhere else — a chart with real numbers is the most exact thing on the slide.

### Transparent charts for branded decks

The reason to bother: a generated chart with a white card clashes with every corporate theme. Transparent, it inherits the slide's gradient.

```
Create one polished enterprise bar chart on a genuinely transparent background
for a dark navy slide. Use exactly four ascending bars with these values:
Q1 = $3.2M, Q2 = $4.8M, Q3 = $6.5M, Q4 = $7.9M.
Use cobalt blue, bright blue, electric azure and turquoise bars.
Add white quarter labels below each bar and white dollar-value labels above each.
Keep the plot area, the grid, and the space between bars transparent.
Do not add a background, filled panel, frame, title, or card.
```

Three things doing the work: transparency named *through* the chart rather than around it, label colours stated explicitly (the model defaults to dark text that disappears on a dark slide), and the values written out rather than described. `1536x1024` at `--quality high` gives small labels room to render legibly.

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
