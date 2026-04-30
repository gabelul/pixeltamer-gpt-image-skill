# Examples

A small curated set of generations to give the eye a sense of what's possible. Each one was made by one of the source repos this skill consolidates — the originals were generated against gpt-image-2 with the prompts shown below.

The shipped set is intentionally small — about 3 MB total after pngquant compression. Running pixeltamer with these prompts will reproduce them at any size.

## product-photo.png

Square minimalist product photograph. Demonstrates editorial product styling on a cup-of-coffee subject — the kind of shot you'd put above the fold on a product page.

```
Elegant minimalist product photography: a single white ceramic coffee cup
on dark marble surface, steam rising softly, dramatic side lighting.
```

- Size: 1024×1024
- Recipe: `recipes/product-photo.md`
- Backend: codex (in the source repo); reproduces fine on API too

## editorial-poster.png

Vertical poster composition with a single hero subject and atmospheric backdrop. Good demonstration of mood-driven editorial work.

```
A lone astronaut standing on the edge of a crater on Mars, looking at
Earth rising on the horizon, cinematic composition.
```

- Size: 1024×1536
- Recipe: blends `recipes/editorial-cover.md` with cinematic lighting from `references/prompting.md`

## landscape-cinematic.png

Wide cinematic landscape — Mediterranean coastal city at night. Useful as a reference for atmospheric night scenes with practical lighting (windows, lamps).

```
A breathtaking coastal Mediterranean city at night, white-washed
buildings cascading down hillside.
```

- Size: 1536×1024
- Recipe: ad-hoc; references `references/prompting.md` lighting + composition vocab

## infographic-llm-stack.png

Tech infographic with a 5×6 grid of brand logos. Demonstrates gpt-image-2's grasp of real product visuals (logos render correctly because the model has them as references in its training).

```
Tech infographic: "THE AI STACK — 2026" title + 30-logo grid (5 rows × 6
columns) showing frontier labs, models, image/audio, dev tools, and
infra companies. All real logos rendered accurately.
```

- Size: 3840×2160
- Recipe: `recipes/infographic.md`
- Backend: API (multi-logo accuracy benefits from `--quality high` and reliable text rendering)

## Reproducing these

Each prompt above can be passed straight to `pixeltamer generate`. The exact pixel output won't be identical (image generation has stochasticity), but the composition and style will be in the same neighborhood.

```bash
pixeltamer generate -p "Elegant minimalist product photography..." \
  --size 1024x1024 --quality high -o my-product-photo.png
```

For the multi-reference recipes (compose mode), see `recipes/meta-ad.md` and `recipes/product-photo.md` for worked examples that need real reference images you'd supply yourself.
