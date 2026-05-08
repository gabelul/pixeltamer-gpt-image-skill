# playbook/character-sheets.md

Multi-view reference sheets, expression sets, sticker packs, pose libraries. The class of work where one character gets rendered as a *system* — many views, many states, locked identity.

Use these prompts when extending a single mascot or character into a brand asset family. Each prompt assumes you have a hero pose locked first; these add breadth.

For the methodology behind picking a character archetype + locking a canon, see `recipes/mascot.md`. This file is for *after* you have a canon and need to scale it.

## Per-prompt format

Every entry below has: a one-line title, a `Source:` line, a "Why this works" note, a "Swap X for Y" note, then the prompt in a code block.

Discipline: every prompt is subject-first, English, no magic words, in flowing prose or Codex labeled-prose where it fits.

---

### 1. Three-view character reference sheet (front / side / back)

**Source:** freestylefly cases.json case 5 (adapted from Japanese; structural pattern preserved)
**Why this works:** Three-view turnaround is the canonical character-bible artifact. Forces the model to commit to a coherent silhouette across angles, which surfaces design problems early. Adding the expression strip + palette callout in the same image gives a one-glance asset for licensing or downstream sticker work.
**Swap X for Y:** Replace the `[CHARACTER NAME]` and identity-anchor sentence with your own canon character description; keep the layout structure.

```
A clean character reference sheet for [CHARACTER NAME], laid out on a single landscape canvas with white background. Three orthographic views of the same character side by side: front view (centered, full body), side profile (right of front), back view (right of side). All three views at the same scale, baseline-aligned, with a 1-grid spacing between figures.

Below the three views: a horizontal strip of six head-only expression variations (idle / happy / surprised / focused / sleepy / determined), each labeled in small caps beneath.

Right side of canvas: a vertical color palette callout — five swatches stacked, each with hex value and surface label (skin / outfit primary / outfit secondary / accent / linework).

Bottom right: a 2-line "World" caption block describing the character's setting in one short paragraph.

Style: flat editorial illustration, clean line work, restrained shading. Identity must remain consistent across all three views — same hairstyle, same outfit details, same proportions, same palette. Do not redesign the character between panels.

White background. No decorative borders. No additional poses. No text other than the labels listed above.
```

---

### 2. Expression set — 6-panel grid

**Source:** freestylefly cases.json case 372 (kawaii expression sheet pattern adapted to neutral aesthetic)
**Why this works:** A locked-pose expression sheet is the cheapest way to extend a mascot into onboarding/empty/error states. Six expressions cover the most-used emotional registers without overproducing. Constraining all panels to the *same* head crop makes them stamp-friendly for downstream comp work.
**Swap X for Y:** Replace `[CHARACTER NAME]` with your canon character; adjust the six emotion labels to your product's actual UX states (`celebrating streak` instead of `excited`, etc.).

```
A 2×3 grid of head-and-shoulders expression variations of the same character: [CHARACTER NAME].

Panel labels (left-to-right, top-to-bottom):
1. "neutral" — calm, eyes open, soft mouth
2. "happy" — closed-eye smile, slight head tilt
3. "surprised" — eyes wide, eyebrows up, small open mouth
4. "thinking" — eyes looking up-left, one hand near chin
5. "sleepy" — eyes closed, slight slump
6. "determined" — eyes focused, mouth set firm

All panels share identical: head crop, framing, lighting direction (soft top-left), color palette, line weight, and background tone. Only the facial expression and minimal accompanying gesture changes between panels.

Layout: clean white background, each panel separated by a 12px gutter, label in small sans-serif caps beneath each panel.

Style: flat editorial illustration, soft form language, restrained shading. Identity locked across all six panels — do not redesign the character between cells.

No additional decoration, no border frames, no extra props.
```

---

### 3. Sticker pack — 16-panel emote sheet

**Source:** Original — pixeltamer v1 (extends case 372's expression-set pattern to sticker-pack density)
**Why this works:** Sticker packs need denser emotional range than a 6-grid and are usually exported as individual PNGs, so the layout doubles as a per-tile spec. 16 panels is the iMessage / Telegram pack default. Using small-caps emoji-state labels keeps export downstream zero-guesswork.
**Swap X for Y:** Replace `[CHARACTER NAME]` and the 16 state labels with your product's reaction set — e.g., `celebrating streak`, `gentle nudge`, `out of office`.

```
A 4×4 grid sticker pack of the same character: [CHARACTER NAME]. Sixteen distinct micro-poses, each rendered as an isolated full-body sticker on transparent background, cleanly croppable for export.

Panel state labels (left-to-right, top-to-bottom):
1. wave hello · 2. thumbs up · 3. celebrating · 4. clapping
5. thinking · 6. sleepy yawn · 7. confused · 8. eureka idea
9. heart hands · 10. peace sign · 11. thumbs down · 12. side eye
13. crying laughing · 14. surprised gasp · 15. determined fist · 16. blowing kiss

All 16 stickers share identical: character design, proportions, palette, line weight, rendering style. Only pose, expression, and accompanying micro-prop change between panels.

Layout: 4×4 grid on transparent background, 16px gutter between panels, no frames. Each panel ~256×256 with the character occupying ~70% of the frame.

Style: flat sticker illustration with crisp edges, slightly thicker outline so each sticker reads at small size when extracted. Restrained shading. Identity locked across all 16 panels.

No backgrounds in panels, no decorative elements between stickers, no text other than the small state label below each cell.
```

---

### 4. Two-character interaction reference

**Source:** Original — pixeltamer v1 (covers the "duo" gap not in source corpora)
**Why this works:** When a brand has a primary mascot plus a recurring secondary character (companion, foil, customer surrogate), the two need to be drawn *together* with locked relative scale and consistent style. A side-by-side interaction reference establishes the size relationship and proxemics before downstream scenes.
**Swap X for Y:** Replace the two `[CHARACTER]` placeholders with your primary + secondary; adjust the four interaction states to your brand's narrative beats.

```
A character-pair interaction reference sheet for [CHARACTER A] and [CHARACTER B], on a single landscape canvas with white background.

Top row (full bodies, side by side, baseline-aligned): both characters standing in neutral pose, facing the viewer at three-quarter angle, with [CHARACTER A] on the left and [CHARACTER B] on the right. Visible relative scale and proportions clearly readable.

Middle section: four interaction vignettes, each labeled, showing the pair in different states:
1. "greeting" — A and B facing each other, one arm raised in wave
2. "collaborating" — A and B side-by-side looking at a shared prop
3. "supporting" — A standing slightly behind B with hand on shoulder
4. "celebrating" — both arms up, energy synced

Bottom: a short caption strip describing each character's role in one phrase ("A is the X; B is the Y").

Style: flat editorial illustration, restrained shading, identity locked across both characters and all five panels. Both characters share the same line weight, palette family, and rendering quality — neither dominates visually.

White background, no decorative elements, no environmental scenery.
```

---

### 5. Pose library — 8-pose action pack

**Source:** Original — pixeltamer v1
**Why this works:** Static front-pose mascots feel dead; an animation-friendly pose library covers the most-used motion states for Lottie/Rive without re-prompting per state. Keeping all eight poses on one canvas with locked identity is faster than eight individual prompts and surfaces consistency drift immediately.
**Swap X for Y:** Replace `[CHARACTER NAME]`; adjust the eight pose labels to your usage (e.g., `dragging file`, `processing`, `delivered`).

```
A pose library reference sheet for [CHARACTER NAME], laid out as a 4×2 grid on white background.

Eight full-body poses, each labeled:
1. "idle" — neutral standing, weight even, arms at sides
2. "walking" — mid-stride, arms swinging naturally
3. "running" — forward lean, arms bent, motion lines minimal
4. "jumping" — feet off ground, arms slightly raised
5. "waving" — one arm fully raised in greeting
6. "carrying" — both arms holding an unspecified prop in front
7. "presenting" — one arm extended in showcase gesture
8. "resting" — seated cross-legged, hands in lap

All eight poses share identical: character design, proportions, palette, line weight, rendering style, lighting direction (soft top-left). Only pose changes between panels.

Layout: 4×2 grid, 16px gutter between panels, label in small sans-serif caps beneath each pose. Each panel sized so the full body fits with ~15% headroom and footroom.

Style: flat editorial illustration, animation-friendly silhouettes (clear outline reads at small size), restrained two-tone shading per surface. Identity locked across all eight panels — do not redesign the character between cells.

White background, no environmental detail, no decorative elements.
```

---

### 6. Costume / outfit variant grid

**Source:** EvoLink cases/character.md case 1 (style-locked variant pattern adapted)
**Why this works:** Same character + multiple outfits is the cheapest way to extend a mascot for seasonal campaigns or product variants without redesigning. Keeping the character's silhouette/proportions/face fixed across costumes ensures recognizability; only the outfit changes.
**Swap X for Y:** Replace `[CHARACTER NAME]` and the four costume descriptors with your campaign's themes (e.g., `summer launch`, `holiday`, `back-to-school`, `night mode`).

```
A 2×2 outfit variant grid for [CHARACTER NAME] on white background. Same character, four different outfits.

Panel labels (top-left, top-right, bottom-left, bottom-right):
1. "default" — the canonical outfit established for this character
2. "[VARIANT 1 — short label]" — e.g., "winter coat"
3. "[VARIANT 2 — short label]" — e.g., "casual weekend"
4. "[VARIANT 3 — short label]" — e.g., "formal event"

In every panel, the character is rendered in identical pose (front-facing three-quarter, full body, neutral expression), with identical face, hair, proportions, and accessories that count as character identity (eyewear, signature item). Only the clothing/outfit changes.

Style: flat editorial illustration, soft form language, restrained shading, locked palette family with outfit-specific accent shifts. Each panel ~512×512, separated by a 12px gutter.

White background, no decorative elements, no scene context. Label each panel in small sans-serif caps beneath.

Critical: identity must remain unchanged across all four panels — the character should be instantly recognizable as the same entity in different clothes, not four similar-but-different characters.
```

---

### 7. Mascot anthropomorphism style sheet (object-character explorations)

**Source:** Original — pixeltamer v1
**Why this works:** When the mascot concept is an anthropomorphized object (binder, coffee cup, paper crane, app icon), a single image showing the same object across four levels of anthropomorphism — from pure object to full character — helps lock the design's degree of personification before committing to a canon. This is a discovery-phase artifact, not a production one.
**Swap X for Y:** Replace `[OBJECT]` with your product object; the four levels apply universally.

```
A 1×4 horizontal exploration sheet for an anthropomorphized [OBJECT] character. Four progressive levels of personification, all of the same [OBJECT], on white background.

Panel 1 — "object" — pure inert object, no face, no limbs, neutral lighting. Establishes the base shape.
Panel 2 — "minimal" — same object with two simple dot eyes and a small smile added; no limbs, no posture change.
Panel 3 — "moderate" — same object with eyes, smile, two stub arms, simple legs, gentle posture. Recognizable as a mascot.
Panel 4 — "full" — same object highly anthropomorphized: expressive face, articulated limbs, dynamic posture, accessory or prop. Reads as a designed character.

All four panels share the same [OBJECT] shape, scale, palette, lighting direction, and rendering style. Only the level of personification changes.

Layout: horizontal row, 16px gutter between panels, each panel ~512×512. Label each level in small sans-serif caps beneath ("object" / "minimal" / "moderate" / "full").

Style: flat editorial illustration, restrained shading. White background, no decorative elements, no scene context.

This is a design exploration sheet — useful for picking the right level of anthropomorphism before committing to a canon mascot.
```

---

### 8. Profile + three-quarter view pair

**Source:** Original — pixeltamer v1
**Why this works:** When you only need silhouette + face quality (not a full multi-view), a two-panel pair (true profile + 3/4 view of the same character) is the minimum-viable identity anchor. Cheaper than a three-view turnaround, sufficient for most app icon + onboarding work.
**Swap X for Y:** Replace `[CHARACTER NAME]` and the framing notes; the structural pair pattern is universal.

```
A two-panel character identity pair for [CHARACTER NAME] on white background, side by side.

Panel A (left) — true side profile, full body or head-and-shoulders, baseline-aligned with Panel B. Establishes silhouette.
Panel B (right) — three-quarter view facing camera, same scale and crop as Panel A. Establishes face quality and gaze.

Both panels share identical: character design, proportions, palette, line weight, rendering style, lighting direction (soft top-left). Only camera angle changes.

Layout: horizontal pair, 24px gutter, no labels. Each panel ~768×768.

Style: flat editorial illustration, soft form language, restrained shading, clean readable silhouette. Identity locked across both panels — same hairstyle, same outfit details, same proportions, same accessories.

White background, no decorative elements, no scene context, no text.
```

---

### 9. Sleeping / off-state mascot variant

**Source:** Original — pixeltamer v1 (covers the empty-state / off-hours UX gap)
**Why this works:** Apps need a "sleeping" or "off-duty" mascot variant for empty states, paused subscriptions, or out-of-office screens. Drawn from the canon character so it doesn't break recognizability. Keeping the variant compact (single panel, not a sheet) makes it droppable into UI.
**Swap X for Y:** Replace `[CHARACTER NAME]`; the sleeping pose details work for most humanoid or anthropomorphized mascots.

```
A single-panel "sleeping" or "off-state" variant of [CHARACTER NAME], on transparent background.

Pose: character lying or seated in a relaxed sleep pose — head tilted, eyes closed, gentle smile, one small "Z" or breathing line drawn nearby (no other text). Body language clearly reads as restful, not unconscious or sad.

Identity locked: same character design, palette, proportions, line weight, and accessories as the canon hero pose. The only changes are the pose and the closed-eyes state.

Style: flat editorial illustration, soft form language, restrained two-tone shading. Composition centered with generous padding. Transparent background, no decorative scene, no bed/pillow props unless explicitly part of the character's accessory set.

This variant should be instantly recognizable as the same mascot, just at rest.
```

---

### 10. Holiday / seasonal accent pack

**Source:** Original — pixeltamer v1 (covers seasonal-marketing UX gap)
**Why this works:** Brands need light seasonal variants without redesigning the mascot. A 4-panel seasonal pack with the same character + minimal seasonal accent (hat, prop, color shift) is the cheapest way to ship year-round marketing variants from one canon.
**Swap X for Y:** Replace `[CHARACTER NAME]` and the four season labels with your campaign calendar (e.g., `Q1 launch`, `summer event`, `back-to-school`, `holiday`).

```
A 2×2 seasonal accent pack for [CHARACTER NAME] on white background. Same character, four seasonal variants — minimal modifications only.

Panel labels:
1. "spring" — character holds or wears a single small spring accent (e.g., a sprig of leaves, a soft pastel ribbon)
2. "summer" — single summer accent (e.g., small sunglasses, an ice-cream cone, a beach hat)
3. "autumn" — single autumn accent (e.g., a small scarf, a leaf clipped to the body)
4. "winter" — single winter accent (e.g., a knit beanie, a tiny wrapped gift)

All four panels share identical: character design, pose, proportions, base palette, line weight, rendering style. Only the single seasonal accent and a faint background tint shift differs between panels.

Layout: 2×2 grid, 16px gutter, label in small sans-serif caps beneath each panel. Each panel ~512×512.

Style: flat editorial illustration, restrained two-tone shading. Identity locked across all four panels — the seasonal accent is a small additive, not a redesign.

White background, no environmental scenes, no decorative borders.
```
