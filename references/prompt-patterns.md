# prompt-patterns.md — advanced construction patterns

This file is the upgrade path beyond `prompting.md`. Load it when the request fits any of:

- Building the prompt **programmatically** (Claude composing slot-by-slot rather than free prose)
- A **complex** image with many independent subsystems (subject + style + content + constraints + copy)
- A request in one of the **doctrine categories**: UI screen, infographic, brand identity, e-commerce hero, architectural render, scientific atlas, conceptual typography poster
- The need for **brand consistency across many images** (one identity, many products / many touchpoints)

Otherwise stick to the prose template in `prompting.md` — these patterns are heavier than they need to be for a one-off.

---

## 1. JSON-config schema

The strongest category-specific gallery prompts are not prose, they're **schemas**. The JSON shape forces you to put material, lighting, palette, copy, layout, and constraints in distinct slots instead of blobbing them into one paragraph.

What this actually buys you (claims I can defend):

- **Structural completeness on the input side.** A schema with empty slots makes missing detail visible (`"copywriting": {}` → "wait, I haven't decided the badges yet"). Prose lets you skip the same detail without noticing.
- **Agent composability.** Slot-by-slot filling is more reliable than free prose for Claude composing prompts programmatically. Each value is independently swappable across runs.
- **Scales to large prompts.** When a prompt has 6+ subsystems (subject, setting, copy, layout, palette, typography, constraints), JSON keeps the structure visible at a glance; long prose blurs it.

What this does NOT guarantee:

- "Same content, JSON form > same content, prose form" — when prose is **already** well-structured (labeled sections, exact quoted strings, hex colors), the JSON form usually produces equivalent output. The schema's win is forcing structure, not magically improving the model's output. Use prose if the prose stays disciplined.
- Anything on the **codex backend**. Codex's image_gen reasoning loop appears to normalize / summarize prompts before calling gpt-image-2 internally — two structurally different prompts with the same content can collapse to the same underlying call (we verified this with byte-identical PNGs from a controlled A/B). The schema's structural value still applies for *us* (humans + agents writing the prompt), but the codex layer obscures any model-side delta. Patterns in this file matter most on the API backend.

### Canonical 5-slot shape

```json
{
  "type": "<canonical category name>",
  "<subject_root>": {
    "...": "what the image actually shows — product, brand, character, screen, scene"
  },
  "style": {
    "...": "visual choices — theme, palette, typography, materials, lighting"
  },
  "<variant_zone>": {
    "...": "category-specific — content rows, layout grid, deliverables, copy blocks"
  },
  "constraints": "<negative + quality clause as a single sentence or short list>"
}
```

The `<subject_root>` and `<variant_zone>` keys are domain-specific. Use these conventions:

| Category | subject_root key | variant_zone key |
|---|---|---|
| UI Screenshot | `product` | `content` (header, cards, rows, data) |
| E-commerce Hero | `product` | `setting` + `copywriting` |
| Brand Identity | `brand` | `deliverables` (logo, palette, mockups) |
| Infographic | `topic` + `audience` | `structure` (modules, layout) |
| Architectural Render | `space` | `environment` + `camera` |
| Movie Poster | `theme` + `typography` | `visuals` |

### Worked example — UI screenshot

```json
{
  "type": "UI Screenshot",
  "platform": "iOS",
  "product": "Fitness App",
  "layout": "Card-based feed with bottom tab bar",
  "style": {
    "theme": "Dark Mode",
    "primary_color": "Neon Green",
    "typography": "Clean sans-serif"
  },
  "content": {
    "header": "Today's Activity",
    "cards": [
      { "title": "Running", "data": "5.2 km", "button": "Start" },
      { "title": "Calories", "data": "340 kcal" }
    ]
  },
  "constraints": "High-fidelity, readable text, all copy must render exactly as written, 9:16 aspect ratio"
}
```

### Worked example — e-commerce hero

```json
{
  "type": "E-commerce Hero Image",
  "product": {
    "name": "Noise Cancelling Headphones",
    "material": "Matte black finish with metallic accents",
    "angle": "3/4 profile, floating slightly above the surface"
  },
  "setting": {
    "background": "Minimalist studio, soft gray gradient",
    "lighting": "Softbox overhead, sharp rim light along the edges"
  },
  "copywriting": {
    "badges": ["NEW", "$299"],
    "slogan": "Silence the World"
  },
  "constraints": "Commercial photography quality, hyper-realistic textures, no fake brand logos"
}
```

### Rules of the shape

- Keys describe **visual subsystems**, not implementation internals (`materials`, not `mesh_data`).
- Values are **concrete visual constraints**, not vague praise (`"matte black finish with metallic accents"`, not `"premium"`).
- **Arrays** for visible lists (badges, cards, deliverables); **nested objects** for materials, lighting, output goals.
- A short header comment with `VERSION:` or `AESTHETIC:` is fine — it makes the prompt feel like a deliberate spec and helps later A/B comparisons. The JSON does not have to be machine-valid; readability beats parsability.
- **Always include**: `aspect_ratio` (or implicit via type), output mood / `constraints`.

---

## 2. Role-based opener

Establishes the model's specialty bracket before the brief. Conditions output toward a more specialized "reference folder" the model has internally.

### The 3-component formula

```
([Specialty Name in English]) you are a [seniority qualifier] [specific role],
specialized in [the exact artifact type this prompt produces].
```

Three things to include:

1. **Specialty name** — short tag in English-friendly title case, also for human readability of the prompt.
2. **Seniority / quality qualifier** — "top-tier", "20-year-veteran", "high-end editorial", "premium". This implies portfolio quality.
3. **Artifact specificity** — not "a designer", but "a designer specialized in steampunk anatomy posters" / "a Chinese gongbi figure painter for long-scroll character lineups". The narrower, the better.

### Worked examples

```text
(Steampunk Scientific Illustrator) You are a specialist in retro steampunk
anatomical atlas posters, focused on mechanical breakdowns of mythological subjects.
```

```text
(Chinese Long-Scroll Illustrator) You are a top-tier traditional gongbi figure
painter specialized in turning classic character ensembles into encyclopedic
horizontal-scroll posters.
```

```text
(Premium Editorial Logo Designer) You are a logo designer with 20 years of
experience designing instantly-recognizable, deeply meaningful marks for
globally known brands.
```

```text
(Apple-Keynote Science Poster System) You are a high-end natural-science poster
generation system. Goal: produce Apple-keynote-style premium scientific posters
for rare animals, insects, reptiles, mammals, and other niche species.
```

### When to use it

- The output category is narrow enough that a generalist model produces generic results (anatomical atlases, ink wash posters, archival document mockups, vintage sci-fi pulp covers).
- The brand quality bar is high (any brand identity, any commercial campaign).
- You're combining multiple disciplines into one image (`"beauty consultant + face analysis system + brand visual designer"` for personalized lipstick recommendation reports).

### When to skip it

- Quick one-offs where prose is faster.
- Already over-specified prompts — adding a role on top can fight with the existing detail.
- Photographic realism requests — capture-context language ("RAW iPhone photo, 28mm, golden hour") works better than role.

---

## 3. Specific-negative blocks

Pixeltamer's `prompting.md` says "use negatives." This file says **how to write the actual list**.

### The rule: name the failure mode, not the adjective

| Don't write | Write |
|---|---|
| "no busy background" | "no decorative side panels, no rounded-corner cards, no thick borders, no large background graphics" |
| "no cheap look" | "no glossy 3D lettering, no random icons, no stock-photo realism, no excessive grunge" |
| "no AI artifacts" | "no extra fingers, no warped anatomy, no hands with the wrong joint count, no melted text" |

The strong gallery prompts use **8–15 named failure modes** per image, every one targeting an actual bad-default behavior the author observed. Generic "avoid X-style" doesn't constrain the model; named visual failures do.

### Worked block — Apple-keynote nature science poster (translated to English)

```text
Constraints — do NOT include:
- pale-yellow aged-paper backgrounds
- complex infographic grids
- rounded-corner cards
- thick borders or framed boxes
- large decorative graphics or background flourishes
- unrelated logos
- unnecessary small text
- the subject rendered too small
- text overlapping or crowding the subject
- overcrowded bottom info section
- children's-textbook style, cartoon style, or low-end exhibition-board style
```

### Worked block — graffiti / sketch style

```text
Constraints — do NOT include:
- transparent watercolor smudging or blooming effects
- delicate watercolor transitions
- visible paper textures
- soft atomization or airbrush diffusion
- dreamy / dreamlike textures
- complex realistic backgrounds
- excessive detail or over-elaboration
```

### Worked block — premium typography poster

```text
Constraints — do NOT include:
- generic word art
- glossy 3D lettering
- random icons
- stock-photo realism
- cluttered collage
- excessive grunge
- tourist clichés
- official logos or copied campaign aesthetics
- unrelated text
- misspelled typography
- moodboard, presentation board, mockup, sample sheet, or process layout
```

### Worked block — brand touchpoint system

```text
Constraints — do NOT include:
- a single isolated logo (must show the full system)
- chaotic collage of all touchpoints crammed together
- random gibberish text on packaging or labels
- packaging, menu, and stickers that feel stylistically disconnected
- watermarks or fake sponsor strips
```

Build your own negative block by watching what gpt-image-2 *adds* unprompted in your category and then writing one negative line per repeated offender.

---

## 4. Phase-based structure

Useful when one identity (brand / character / world) needs to span many images. Splits the prompt into discrete reusable steps so you can swap one phase without rewriting the others.

```text
PHASE 1 / ANCHOR
Two lines describing the brand or character identity — palette, materials,
lighting, mood. This is the constant.

PHASE 2 / INJECT
Place the specific subject (this product / this scene) into the world from
PHASE 1. The subject obeys the brand language, not the other way around.

PHASE 3 / FORMAT
Specify the output format: hero image, square ad, vertical story, e-commerce
header, OG card. Pick one.

PHASE 4 / SIGNATURE
Add the recurring brand element — film grain, paper texture, packaging
symbol, signature corner mark.
```

Variables: `[brand_identity]` / `[product]` / `[output_format]` / `[brand_element]`

Goal: when you swap `[product]` across many runs, the rest of the world stays visually identical.

For pixeltamer specifically: this is the prose-side equivalent of attaching the same `-i mascot.png` to every codex generation. Use phase-based structure on the API path where the codex `-i` flag isn't available.

---

## 5. Auto-deduce closure

Tells the model to fill in missing details from the theme rather than demanding every detail upfront.

```text
Colors automatically adapt to the [theme/subject], but the overall expression
remains [unified style anchor — graffiti-sketch / Apple-keynote / editorial poster].

The image content does not need to be written in advance; the [subject]
will automatically deduce the most suitable main image, actions, related
elements, symbols, or simplified scenes.
```

Use it at the END of long descriptive prompts when:

- You only know the theme, not every prop and pose.
- You want creative variation across runs (variant exploration with the same scaffolding).
- The style is well-defined elsewhere in the prompt and the subject is the only variable.

Don't use it when you've quoted exact text or specified an exact composition — it can override your specifics.

---

## 6. Signature integration

Brand mark *as part of the image*, not pasted on top after.

```text
Naturally add the signature "[brand_name]" as part of the image — placed
discreetly but clearly in the lower-left corner, lower-right corner, or
near the title. The signature must look like an artist's signature or
design sign-off, not a watermark. Font: refined, restrained, high-end,
small enough not to dominate, never destructive to the main composition,
never abrupt or cheap.
```

Why integrate instead of overlay:

- A mark generated WITH the image picks up the same lighting, paper texture, color grade — feels native.
- Survives crops better than an overlay you add post-hoc.
- Codex / API generations can't be edited cheaply; bake it once, reuse.

When NOT to integrate:

- The signature has to be pixel-perfect (legal text, version codes, exact wordmark) — overlay via SVG or HTML is sharper than any AI render.
- You need to A/B several signatures on the same backdrop — overlay is faster.

---

## How these compose

The strongest gallery prompts stack 3–4 of these patterns at once. Typical heavy-use combination:

```text
1. Role-based opener
2. JSON-config schema (or phase-based prose if it's an identity-heavy series)
3. Exact typography blocks (from prompting.md habit #2)
4. Specific-negative block at the end (8–15 named failure modes)
5. Auto-deduce closure (only if the theme is the only variable)
6. Signature integration (only if the image is part of a branded series)
```

For a one-off generate request, none of these are required. For a UI mockup, infographic, brand showcase board, or any commercial-quality deliverable, expect to use at least three.
