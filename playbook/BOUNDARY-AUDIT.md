# Boundary audit — existing recipes

Per-file audit of existing recipe worked-example blocks against the boundary rule in `playbook/README.md`. v1 disposition: existing examples STAY in their recipes (canonical teaching examples). Future variants go into matching playbook files.

## How to read this

For each recipe, the worked-example block (if any) is listed with one of:

- **STAYS** — keep in `recipes/` as the canonical teaching example. Future variants go to playbook.
- **CANDIDATE** — could plausibly migrate to playbook in v2; staying in recipe for v1 is the no-cost default.
- **CLEAR** — already correctly placed (recipe is pure methodology, no playbook-shaped examples).

## Per-recipe disposition

### `recipes/mascot.md` (lines 298-473)

**Disposition: STAYS** — canonical teaching examples. Three worked examples:
1. Pip the origami courier crane (the v1 canonical Pip — empirically validated, ships in `docs/brand-assets/pip-canonical.png`)
2. Original origami binder paper-bag failure case (kept as a *teaching artifact* — shows what wrong-concept produces; rare but valuable as a counter-example, classifies as methodology not playbook)
3. Throughline SaaS character (faceless flat editorial example for a different product context — illustrates the recipe's use-case range)

Why STAYS: these examples are doing pedagogical work, not just providing remixable prompts. The Pip example explicitly cites the A/B that validated it; the paper-bag failure case is unique to mascot teaching; Throughline shows context-shifting. v2 may add additional variants to `playbook/character-sheets.md` (handoff poses, expression sheets, sticker packs) without disturbing these.

### `recipes/infographic.md` (lines 50-77)

**Disposition: STAYS** — canonical teaching example. Single worked example: pitch-deck slide titled "Q3 Revenue Performance" with concrete layout, axis bounds, KPI cards, and explicit anti-patterns (no clip-art, no gradients, no stock photography).

Why STAYS: the example is pedagogically embedded — it teaches the canonical structure (Intent → Scene → Subject → Details → Text → Style → Constraints) by demonstration. Future infographic playbook in v2 (data-viz, scientific-figures) can pull additional remixable variants without removing this canonical anchor.

### `recipes/meta-ad.md`

**Disposition: CLEAR** — no worked-example block resembling a playbook entry. Recipe is methodology + skeleton + failure modes. No migration considered.

### `recipes/viral-linkedin.md`

**Disposition: CLEAR** — recipe focuses on patterns and decision-making for scroll-stop card composition. Examples in the recipe (where present) are inline illustrations of points, not standalone remixable prompts.

### `recipes/ui-mockup.md`

**Disposition: CLEAR** — recipe is methodology-heavy, paired with `references/ui-mockup-prompting.md`. No worked-example block to migrate.

### `recipes/editorial-cover.md`

**Disposition: STAYS** — canonical teaching examples present (magazine cover, podcast cover art at lines ~50-100). Same reasoning as `mascot.md`: these examples teach the recipe's structure by demonstration. v2 typography-posters playbook (already in v1 actually as `playbook/typography-posters.md`) covers the *remixable* type-led poster cases without removing the recipe's canonical examples.

### `recipes/product-photo.md`

**Disposition: CLEAR** — recipe focuses on commercial-photography vocabulary and lighting/camera direction. No standalone remixable-prompt block to migrate.

## v2 follow-ons

If/when v2 happens:
- Consider whether the Throughline SaaS character example in `mascot.md` should *also* appear as an entry in `playbook/character-sheets.md` (with cross-link). Currently no migration; revisit if remix demand grows.
- Same question for `editorial-cover.md`'s podcast cover art — possibly belongs in v2 `playbook/typography-posters.md` as a remix base.
- The `infographic.md` pitch-deck example could seed a v2 `playbook/data-viz.md` if that playbook ships.

None of these are v1-blocking.

## Audit conclusion

No file moves, no link breaks, no content duplication in v1. Boundary rule is documented; existing canonical examples are documented as exceptions. Future content lands cleanly per the rule.
