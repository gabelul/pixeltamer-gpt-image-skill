# playbook backlog — v2 / v3 / v4

Staged plan to bring over the categories from external corpora that aren't already covered by an existing recipe. Each row is a future playbook file. Each cycle is a separate ralplan + ralph execution.

**Skip filter — only redundancy, not "niche"**: a category gets skipped only if `recipes/` already covers it at full depth. "Niche audience" is NOT a skip reason — designers, illustrators, game devs, brand teams, and content creators all have legitimate use for the categories in v3/v4 below. Multiple independent skills (wuyoscar's `gpt_image_2_skill`, `claude-image`, `freestylefly`, `EvoLink`) corroborate that these categories carry real demand.

**Discipline applied to every entry**: subject-first / magic-words stripped / English-only (unless subject IS the script) / source-cited / 8–12 prompts per file with "why this works" + "swap X for Y" notes / each prompt test-rendered once before shipping.

## v1 (shipped 2026-05-07)

- ✅ `playbook/README.md` — boundary rule + discipline checklist + source-citation format + English policy
- ✅ `playbook/BOUNDARY-AUDIT.md` — per-recipe disposition record (no migration in v1)
- ✅ `playbook/character-sheets.md` — 10 prompts (multi-view sheets, expression sets, sticker packs, pose libraries)
- ✅ `playbook/typography-posters.md` — 10 prompts (giant letter, brutalist grid, quote-led, manifesto, bilingual)

Plus `references/index.md` routing, SKILL.md Step 0, SKILL-OC.md slim-down, `tests/index-staleness.test.mjs`.

## v2 — high-value gaps + queued categories (5 files)

| File | Sources to mine | Estimated effort |
|---|---|---|
| `playbook/scientific-figures.md` | wuyoscar gallery-research-paper-figures + gallery-scientific-and-educational + gallery-technical-illustration | 6–8 hours |
| `playbook/isometric.md` | wuyoscar gallery-isometric + freestylefly isometric examples | 4–6 hours |
| `playbook/brand-systems.md` | wuyoscar gallery-brand-systems-and-identity + freestylefly cases 36/186/354 + claude-image use-case "Logo / brand mark concepts" | 6–8 hours |
| `playbook/architecture-renders.md` | wuyoscar gallery-architecture-and-interior + freestylefly architectural cases | 4–6 hours |
| `playbook/illustration-styles.md` (merged) | wuyoscar gallery-illustration + gallery-more-illustration-styles + gallery-watercolor + gallery-fine-art-painting + gallery-ink-and-chinese — one file, sub-sections per style | 8–10 hours |

**Plus a v2 reference-doc patch** (small, no playbook):
- Update `references/multi-reference.md` to fold hermes-editing's `PRIMARY SOURCE` / `REFERENCE IMAGE 1/2` labeling pattern + explicit anti-patterns ("no collage / no head transplant / no body pasted from references"). ~1 hour.

**v2 total**: ~30–40 hours of curation + render time. One ralplan cycle.

## v3 — confirmed gaps from claude-image's use-cases.md (6 files)

`claude-image` lists pixel-art, app-icons, photo-edit-patterns, web-spot-illustrations, and Chinese-text-on-posters as TOP-level templates. Web-spot already folded into v2's illustration-styles; the others get their own files.

| File | Sources | Estimated effort |
|---|---|---|
| `playbook/anime-manga.md` | wuyoscar gallery-anime-and-manga + freestylefly cases 7/13/14 | 6–8 hours |
| `playbook/pixel-art.md` | wuyoscar gallery-pixel-art + claude-image use-case "Pixel art & game assets" + freestylefly case 186 (16-bit RPG inventory grid) | 4–6 hours |
| `playbook/app-icons.md` | claude-image use-case "App icons" + freestylefly icon-set cases (160 vintage skeuomorphic) + originals | 4–6 hours |
| `playbook/cinematic.md` (merged) | wuyoscar gallery-cinematic-and-animation + gallery-cinematic-film-references + freestylefly mecha/key-visual cases | 6–8 hours |
| `playbook/photography-styles.md` | wuyoscar gallery-photography (broader styles outside product-photo / editorial-cover) + freestylefly photographer-named cases | 6–8 hours |
| `playbook/data-viz.md` | wuyoscar gallery-data-visualization + freestylefly chart-led cases (distinct from `recipes/infographic.md` — focus on charts not explainers) | 4–6 hours |

**v3 total**: ~30–42 hours. One ralplan cycle.

## v4 — long tail (7 files)

| File | Sources | Estimated effort |
|---|---|---|
| `playbook/fashion-editorial.md` | wuyoscar gallery-fashion-editorial + freestylefly fashion campaign cases | 4–6 hours |
| `playbook/tattoo-design.md` | wuyoscar gallery-tattoo-design | 3–4 hours |
| `playbook/gaming-assets.md` | wuyoscar gallery-gaming + freestylefly game UI cases | 4–6 hours |
| `playbook/retro-cyberpunk.md` | wuyoscar gallery-retro-and-cyberpunk + freestylefly Y2K/cyberpunk cases | 4–6 hours |
| `playbook/events-experience.md` | wuyoscar gallery-events-and-experience | 3–4 hours |
| `playbook/screen-mockups.md` | wuyoscar gallery-screen-photography (phone/laptop in scenes) | 3–4 hours |
| `playbook/beauty-lifestyle.md` | wuyoscar gallery-beauty-and-lifestyle + freestylefly fragrance/skincare cases | 4–6 hours |

**v4 total**: ~25–36 hours. One ralplan cycle.

## Truly skipped (redundant — not niche-based)

- `gallery-product-and-food` → covered by `recipes/product-photo.md`
- `gallery-ui-ux-mockups` → covered by `recipes/ui-mockup.md`
- `gallery-infographics-and-field-guides` → covered by `recipes/infographic.md`
- `gallery-edit-endpoint-showcase` → covered by SKILL.md edit mode + `references/multi-reference.md`
- `gallery-official-openai-cookbook-examples` → already integrated into `references/prompting.md`
- `gallery-character-design` → extended in v1 `playbook/character-sheets.md`

## Total roadmap

- v1: 2 playbook files (shipped)
- v2: 5 playbook files + 1 reference patch
- v3: 6 playbook files
- v4: 7 playbook files
- **Total when complete: 20 playbook files** covering ~26 wuyoscar categories (some merged)

Approximate total effort across v2–v4: **~85–120 hours** of curation and render time, staged across 3 separate ralplan + ralph cycles.

## How to start a stage

When you're ready to start v2 (or v3, or v4):
1. Open a new chat session in this repo
2. Type: `ralplan execute the v2 playbook backlog from playbook/BACKLOG.md`
3. The ralplan workflow will plan, review, approve, then hand off to ralph for execution
4. v2 ships, then this file gets updated with v2 as ✅ shipped, and v3 becomes the next available stage

Each stage is independently shippable. Don't bundle v2 + v3 into one mega-cycle — that's how scope creep + quality drift happen.
