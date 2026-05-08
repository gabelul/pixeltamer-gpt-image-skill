# playbook/typography-posters.md

Type-led posters where the typography IS the design — dense copy layouts, oversized hero letters, brand-typography systems. Different from `recipes/editorial-cover.md` which covers magazine/podcast/book covers (image + masthead + headline). This file is for posters where the type does most of the visual work.

**Discipline note**: every text string must be quoted exactly in the prompt. gpt-image-2 spells what you literally quote and tends to invent or paraphrase what you describe in prose. Wrap every displayed string in `"…"`. For dense layouts, list every separate text block (title, subtitle, dek, fine print, page numbers).

For the methodology behind editorial covers (image-led with type overlay), see `recipes/editorial-cover.md`. This file is for the inverse: type-led with minimal/no image.

## Per-prompt format

Every entry below has: a one-line title, a `Source:` line, a "Why this works" note, a "Swap X for Y" note, then the prompt in a code block. Discipline: subject-first, English, no magic words.

---

### 1. Single-word giant-letter poster

**Source:** Original — pixeltamer v1 (extracts the "one word, full bleed" pattern from typographic minimalism — the cleanest demo of gpt-image-2's text rendering)
**Why this works:** When the entire poster is one word, the model has no competing image-content to manage and produces crisp, custom-feeling letterforms. Pairing the giant word with one small subline + one corner stamp is enough to feel like a real poster, not a placeholder.
**Swap X for Y:** Replace `"FOCUS"` with your one word and adjust the subline to the campaign tagline.

```
A 2:3 portrait poster, full-bleed cream background (#f5e6d3), with a single hero word filling 80% of the canvas:

Hero word (centered, MASSIVE, 60% of canvas height): "FOCUS"
in a tall condensed sans-serif, deep ink (#1c1917), all caps, slightly compressed letter-spacing, sharp clean edges.

Subline (small, beneath the hero word, centered): "a magazine about doing one thing well"
in a thin sans-serif, soft warm gray (#787068), all lowercase, generous letter-spacing.

Corner stamp (top-right, very small, monospaced caps): "ISSUE 04 — APRIL 2026"
in deep ink, with a 1px underline rule.

Background: flat cream, fine paper-grain texture, no gradients, no decorative elements.

Render all text exactly as quoted. Do not invent additional text, page numbers, barcodes, or "subscribe today" sashes. No image content, no illustration, no photograph — pure typography.
```

---

### 2. Three-line stacked headline poster

**Source:** freestylefly cases.json case 33 (adapted to English; structural pattern preserved)
**Why this works:** Three-line headlines stacked tightly with progressively shrinking weights is the canonical Pentagram/Sagmeister poster move. Each line carries a distinct beat — claim, qualifier, CTA — and the type weight hierarchy makes the read order obvious. Constraining the rest of the poster to a single corner stamp keeps the type as the hero.
**Swap X for Y:** Replace the three quoted lines with your campaign's headline / qualifier / CTA. Keep the relative weights.

```
A 3:4 portrait poster, off-white background (#fafaf8), built around a three-line stacked headline as the dominant visual.

Headline block (centered horizontally, vertically positioned in the upper third):
- Line 1 (LARGE, 80pt-equivalent, heavy condensed serif, deep navy #1a2b4c): "EVERY MEAL"
- Line 2 (MEDIUM, 60pt-equivalent, medium-weight serif, deep navy): "TELLS A STORY"
- Line 3 (SMALL, 32pt-equivalent, light italic serif, warm rust accent #b8462b): "tell yours, table by table"

All three lines left-aligned to the same baseline grid, tight 1.0 line-height between them.

Bottom-left corner stamp (small caps, monospaced, deep navy): "QUARTERLY · ISSUE NO 12"

Bottom-right (vertical orientation, very small): website URL placeholder — "[YOUR.URL.HERE]"

Background: flat off-white, no texture beyond fine paper grain. Do not add image content, illustration, decorative borders, or color blocks.

Render all text exactly as quoted. No additional text strings.
```

---

### 3. Asymmetric block-text editorial poster

**Source:** freestylefly cases.json case 35 (asymmetric type-block layout pattern, English-adapted)
**Why this works:** Asymmetric placement (heavy left text block, generous negative space on the right) feels intentional and modernist, vs. centered-everything which reads as default. The negative space frames the type as a deliberate choice rather than a fallback.
**Swap X for Y:** Replace the body paragraph with your editorial copy and the masthead with your brand name.

```
A 3:4 portrait poster, cream background (#f5efe1), with an asymmetric type layout — heavy text block hugging the left edge, generous negative space on the right two-thirds.

Top-left masthead (small caps, monospaced, charcoal #2a2722): "FIELD NOTES"

Below masthead, left-aligned block (~40% canvas width):
- Hero headline (40pt sans-serif bold, charcoal): "WE BUILD WHAT WE NEED"
- Below headline, body paragraph (12pt serif, charcoal, 4 lines): "After the third winter without a working tool, you stop ordering and start fabricating. The shed becomes a workshop. The workshop becomes a habit. The habit becomes a quiet practice that outlasts the season's needs."
- Below paragraph, byline (10pt italic serif, warm gray): "by Marcus Hale — March 2026"

Right side: completely blank cream, no elements, no decoration. The negative space is the design.

Bottom-left footer (small monospaced caps, charcoal): "NO. 04 / SPRING / FIELD NOTES"

Background: flat cream with subtle warm paper grain. No image, no illustration, no decorative borders, no rules separating sections.

Render all text exactly as quoted. No additional text.
```

---

### 4. Brutalist-grid index poster

**Source:** freestylefly cases.json case 37 (dense-list grid pattern)
**Why this works:** Lists of items — chapter indices, programmes, menus — render beautifully in gpt-image-2 when given clear grid coordinates and exact strings. Brutalist styling (heavy rules, monospaced, no decoration) makes the density feel intentional rather than overwhelming.
**Swap X for Y:** Replace the 12 entries with your real list (programme items, menu, chapter list). Keep the format consistent across rows.

```
A 3:4 portrait poster, white background, designed as a brutalist programme index. All type, no images.

Top: a single horizontal black rule (4px, full bleed).

Beneath rule (centered, 28pt monospaced bold caps, black): "PROGRAMME / SUMMER 2026"

Below masthead: a tightly-packed 12-row index, each row left-aligned, with three columns separated by tab stops:

- Column 1 (10pt monospaced bold, black): item number, two digits ("01" through "12")
- Column 2 (12pt monospaced regular, black): item title (e.g., "Field Recording Workshop")
- Column 3 (10pt monospaced regular, warm gray): date in compact format (e.g., "06.12")

Twelve rows, each separated by a 1px horizontal rule:
01 / Field Recording Workshop / 06.12
02 / Letterpress Demo / 06.19
03 / Print Studio Open House / 06.26
04 / Bookbinding Intensive / 07.03
05 / Risograph Saturday / 07.10
06 / Type Specimen Talk / 07.17
07 / Editorial Photography / 07.24
08 / Grid Systems Lecture / 07.31
09 / Color Theory Studio / 08.07
10 / Independent Press Fair / 08.14
11 / Letter Carving Demo / 08.21
12 / End-of-Summer Showcase / 08.28

Bottom: another horizontal black rule (4px, full bleed).

Below bottom rule (small caps, monospaced, centered, black): "ALL EVENTS FREE · DROP-IN · NO REGISTRATION"

White background, no image, no illustration, no decorative elements beyond the two horizontal rules and the per-row separators.

Render all text exactly as written. No additional text.
```

---

### 5. Bilingual stacked-script poster (CN/EN)

**Source:** freestylefly cases.json case 39 (Chinese-English bilingual layout — kept here because the subject IS the script pairing, per the playbook README's English-enforcement carve-out)
**Why this works:** When a poster's subject is a bilingual translation pairing — common for tea brands, restaurants, event posters with international audiences — the model handles the dual-script layout well if you quote both strings exactly and assign them clear vertical zones. The Chinese characters render correctly in gpt-image-2 when explicitly quoted.
**Swap X for Y:** Replace the Chinese phrase, English translation, and product line as needed; keep the vertical-stack structure.

```
A 2:3 portrait poster for a tea brand, warm off-white background, vertical type composition pairing Chinese characters with English translation.

Top half (large, centered, vertical orientation reading top-to-bottom): the Chinese phrase "山川茶事"
in tall serif characters, deep forest green (#2a4a3a), each character ~120pt-equivalent, generous spacing between characters.

Below the Chinese (centered, smaller, horizontal): English translation "Mountain & River Tea Affairs"
in 24pt italic serif, deep forest green, small caps for emphasis on "Tea Affairs".

Middle band (centered, monospaced caps, charcoal): "COLD-STEEP COLLECTION / 冷泡系列"

Bottom-left corner (small, monospaced caps, charcoal): "MEDIUM 16¥ · 中杯"
Bottom-right corner (small, monospaced caps, charcoal): "LARGE 19¥ · 大杯"

Background: flat warm off-white (#faf6ec), fine warm paper grain. No image, no illustration, no decorative seal stamps unless a single small seal is quoted explicitly.

Render all text exactly as written, both Chinese and English. No additional characters anywhere except the quoted strings. Crisp, legible, large enough to read. No garbled or invented characters.
```

---

### 6. All-type CTA conversion poster

**Source:** freestylefly cases.json case 41 (dense-CTA poster structure adapted)
**Why this works:** A poster optimized for conversion (early-bird signup, late registration, SKU pricing) lives or dies by hierarchy. Heavy hero CTA + medium qualifier + small fine-print is the canonical bottom-of-funnel layout. No image needed; the type carries it.
**Swap X for Y:** Replace the CTA, the offer, and the deadline. Keep the three-tier hierarchy.

```
A 3:4 portrait poster on a deep saturated background — single accent color, no image.

Background: full bleed solid amber (#d18626), fine subtle paper grain.

Hero CTA (centered, dominant, ~50% canvas height, all caps, condensed sans-serif bold, cream #f5e6d3): "JOIN EARLY"

Below hero (centered, medium, condensed sans-serif regular, cream): "save 30% · ends april 30"

Below the offer (centered, small monospaced caps, slightly transparent cream): "USE CODE — EARLY30 — AT CHECKOUT"

Bottom-left fine print (very small, monospaced regular, cream): "Subject to terms · See site for details · 2026"

Bottom-right corner stamp (very small, sans-serif caps, cream with thin rule above): "VOL 02 · ISSUE 14"

No image. No illustration. No decorative shapes beyond the type and one optional thin horizontal rule beneath the hero CTA.

Render all text exactly as written. No additional text or invented sub-copy.
```

---

### 7. Quote-led editorial poster

**Source:** freestylefly cases.json case 43 (long-quote display layout adapted)
**Why this works:** Pull-quote posters (long quote + small attribution + corner stamp) work because the quote is doing emotional work and the typography is doing structural work. Setting the quote in italic serif at large size makes it read as "this is the point," and the small attribution beneath reads as "this is who said it."
**Swap X for Y:** Replace the quote, attribution name + role, and the corner stamp.

```
A 2:3 portrait poster, soft cream background (#f5efe1), built around a single long pull-quote as the entire visual.

Quote (centered, ~70% canvas height, large italic serif, deep ink #1c1917, multi-line break exactly as below):
"Good design is mostly noticing what's already there
and refusing to add what isn't needed."

Set in 32pt italic serif, 1.2 line-height, with each phrase break preserved as written.

Below quote (centered, medium sans-serif, deep ink): "— Maya Chen"

Below the name (centered, small italic serif, soft warm gray): "creative director, FORESIGHT magazine"

Bottom-right corner stamp (small monospaced caps, deep ink, with thin rule above): "ISSUE 14 / MARCH 2026"

Background: flat cream, very subtle warm paper grain, no decorative elements, no image.

Render all text exactly as quoted including the line-break inside the quote. No additional text, no opening/closing quotation-mark glyphs beyond the curly quotes around the pull-quote itself.
```

---

### 8. Calendar / dates-grid poster

**Source:** freestylefly cases.json case 45 (calendar-grid structure adapted to English)
**Why this works:** A "key dates" poster — common for festival lineups, course schedules, season programmes — needs a tight grid and consistent per-row structure. Quoting every cell and giving the grid a clear column system means the model renders dates correctly without inventing extra rows.
**Swap X for Y:** Replace the festival name and the 8 date rows; keep the column structure.

```
A 3:4 portrait poster, white background, designed as a "key dates" calendar grid for a small festival.

Top-third masthead (centered, sans-serif bold caps, deep ink #1c1917):
- Line 1 (28pt): "PRINT WEEK 2026"
- Line 2 (14pt monospaced, warm gray): "April 14 — April 21 · multiple venues"

Middle-section grid (two columns, eight rows, each row separated by a thin 0.5px rule):

Row format:
- Left column: date in compact format ("APR 14"), 14pt monospaced bold, deep ink, left-aligned in column
- Right column: event description, 14pt sans-serif regular, deep ink, left-aligned

Eight rows:
APR 14 / Opening night — letterpress lecture
APR 15 / Studio crawl — three workshops, north quarter
APR 16 / Risograph day — open studio
APR 17 / Type design specimen talk
APR 18 / Bookbinding intensive (full day)
APR 19 / Independent press fair
APR 20 / Editorial photography panel
APR 21 / Closing night — print swap

Bottom-third footer (centered, small monospaced caps, deep ink): "FREE · DROP-IN · DETAILS AT — [YOUR.URL.HERE]"

White background, no image, no illustration, no decorative shapes beyond the inter-row rules.

Render all text exactly as written. No additional rows or invented events.
```

---

### 9. Numerical-record / report poster

**Source:** Original — pixeltamer v1 (covers the year-in-review / annual-report aesthetic gap)
**Why this works:** Year-in-review and annual-report posters need to render large numbers crisply and pair each with a short label. gpt-image-2 handles big numerals well when quoted exactly; the labels-beneath structure works because each number gets its own micro-zone in the grid.
**Swap X for Y:** Replace the four numbers and four labels with your metrics. Keep the 2×2 grid structure.

```
A 1:1 square poster, soft off-white background (#fafaf8), designed as a four-metric annual-record sheet — all type, no charts.

Top center masthead (small caps, monospaced, deep ink #1c1917): "FORESIGHT — 2026 IN NUMBERS"

Below masthead, a 2×2 grid of large metrics, each cell containing a hero number and a short label:

Top-left cell:
- Hero number "1,247" (centered in cell, 84pt condensed serif bold, deep ink)
- Label below (centered, 12pt monospaced caps, warm gray): "PIECES PUBLISHED"

Top-right cell:
- Hero number "94K" (84pt, deep ink)
- Label: "WORDS COMMISSIONED"

Bottom-left cell:
- Hero number "38" (84pt, warm rust accent #b8462b)
- Label: "NEW VOICES"

Bottom-right cell:
- Hero number "12" (84pt, deep ink)
- Label: "CITY EVENTS"

A thin 0.5px cross dividing the four cells, deep ink.

Bottom corner stamps:
- Bottom-left (small, monospaced caps, deep ink): "ANNUAL RECORD"
- Bottom-right (small, monospaced caps, deep ink): "VOL 04"

Off-white background, no image, no illustration, no decorative borders.

Render all text exactly as written, including the comma in "1,247" and the K in "94K". No additional metrics.
```

---

### 10. Manifesto / declaration poster

**Source:** Original — pixeltamer v1 (canonical "movement statement" poster pattern)
**Why this works:** A manifesto poster — numbered declarative principles, all caps, dense type — works because it asks the reader to scan, not to look. The numbered structure adds rhythm; the all-caps adds weight; the corner sign-off names the entity. Cheap to produce, strong on a wall.
**Swap X for Y:** Replace the seven principles with your own. Keep the "WE / WE / WE" anaphora pattern if you want unity, or vary the openers if you want texture.

```
A 2:3 portrait poster, deep ink background (#1c1917), all type rendered in cream (#f5e6d3) — high-contrast manifesto layout.

Top center masthead (small caps, monospaced, cream): "A QUIET PRACTICE — 7 PRINCIPLES"

Below masthead, seven numbered principles, stacked vertically, left-aligned to a single baseline grid, each principle on its own line:

01. WE WORK SLOWLY ON PURPOSE.
02. WE FINISH WHAT WE START.
03. WE READ MORE THAN WE POST.
04. WE BUILD ONLY WHAT WE NEED.
05. WE TRUST THE READER.
06. WE WRITE BY HAND FIRST.
07. WE KEEP THE LIGHTS LOW.

Each principle in 22pt condensed sans-serif bold, all caps, cream, with the leading two-digit number in monospaced regular and a single em-dash separator before the principle text.

Bottom-third sign-off (centered, small caps, monospaced, cream with thin horizontal rule above):
"PUBLISHED ANNUALLY · FORESIGHT EDITORIAL · 2026"

Deep ink background, no image, no illustration, no decorative shapes beyond the small rule above the sign-off.

Render all text exactly as written, including the periods at the end of each principle. No additional principles or invented numbering.
```
