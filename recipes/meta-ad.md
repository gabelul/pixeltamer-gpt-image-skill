# Recipe: Meta Ad Creative

Static ad creative for Facebook / Instagram feed and Reels covers. gpt-image-2 is strong here for two reasons: (1) hook text rendered legibly directly in the image, (2) multi-reference composition lets you fuse a product shot, a lifestyle scene, and a brand mark in one creative.

## When to use

- Single-image ad creative for Meta feed, Stories, or Reels covers
- "Hook overlay" creatives — bold text statement on top of a scene
- Product + lifestyle composition (multi-reference shines here)
- Founder / testimonial framed creatives

## When NOT to use

- Animated or video ads → use video tooling
- Pure product on white (e-comm catalog) → cheaper models do this fine
- Carousel ads → build per-slide and assemble separately

## Defaults

- **Size:** `1024x1024` (feed square), `1024x1536` (Stories / Reels 9:16-ish), `1536x1024` (landscape feed)
- **Quality:** `high`
- **Backend:** API (compose mode for multi-reference; codex works for single-image)

## Single-image prompt skeleton

```
Static social ad creative, [PLATFORM: Facebook feed / Instagram Stories / Reels cover].

Hook (large text overlay, top of frame): "[HOOK COPY — under 12 words]"

Scene: [DESCRIBE THE SCENE — subject, setting, mood, time of day, camera framing].

Subject: [PERSON / PRODUCT — appearance, pose, expression, what they're doing].

Style: [photographic / illustrated / mixed], [lighting style], [color grade].
Brand cues: [LOGO PLACEMENT / WORDMARK / COLOR ACCENTS].

Typography: hook in [SANS / SERIF / DISPLAY] [WEIGHT], color [COLOR], placed [POSITION].
Render the hook text exactly as written — do not paraphrase or invent words.
Leave a clean lower third for a CTA button overlay (do not draw the CTA).
```

## Worked example: SaaS product ad

```bash
pixeltamer generate -o ad.png --size 1024x1024 -p '
Static social ad creative, Instagram feed (1:1 square).

Hook (large text overlay, top half of frame): "STOP WRITING PROMPTS. START SHIPPING WORK."

Scene: Modern over-the-shoulder shot of a founder at a clean desk, late afternoon
golden light from a window on the right. Laptop open showing a software interface
(no specific brand). Coffee cup, notebook, plant in soft focus.

Subject: 30s founder in a charcoal sweater, calm focused expression, hands on keyboard.

Style: photographic, editorial, warm but neutral color grade, shallow depth of field.
Brand cues: small wordmark "ACME" in white, bottom-right corner.

Typography: hook in bold condensed sans-serif (Druk / Inter Display Bold), white with
a thin black outline for legibility, placed in the upper third with generous margin.
Render the hook text exactly as written — do not paraphrase or invent words.
Leave a clean lower third for a CTA button overlay (do not draw the CTA).
'
```

## Worked example: Multi-reference composition (product + lifestyle + brand)

Pass references in a deliberate order — pixeltamer compose blends them via `/images/edits`.

```bash
pixeltamer compose \
  -p "
    Reference 1 is the product hero shot of the meal-replacement bottle.
    Reference 2 is the kitchen counter scene with morning light.
    Reference 3 is the brand wordmark.

    Compose: a Meta feed ad placing the product from reference 1 onto the
    kitchen counter from reference 2. Add the wordmark from reference 3 in
    the bottom-right corner in white. Hook text top-center, bold condensed
    sans, cream color, thin shadow: 'BREAKFAST IN 90 SECONDS'.

    Photographic, morning light, warm color grade, shallow depth of field.
    Render the hook exactly as written. Leave the lower third clean for a
    CTA overlay. Preserve the bottle's exact label and lid from reference 1.
  " \
  -i ./product-hero.png \
  -i ./kitchen-scene.png \
  -i ./wordmark.png \
  --size 1024x1024 \
  -o ./ad-creative.png
```

## Composition tips

- **One hook only.** Two competing texts in one ad = scroll-past.
- **Quote the exact hook copy** in the prompt with "render exactly as written" — otherwise the model paraphrases.
- **Specify hook position** ("upper third", "centered", "bottom") — placement is otherwise random.
- **Reserve the CTA area.** Tell the model to "leave the lower third clean for a CTA button overlay" — you composite the button later.
- **Brand asset as reference image** beats describing the logo in text. Logos are nearly always wrong when described.
- **For lifestyle composition**, pass the lifestyle scene in the early references, the product in middle. The model anchors layout to the first reference.

## Common failure modes

| Symptom | Fix |
|---|---|
| Hook text misspelled / paraphrased | Add: "render the hook text exactly as written — do not paraphrase or invent words" |
| Logo wrong | Pass the logo as a reference image instead of describing it |
| Composition busy | Cap scene to 1–2 props; explicitly state "shallow depth of field" or "minimal background" |
| Two texts competing | Remove the secondary text; reserve space for compositing CTA later |
| Faces look generic | Describe age, expression, clothing, posture concretely; reference image of the founder works best |
