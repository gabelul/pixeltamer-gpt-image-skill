# Recipe: Viral LinkedIn Image

Single image attached to a LinkedIn post, designed to stop the scroll. The job of the image is one thing: get the eye to stop long enough to read the first line of the post. gpt-image-2 excels here because LinkedIn scroll-stops are typography-driven, and that's its strongest dimension.

## When to use

- Image companion for a high-stakes LinkedIn post
- Standalone "quote card" or "framework card"
- Carousel COVER (slide 1) — the rest of the deck lives elsewhere
- "Meta-environmental" scroll-stops (a poster on a subway wall, a notebook page, a magazine cover, a whiteboard) — these consistently outperform flat graphics on the LinkedIn feed.

## When NOT to use

- Multi-slide carousel content slides → use carousel tooling
- Generic stock-photo replacement → free stock is cheaper
- Animated assets → use video / GIF tooling

## Defaults

- **Size:** `1024x1024` (square — best for LinkedIn feed) or `1024x1536` (portrait, occasionally)
- **Quality:** `high`
- **Backend:** API or codex; both work, API is faster

## Three formats that work

### Format 1: Bold typographic poster

The pure form. One headline, one subhead, one accent. No imagery.

```
LinkedIn scroll-stop poster, 1:1 square.

Headline (massive, fills 60% of the frame): "[HEADLINE — under 8 words]"
Subhead (small, below headline): "[SUBHEAD — under 12 words]"

Typography: [DISPLAY SERIF / CONDENSED SANS] in [COLOR], on [BACKGROUND] background.
Single accent shape: [GEOMETRIC SHAPE] in [ACCENT COLOR], placed [POSITION].
Generous margins. No other elements. No icons. No imagery.

Render all text exactly as written — do not paraphrase.
```

### Format 2: Meta-environmental scroll-stop

The poster lives in a real-world context. Beats flat graphics by a wide margin on LinkedIn because the eye reads "real photo" before "ad", and you've already won the half-second of attention before the brain can opt out.

```
[ENVIRONMENT: subway platform / coffee shop window / brick wall / whiteboard / notebook page] photographed in [LIGHTING].

A [POSTER / PAGE / WHITEBOARD MARKER] in the scene shows the headline: "[HEADLINE — under 8 words]"

Style: [documentary photography / editorial / film grain], [shallow / deep] depth of field, [warm / cool / neutral] color grade.
The poster/page/whiteboard text is the focal point and must render exactly as written. Surrounding environment is realistic but slightly out of focus to keep the text readable.

No other text in the scene.
```

### Format 3: Carousel cover (slide 1 only)

Same rules as Format 1, but reserve a small "swipe →" or "1 / 7" indicator in the corner.

```
LinkedIn carousel cover, 1:1 square.

Headline (large, upper two-thirds of frame): "[HEADLINE — under 8 words]"
Subhead (small, below headline): "[SUBHEAD — under 12 words]"
Slide indicator (tiny, bottom-right corner): "1 / [N]"

Typography: [DISPLAY SERIF / CONDENSED SANS] in [COLOR], on [BACKGROUND] background.
Generous margins, strong hierarchy.
Render all text exactly as written.
```

## Worked example: Meta-environmental

```bash
pixeltamer generate -o linkedin.png --size 1024x1024 -p '
A weathered brick wall on a city side-street, photographed at golden hour.
A slightly torn paste-up poster on the wall shows the headline in large
bold condensed sans-serif: "EVERY FOUNDER IS A SYSTEMS ARCHITECT NOW".

Style: documentary photography, 35mm look, light film grain, warm color grade,
shallow depth of field. The poster text is sharp and readable; the surrounding
brick and street recede.

The poster has a small wordmark in the bottom-right corner: "—" (just a dash,
no brand name). No other text anywhere in the scene.
'
```

## Composition tips

- **Headline = under 8 words.** Anything longer can't render cleanly at thumbnail size, and the LinkedIn feed shows your image at thumbnail size first.
- **One headline. No competing text.** Multiple text blocks in a single image = the scroll wins.
- **Quote the exact headline** in the prompt. Always pair with: "render exactly as written".
- **Pick the format BEFORE writing the prompt.** Don't blend formats. A meta-environmental scene with a typographic poster overlay = visually confused.
- **Square (1:1) wins on LinkedIn feed.** Portrait cuts off in the preview; landscape gets letterboxed.
- **High contrast > pretty palette.** LinkedIn is dense; a muted creative loses every time to a black-on-white statement.

## Common failure modes

| Symptom | Fix |
|---|---|
| Headline misspelled or paraphrased | Add: "render exactly as written — do not paraphrase or substitute words" |
| Image too pretty, headline lost | Strip imagery; switch to Format 1 (pure typographic poster) |
| Headline doesn't read at thumbnail | Cut words. Aim for 5–7 max. Bump headline to 60–70% of frame. |
| Environmental scene feels staged | Add: "documentary photography, light film grain, slightly imperfect" |
| Text fights with background | Pin background to a single solid color or strong out-of-focus environment |
