# Prompting for UI mockups

UI generation is its own dialect of image generation. The same patterns that work for posters and product photography sabotage UI mockups, and vice versa. This doc covers the specific moves that produce dashboards, marketing pages, app screens, and design-system mockups that look like real products instead of AI mush.

## The two prompt styles for UI

Pick one consciously per mockup. Mixing them in one prompt produces the worst of both.

### Analogy style — best for creative quality and atmosphere

Borrow design language from referents instead of describing pixels:

> *Like reading sheet music behind a hit song. The dashboard should feel like Notion's calm meets a music producer's notes. Quiet typography, strong information hierarchy, single accent color.*

The model maps "Notion" and "producer's notes" to a coherent visual style. Cleaner outputs than describing typography weights and exact spacings.

### Inventory style — best for reliable accuracy

List the semantic content the page must contain, without specifying layout:

> *Page shows: a "Welcome back, Maya" greeting; a 30-day engagement trendline as the hero metric; a list of three active campaigns with status (live / paused / draft) and reach; and a quick-action bar with "+New campaign" and "Import contacts".*

The model decides where things go. You verify the content is right, then iterate composition with one targeted nudge if the layout is wrong.

**Rule:** describing too specifically makes the model *execute* rather than *design*, paradoxically worsening output. Don't write column widths in pixels. Don't write padding values. Describe content and intent; let the model handle layout.

## Use real data, not placeholders

This is the single biggest quality move in UI prompting. The model treats `Lorem ipsum` and `[product name]` as cues to generate filler-looking visuals. Specific data produces specific visuals.

| Don't | Do |
|---|---|
| `Show view count` | `Stat: "2.3M views"` |
| `Display pricing` | `Pricing card: "$29 / mo, billed annually" with "Save 20%" eyebrow` |
| `User profile` | `Profile: name "Maya Chen", role "Product Designer", location "Lisbon"` |
| `Recent activity feed` | `Recent: "Connected to Linear", "Imported 412 contacts", "Published 'Q3 Roadmap'"` |
| `Logo here` | `Logo: a clean wordmark "MERIDIAN" in dark navy Inter Bold` |

Specific data triggers specific styling, alignment, and density choices. This applies even when the data doesn't matter to your final use — make it up, but make it real.

## Color: HEX, not HSL or named

The model parses HEX more accurately than HSL or named colors:

- ✅ `Background #f9f5f0, accent #1a2b4c, text #273142`
- ⚠️ `Background hsl(28 25% 97%), accent hsl(218 49% 20%)`
- ❌ `Cream background, dark navy accent, charcoal text`

Always specify the background hex first, then accent, then any secondary. Three colors max for clean designs; if you need more, you're describing a chart, not a UI.

## Length cap: about 800 words

Past ~800 words, generation can disconnect or produce inconsistent layouts. If you need more detail, split into two passes: generate a base layout first, then `edit` it with the additional specifics.

## What to ask the model to generate vs. what to build in code

Even when generating a mockup for production reconstruction, think about which elements you'd want as real assets vs. as code. This determines what to prompt for:

| Element | Best as | Why |
|---|---|---|
| Page layout, cards, tables, buttons, input fields, filters, plain text | HTML/CSS in production | Geometric, clean, AI mockup is just a reference |
| Standard line icons (calendar, search, settings, nav) | SVG / icon lib in production | Stroke width and color need to be controllable |
| Logo, brand mark, complex empty-state illustration, 3D/glass texture, hand-drawn elements | Generated image asset | Brand recognition needs visual fidelity that code reconstruction loses |
| Tiny product visualizations, network/relationship diagrams, multi-logo integration grids | Generated image asset | Code can fake structure but loses density and brand iconography |
| Background textures, soft glows, complex shadows, decorative illustrations | Generated image asset | Model produces texture quality that CSS can't fake |

When you're prompting for the FULL mockup (not just an asset), keep this in mind: the model will render everything as pixels regardless. But knowing which parts are throwaway vs. which parts you'll actually crop out as assets affects what you ask it to render carefully.

## Asset prompts — when generating a single piece

These are prompts for generating standalone assets you'll later place in a UI (logo, hero illustration, vendor logo row, empty-state). Each one centers a single subject on a clean background and asks for generous padding so cropping is forgiving.

### Standalone logo asset

```
Based on the reference image, recreate ONLY the app logo mark as a standalone asset.
Pure white background. Centered. Large size.
No text, no border, no mockup, no shadow box, no extra symbols.
Preserve the logo's silhouette, proportions, gradient, soft depth, and brand feel.
Leave generous white padding around the logo for cropping.
```

### Standalone empty-state illustration

```
Based on the reference image, recreate ONLY the central empty-state illustration as a standalone asset.
Pure white background. Centered. Large size.
No surrounding dashboard UI, no text, no buttons, no labels, no border, no grid.
Preserve the soft blue gradient, translucent panels, database cylinder, chart card, orbit line, subtle highlights, and gentle SaaS product style.
Leave generous white padding around the illustration for cropping.
```

### Vendor logo row

```
Scene: pure white #ffffff canvas.

Subject: one horizontal row of vendor logos: Amplitude, Brex, Loom, Notion, Webflow, Ramp.

Details: large crisp vector-style dark navy marks and wordmarks, color #273142, clean kerning, consistent baseline, generous spacing, readable at web size.

Constraints: pure white background, no shadow, no glow, no texture, no gradient, no border, no labels, no grid, no watermark. Render only the logo row. Text must be legible and spelled exactly.
```

### Green-screen variant for reliable alpha extraction

When white background will conflict with the destination background (dark UIs, complex backdrops), use chroma-key:

```
Put the asset on a perfectly flat solid #00ff00 chroma-key background for background removal.

The background must be one uniform #00ff00 color with no shadows, gradients, texture, reflections, floor plane, or lighting variation.

Keep the subject fully separated from the green background with generous padding. Do not use #00ff00 anywhere in the subject. No semi-transparent glow, no soft shadow touching the background, no hairline strokes on the background, crisp opaque edges.
```

Then use ImageMagick or rembg to alpha-extract — see `post-process.md`.

## Choosing white vs. green for your asset background

| Asset | Background | Why |
|---|---|---|
| Vendor logos, dark text, dark line icons | White | Green leaves green tint on antialiased edges of dark strokes |
| Colorful illustrations, hero graphics, decorative elements | Green (#00ff00) | White-keying eats white highlights inside the subject |
| UI screens / cards (already mostly white) | Green | White-keying destroys the subject |
| Anything with semi-transparent shadows or soft glows | Generate with real `--background transparent` (API backend supports it) | Both keying methods leave artifacts |

## Common UI prompt mistakes

**Mistake: column widths in pixels**
> *Sidebar 280px wide, main content area 1200px, right panel 320px, with 24px gutters between columns.*

The model treats this as text to render in the image, not as layout instruction. Drop it.

**Fix:** describe proportions and content, not pixels.
> *Three-column dashboard. Left sidebar (narrow) for navigation. Main content area (wide) for the primary chart. Right panel (medium) for activity feed.*

**Mistake: stacking style words**
> *Modern, clean, minimalist, professional, sleek, polished, premium dashboard UI*

Praise language. Adds zero instruction.

**Fix:** name a reference. *"Visual style: Linear's marketing site. Calm, single-accent, generous whitespace."*

**Mistake: asking for too much in one shot**
> A full SaaS landing page with hero, features, testimonials, pricing, and footer.

The model produces something average for everything. Each section is mediocre.

**Fix:** generate sections separately, compose later. One prompt = one section. Use `pixeltamer compose` if you need them stitched.

**Mistake: real mode + abstract mode in one prompt**
> *A realistic dashboard mockup with whimsical hand-drawn icons*

The model picks one and abandons the other.

**Fix:** pick a dominant style. If you need both, generate separately and composite.

## Iteration order for UI mockups

When the first generation is close but wrong, change in this order (one at a time):

1. **Content correctness** — wrong data, missing element, hallucinated component → re-prompt with fixed content list.
2. **Color palette** — switch to HEX, specify accent color explicitly.
3. **Density** — "show fewer items per row" or "more breathing room between cards".
4. **Composition** — "move the chart to the right of the page" — be explicit about position.
5. **Typography** — "use sans-serif throughout, no serifs" — only if a wrong typeface persists.

Don't change all five at once. You won't know which fix worked.
