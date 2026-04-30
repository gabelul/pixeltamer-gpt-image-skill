# Multi-reference composition

The killer feature of the `/images/edits` endpoint: pass up to 16 reference images and the model blends them into one editorial composition with consistent lighting, shadows, and color grading. This is what `pixeltamer compose` does (API backend only — codex's `image_gen` tool doesn't support multi-reference).

Single product + single lifestyle scene + brand asset → one editorial composite in 60–120 seconds. No Photoshop step, no relighting work, no shadow matching.

## When to reach for it

- Editorial product photography: product in a real-world scene, brand-correct.
- Before/after / variant compositing for marketing.
- Hero composites that pull a person from one scene and a backdrop from another.
- Recipes where you want the model to see existing assets and use them rather than hallucinate them.
- Wardrobe / product placement on existing models or scenes.

## CLI shape

```bash
pixeltamer compose \
  -p "Gift basket with the lotion bottle, the candle, and the chocolate box from the references, arranged on a marble countertop with morning window light from the left" \
  -i ./lotion.png \
  -i ./candle.png \
  -i ./chocolate-box.png \
  -o ./gift-basket.png \
  --size 1536x1024 \
  --quality high
```

Repeat `-i` up to 16 times. Order doesn't matter mechanically — but the model handles labeled prompts much better than unlabeled (see below).

## The label trick (do this)

Don't make the model guess which reference is which. Label them in the prompt:

```
Reference 1 is the white ceramic lotion bottle with gold lid.
Reference 2 is the soy candle in an amber glass jar.
Reference 3 is the dark chocolate gift box with raised lettering.

Compose: an editorial gift basket photograph showing all three items
arranged inside a wicker basket lined with cream linen. Natural morning
light from camera left. Shallow depth of field, 50mm f/2.8 look.
35mm film grain, neutral white balance.

Use the EXACT product appearance from each reference — preserve the
gold lid on Reference 1, the amber tint and label texture on Reference 2,
and the embossed lettering on Reference 3.
```

Three things make this work:

1. **Numbered, descriptive labels** so the model has a stable handle for each reference.
2. **Spec language for the new scene** — composition, lens, lighting, palette.
3. **Explicit preservation directives** for the parts of each reference that must not drift ("preserve the gold lid…").

## Common mistakes

**Mistake: vague references**
`compose -p "make a hero shot" -i a.png -i b.png -i c.png` — the model has no idea what to do with these three things. Preservation is uncertain. Output is mushy.

**Fix:** label each reference in the prompt and state the desired composition explicitly.

**Mistake: too many references for the scope**
Asking the model to blend 16 wildly different inputs into one cohesive scene is too much. The output averages everything into beige.

**Fix:** keep the reference set focused. 2–6 references with a clear intent beats 12 references with vague hopes.

**Mistake: contradictory lighting cues**
References shot in different lighting conditions confuse the output. The model picks an average that matches none.

**Fix:** state the target lighting explicitly. "Re-light all subjects with morning window light from camera left" overrides any conflicting cues from the references.

**Mistake: relying on multi-reference for what edit can do better**
If you have one source image and one small change, use `pixeltamer edit` with that single image. The edit endpoint with a single source preserves more of the original than multi-reference compose, which is doing more aggressive resampling.

## Sizes that work well for compositions

- `1536x1024` (3:2 landscape) — the default editorial composition shape.
- `2048x2048` — high-res square; good for IG carousels and product packaging proofs.
- `3840x2160` — full 4K landscape; cover-art quality, slower generation.

Avoid extreme aspect ratios for compositions. The model has more trouble laying out blended elements in narrow strips.

## What the model actually does under the hood

Conceptually: each reference image is encoded into the model's latent representation, then the prompt acts as a layout/style/grading instruction that determines how those latents are blended into the output. The lighting, shadows, and reflections are *inferred for the new scene*, not copied from the references — which is why the result looks coherent even when the references were shot in different conditions.

This is also why `compose` is much slower than `generate` of an equivalent size: there's a lot more conditioning data to incorporate.

## Iterating on a compose result

Same rule as `generate`: change one dimension at a time. Most useful knobs in order:

1. **Lighting clause** — "morning window light from camera left" → "overcast diffused light, no hard shadows".
2. **Composition clause** — "arranged inside a wicker basket" → "stacked on a slate tray with kraft paper" .
3. **Preservation directives** — add or strengthen them when a reference's identifying features are drifting.
4. **Reference set** — add or remove a reference. Removing usually beats adding when results are mushy.

## Quick recipe — product hero

```bash
pixeltamer compose \
  -p "
    Reference 1: the espresso machine.
    Reference 2: the ceramic cup.

    Create a product hero photograph for an editorial coffee feature.
    Shot on 50mm f/2.8, shallow depth of field, golden hour window
    light from camera right, soft wraparound fill from the left.
    Composition: machine on the left third, cup with steaming espresso
    on the right third, dark walnut counter foreground, blurred warm
    cafe interior background.
    Preserve the brushed steel of Reference 1 and the white glaze and
    handle shape of Reference 2 exactly. Do not invent additional logos.
  " \
  -i ./espresso-machine.png \
  -i ./ceramic-cup.png \
  -o ./hero.png \
  --size 2048x2048 \
  --quality high
```
