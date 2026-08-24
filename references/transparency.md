# Transparency — real alpha, not a green screen you clean up later

gpt-image-2 will hand you a genuine alpha channel. `--background transparent`, either backend, done. Every chroma-key trick in this repo predates that and is now the fallback, not the plan.

Read this before generating any asset that gets composited onto something else: icons, logos, mascots, product cutouts, chart layers, sticker packs, anything meant to sit on a background you don't control.

## The one-liner

```bash
pixeltamer generate \
  -p "<isolated subject prompt>" \
  --background transparent \
  --size 1024x1024 --quality high \
  -o asset.png
```

Works on both backends for `generate`. On the API backend it's a request parameter; on codex it becomes prompt instructions plus a post-generation alpha check (see Backend reality below).

`--output-format` is API-only and pins to `png` automatically when you ask for transparency, because that's what alpha needs. Pass `--output-format webp` if you want it; pass `jpeg` and you get an error instead of a silently opaque image, because JPEG has no alpha channel and never has.

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

### Name the boundary, don't just deny the background

"No background" is a wish. Naming the edge the transparency starts at is a constraint, and it's the single biggest upgrade to a transparent-asset prompt:

| Asset | Say this |
|---|---|
| App icon | `keep everything outside the rounded icon tile transparent` |
| Sticker | `keep everything outside the die-cut border transparent` |
| Garment / product cutout | `keep everything outside the garment silhouette transparent` |
| Botanical sprig, filigree, chain, lattice | `keep all space around **and between** the thin branches and leaves transparent` |
| Chart | `keep the plot area, the grid, and the space between bars transparent` |
| Doughnut chart | `keep the doughnut centre, the legend area, and all surrounding space transparent` |

That "around **and between**" phrasing is what saves filigree. Without it the model treats the subject's convex hull as the silhouette and fills the gaps between branches, which reads as a solid blob the moment you composite it.

### Extra clauses by subject type

- **Hard-edged subjects**: add `crisp alpha edges, no halo, no matte fringe`.
- **Genuinely translucent material** (glass, liquid, resin, gemstone): add `preserve every natural transparency, refraction, translucent layer and fine material edge`. Different instruction from the one above — here you *want* partial alpha through the body of the object, not just at its rim. Asking for crisp edges on a perfume bottle flattens the glass.
- **Charts and diagrams**: transparency has to run *through* the chart, not just around its silhouette. Add `do not add a background, a filled panel, a frame, a title, or a card`, and for a dark destination theme specify `white or pale labels` and bright colours explicitly — the model defaults to dark text that vanishes on a dark slide.

### Keeping a collection consistent

Generating a set — a product range, an icon family, a sticker pack — one prompt at a time gives you four assets that don't look related. Fix it the way the OpenAI cookbook does: write the per-item description short and specific, then append **one identical brand-and-transparency block** to every item.

```python
brand = (
    "One object from <BRAND>, <house style in 15-25 words: materials, palette, "
    "lighting, restraint>. Full object completely visible and generously padded. "
    "Output an isolated object on actual fully transparent alpha; no backdrop, "
    "no rectangle, no plinth, no cast shadow, no readable writing, no label "
    "text, no watermark."
)
prompt = f"{item_description} {brand}"
```

The constant suffix is doing two jobs: it's the style anchor that makes four separate generations read as one collection, and it's the transparency contract. Change it once and the whole set moves together. This is the pattern batch mode's `prompts.md` should follow — see `SKILL.md` Mode 4.

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
# % of fully transparent pixels
magick asset.png -alpha extract -format "%[fx:100*mean]\n" info:
```

Roughly 30–85% is normal depending on how much padding you asked for — measured across our own test generations: 51.6%, 73.6%, 78.0%, 79.9%. A number near 100 means "almost entirely opaque", which means the model painted a backdrop and you should reread your prompt for the word that caused it. A number near 0 means it produced nothing.

**2b. Is the RGB under the transparent pixels scrubbed?**

Fully-transparent pixels still store colour. gpt-image-2 sometimes leaves a ghost of the scene there — invisible in any alpha-aware viewer, and suddenly visible the moment something flattens the image naively (some game engines, print pipelines, older canvas code).

```bash
# Non-zero output means transparent pixels are carrying colour
magick asset.png -alpha extract -negate -write MPR:m -delete 0 \
  asset.png MPR:m -compose multiply -composite -format "%[fx:mean]\n" info:

# Scrub it
magick asset.png -channel RGB -fx 'a==0?0:u' scrubbed.png
```

**3. Does it look right composited?**

Drop it on a mid-grey and a dark background and `Read` both. Halos, matte fringes, and leftover backdrop crumbs are invisible against white and obvious against grey.

```bash
magick asset.png -background "#808080" -alpha remove -alpha off check-grey.png
magick asset.png -background "#12141a" -alpha remove -alpha off check-dark.png
```

## Backend reality

Both backends can do this, but they get there differently — and the difference decides how much you verify.

**API backend** — `background=transparent` is a real request parameter. Ask, receive.

**Codex backend** — no parameter, but the model produces genuine alpha when the *prompt* asks for one. `--background transparent` appends the constraint block to your prompt and then checks the result, warning on stderr if the PNG came back RGB. It announces the rewrite so you're not wondering why your prompt grew.

The distinction that took a live test to find: the OAuth Responses transport *accepts* a `background` field in its schema and then refuses the value — `Transparent background is not supported for this model.` The parameter is rejected; the prompt is honoured. Don't read the first fact as "codex can't do transparency," which is what pixeltamer's own docs said until August 2026.

Codex scope: **`generate` only.** `edit` and `compose` go through that same Responses transport, which refuses the parameter, and whether prompt-driven alpha survives an edit is untested. The dispatcher refuses rather than guessing.

| | API | Codex |
|---|---|---|
| Mechanism | `background` request param | prompt instructions |
| Modes | generate, edit, compose | generate only |
| Reliability | deterministic | stochastic — verify every time |
| `--output-format` | png / jpeg / webp | always PNG |

## The chroma-key fallback (still useful, no longer the default)

Green-screen-then-key is no longer the default on either backend, but it still earns its place: a subject the model won't cut cleanly no matter how you phrase the constraints (fine hair, fur, lace, chains), or a codex `edit`/`compose` where the flag isn't available.

For genuinely translucent subjects — glass, liquid, glow, smoke — the strongest technique is dual-background extraction: render the same subject on pure black and pure white, then solve for alpha from the difference. It preserves partial transparency that chroma-keying flattens.

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

## Trim the padding after, not before

Ask for generous padding in the prompt — cropping in is free, inventing pixels you cropped off is a re-roll. Then trim to the actual artwork using the alpha channel itself, which is exact rather than eyeballed:

```python
from PIL import Image

def visible_region(image):
    """Crop away fully-transparent padding without touching visible pixels."""
    bounds = image.getchannel("A").getbbox()   # None means the image is empty
    if bounds is None:
        raise ValueError("Expected a transparent PNG with visible artwork.")
    return image.crop(bounds)
```

```bash
# ImageMagick equivalent
magick asset.png -trim +repage trimmed.png
```

`getbbox()` on the alpha channel returns the tight box around every non-zero pixel, so the crop is pixel-exact and lossless. Doing this at composite time rather than generation time also means one generated asset can be placed at different scales without re-rolling.

A useful side effect: if `getbbox()` returns `None`, the asset is fully transparent — the model produced nothing. That's a cheap emptiness check worth keeping in a pipeline.

## Four workflows this unlocks

Transparency isn't one feature, it's a set of workflows that only become possible once assets stop carrying their own background. Straight from the OpenAI cookbook, and all four are things pixeltamer can drive:

**Product collection reused across campaigns.** Generate the range once with a shared brand suffix, then place the same PNGs over any number of seasonal storefront backgrounds. The alternative is re-shooting or re-cutting per campaign.

**Charts that sit on a branded slide.** A generated chart with a white card clashes with every corporate PowerPoint theme. Transparent, it inherits the slide's gradient. Read the caveat in `recipes/infographic.md` first — for numbers that have to be *right*, render the chart deterministically and use generation for the illustration around it.

**Design-template elements.** Icons, stickers, decorative sprigs that users drop onto arbitrary layouts. This is where the "name the boundary" table above earns its keep — icon tile, die-cut border, around-and-between for botanicals.

**Print-on-demand, two transparent layers.** Generate the artwork transparent *and* the blank garment transparent, then composite artwork onto garment onto canvas. One design becomes a T-shirt and a sweatshirt without a white rectangle to remove per colourway:

```python
garment.alpha_composite(artwork, dest=(chest_x, chest_y))
canvas.alpha_composite(garment, dest=(garment_x, garment_y))
```

Prompt the blank product with `leave the chest completely blank for a print design` and `no person, hanger, mannequin, logos, graphics, shadows, or background` — otherwise you get a styled photo you can't print onto.

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
| `--background transparent` errors out on edit/compose | Codex backend — those modes use the Responses transport, which refuses the param | Use `--backend api`, or generate transparent and composite locally |
| Transparent pixels carry ghost colour when flattened | RGB under alpha=0 wasn't scrubbed; naive flatteners show it | Scrub it — see `post-process.md` |
