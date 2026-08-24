# Transparency — real alpha, not a green screen you clean up later

gpt-image-2 will hand you a genuine alpha channel. `--background transparent`, API backend, done. Every chroma-key trick in this repo predates that and is now the fallback, not the plan.

Read this before generating any asset that gets composited onto something else: icons, logos, mascots, product cutouts, chart layers, sticker packs, anything meant to sit on a background you don't control.

## The one-liner

```bash
pixeltamer generate \
  -p "<isolated subject prompt>" \
  --background transparent \
  --size 1024x1024 --quality high \
  -o asset.png
```

`--output-format` is pinned to `png` automatically when you ask for transparency, because that's what alpha needs. Pass `--output-format webp` if you want it; pass `jpeg` and you get an error instead of a silently opaque image, because JPEG has no alpha channel and never has.

## The rule that decides whether this works

**Your prompt outranks the flag.** OpenAI is explicit about it: if the prompt describes a backdrop, a scene, a colour, a surface, or a shadow falling on something, the model paints that and your alpha channel is a formality.

So `--background transparent` isn't a switch you flip on top of your normal prompt. It's a constraint the whole prompt has to respect.

| You wrote | You get |
|---|---|
| "…on a clean white studio backdrop" | A white rectangle. Fully opaque. |
| "…with a soft drop shadow beneath it" | The shadow needs a surface. The model invents one. |
| "…floating in a minimal beige space" | Beige. All of it. |
| "…isolated object, no backdrop, no surface" | Actual alpha. |

The failure is silent — no API error, no warning, just a PNG with a perfectly good alpha channel where every pixel is opaque.

## The constraint block that works

Bolt this onto the end of any transparent-asset prompt:

```
Output an isolated object on actual fully transparent alpha.
No backdrop, no background colour, no rectangle, no plinth, no pedestal,
no surface, no cast shadow, no reflection, no vignette, no label text,
no watermark.
```

Two extra clauses depending on what you're making:

- **Soft-edged subjects** (fur, smoke, glass, hair): add `crisp alpha edges, no halo, no matte fringe`. Semi-transparent edges are where alpha extraction used to fall apart and where the model still sometimes hedges.
- **Charts and diagrams**: add `keep the plot area, the grid, and the space between bars transparent. Do not add a background, a filled panel, a frame, a title bar, or a card.` Chart layouts pull hard toward a white card — say it explicitly or you get one.

## Writing the subject itself

Same doctrine as everything else in `prompting.md`, with one adjustment: the Scene section mostly goes away. You're not describing a place, you're describing a thing. Spend the words you'd have spent on environment on the subject's material, angle, and lighting direction instead.

```
A single brass desk key, three-quarter view, warm illustrated
ink-and-watercolour style, deep navy outlines, soft warm highlight
from upper left.

Output an isolated object on actual fully transparent alpha. No backdrop,
no background colour, no rectangle, no plinth, no surface, no cast shadow,
no label text, no watermark.
```

Lighting direction still matters — it's what makes the asset sit believably on whatever you composite it onto later. Just don't give the light something to land on.

## Verifying you actually got it

"The call succeeded" means nothing here. Three levels of checking, cheapest first:

**1. Does the file declare an alpha channel?**

```bash
# Zero-dep, ships with the skill
node -e "import('./scripts/lib/image-dimensions.mjs').then(m => console.log(m.readHasAlphaChannel('asset.png')))"

# Or with ImageMagick, if you have it
magick identify -format "%[channels]\n" asset.png    # want "srgba" or "rgba"
```

Batch mode does this for you — any entry whose `Format` field contains `transparent` gets the alpha check automatically and fails with `format says transparent but the PNG has no alpha channel`.

**2. Is the alpha actually used?**

This is the one that catches the real failure. An opaque-everywhere alpha channel passes check 1 and is completely useless.

```bash
# % of fully transparent pixels — expect 30–70% for a typical centred asset
magick asset.png -alpha extract -format "%[fx:100*mean]\n" info:
```

A number near 100 means "almost entirely opaque", which means the model painted a backdrop and you should reread your prompt for the word that caused it.

**3. Does it look right composited?**

Drop it on a mid-grey and a dark background and `Read` both. Halos, matte fringes, and leftover backdrop crumbs are invisible against white and obvious against grey.

```bash
magick asset.png -background "#808080" -alpha remove -alpha off check-grey.png
magick asset.png -background "#12141a" -alpha remove -alpha off check-dark.png
```

## Backend reality

**API backend only.** Both codex transports return opaque PNG:

- `codex exec` (the CLI wrapper) drives codex's built-in image_gen tool, which has no background control at all.
- The OAuth Responses path *accepts* a `background` field in its schema, then rejects the value at execution: `Transparent background is not supported for this model.` Verified live, August 2026.

The dispatcher catches `--background` on codex and tells you this rather than letting either transport fail obscurely. If you're on a ChatGPT subscription and need alpha, the honest options are an API key or the chroma-key fallback below.

## The chroma-key fallback (still useful, no longer the default)

Green-screen-then-key was the old way and it still earns its place in two situations: you're on the codex backend, or you're keying a subject where the model refuses to give clean alpha no matter how you phrase the constraints.

Full patterns live in `ui-mockup-prompting.md` (which background colour for which subject) and `post-process.md` (the ImageMagick and rembg one-liners). Reach for them second, not first.

## Compositing what you generated

The point of a transparent asset is that it goes somewhere. Generate the layers independently, then stack them — you keep per-layer control and you're not re-rolling a whole composition to nudge one element.

```python
# Pillow — the standard move
from PIL import Image

canvas = Image.open("background.png").convert("RGBA")
asset = Image.open("asset.png").convert("RGBA")
canvas.alpha_composite(asset, dest=(x, y))
canvas.save("composed.png")
```

```bash
# ImageMagick, same idea
magick background.png asset.png -geometry +120+80 -composite composed.png
```

When the layers need to *interact* — real contact shadows, reflections, matched lighting — that's `pixeltamer compose` territory instead. Alpha layers stack; they don't blend. See `multi-reference.md`.

## Sizes that composite cleanly

| Asset | Size | Note |
|---|---|---|
| Icon, sprite, small mark | `1024x1024` | Downscale to final size; generating small loses edge detail |
| Logo, wordmark, badge | `1024x1024` or `1536x1024` | Match the aspect you'll actually place |
| Mascot, character cutout | `1024x1536` | Portrait gives the figure room |
| Product cutout for a hero | `1536x1024` or larger | Generate above final size, downscale once at the end |

Ask for generous padding around the subject in every case. Cropping in is trivial; inventing pixels you cropped off is a re-roll.

## Failure modes

| Symptom | Cause | Fix |
|---|---|---|
| Fully opaque PNG, no error | Prompt described a backdrop, scene, or surface | Strip every environment word; add the constraint block |
| Alpha channel exists, ~100% opaque | Same cause, subtler phrasing ("floating in space", "minimal setting") | Same fix — "minimal background" is still a background |
| White or grey rectangle behind the subject | Model defaulted to studio framing | Add `no rectangle, no card, no panel, no frame` |
| Shadow baked onto an invisible floor | Asked for a drop shadow | Drop it from the prompt; add the shadow at composite time |
| Halo or fringe on soft edges | Model hedged the alpha ramp | Add `crisp alpha edges, no halo, no matte fringe`; re-roll |
| Chart on a white card | Chart layouts default to a card | Add the explicit plot-area transparency clause |
| `--background transparent` errors out | You're on the codex backend | Use an API key, or fall back to chroma-key |
