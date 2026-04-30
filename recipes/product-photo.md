# Recipe: Product Photography

Editorial product shots — for hero pages, e-commerce above-the-fold, founder-update emails, packaging proofs. The single biggest swap from old image models is that gpt-image-2 understands real products and renders real materials accurately when you describe them in spec language.

## When to use

- Product hero for a website above-the-fold
- Lifestyle shot of a single product in context
- Packaging proof / mockup
- Email hero with clear single subject
- "Here's the thing we built" announcement image

## When NOT to use

- Catalog product-on-white (cheaper photography or stock)
- Multi-product overhead flat-lay (use `compose` with refs of each product)
- Anything legally tied to an exact product photo (use the real photo)

## Defaults

- **Size:** `1536x1024` (3:2 landscape — most editorial) or `2048x2048` (square hi-res) or `1024x1536` (portrait product)
- **Quality:** `high`
- **Backend:** API or codex; codex's reasoning loop sometimes gives slightly better composition for complex scenes, slower

## Prompt skeleton

```
Create a product hero photograph of [SUBJECT — describe materials, finish,
proportions, distinguishing features].

Composition: [CAMERA FRAMING — close-up / medium shot / wide; angle —
eye-level / 3/4 view / overhead; subject placement — left third / centered /
golden ratio].

Lighting: [SINGLE DIRECTION] [COLOR TEMPERATURE], [HARDNESS], [FILL DETAILS].

Surface / context: [SURFACE MATERIAL] [SURFACE TONE], [BACKGROUND DESCRIPTION
— blurred / sharp, color, texture].

Lens / camera language: [FOCAL LENGTH] [APERTURE], [DEPTH OF FIELD],
[FILM STOCK OR DIGITAL CHARACTER].

Style anchor: [editorial reference — e.g. "Kinfolk magazine product page",
"Apple iPhone product page", "Aesop website"].

Constraints: no text overlay, no logo, no watermark, no brand name unless
specified. [SPECIFIC NEGATIVES — e.g. "no human hands in frame", "no other
products visible"].
```

## Worked example: minimalist product hero

```bash
pixeltamer generate -o product-coffee.png --size 1024x1024 -p '
Create a product hero photograph of a single white ceramic coffee cup with
a soft matte glaze, slightly imperfect rim showing the hand-thrown character,
filled with a freshly pulled espresso showing visible crema.

Composition: medium close-up, slight 3/4 view from above, cup centered with
generous negative space above for headline placement.

Lighting: dramatic side light from camera left, warm tungsten color
temperature, soft falloff into deep shadow on the right. Subtle steam
rising from the espresso, lit by the rim light.

Surface: dark walnut wood counter, visible grain, gentle reflections beneath
the cup.

Lens: 50mm f/2.8 look, shallow depth of field with the cup'\''s lip in sharp
focus, background dropping into bokeh.

Style anchor: editorial coffee feature in Cereal magazine. Quiet, restrained,
premium.

Constraints: no text, no logo, no human hands, no other objects in frame.
'
```

## Worked example: lifestyle context shot

```bash
pixeltamer generate -o lifestyle.png --size 1536x1024 -p '
Create a lifestyle product photograph of a brushed-stainless French press
sitting on a kitchen counter at golden hour. The French press is the hero,
positioned in the right third of the frame.

Composition: 3:2 landscape, eye-level, slight Dutch angle. Right-third
placement leaves the left two-thirds for atmospheric context. The plunger
rod catches a sharp glint of light.

Lighting: golden hour window light streaming from camera left, long warm
shadows stretching across the counter, soft fill bouncing from a cream wall
behind the camera.

Surface / context: pale oak counter with subtle grain, behind the press a
softly out-of-focus kitchen — a wooden cutting board, a single cream linen
towel, a small clear glass with sprigs of rosemary. Nothing labeled.

Lens: 35mm f/2.0 look, shallow but not extreme depth of field, fine 35mm
film grain, neutral white balance with a touch of warmth.

Style anchor: Kinfolk slow-living editorial. Considered, lived-in, premium.

Constraints: no text, no logo, no human hands, no smartphone or laptop, no
labeled brand items in the background.
'
```

## Worked example: multi-reference product compose

When you have an actual product asset and want to drop it into a different scene:

```bash
pixeltamer compose \
  -p "
    Reference 1 is the product hero shot of the espresso machine.
    Reference 2 is the cafe counter scene with morning light.

    Create a product lifestyle photograph for an editorial coffee feature.
    Place the espresso machine from reference 1 onto the cafe counter from
    reference 2. Re-light everything with morning window light from camera
    right, shallow 50mm f/2.8 depth of field, warm but neutral color grade.

    Preserve the exact brushed-steel finish, dial proportions, and group-head
    geometry from reference 1. Preserve the marble counter texture and out-of-focus
    cafe interior from reference 2.

    No additional logos, no human hands, no other products in frame.
  " \
  -i ./espresso-machine.png \
  -i ./cafe-counter.png \
  --size 2048x2048 \
  -o ./hero.png
```

## Composition tips

- **Use spec language, not praise.** "Shot on 50mm f/2.8" beats "professional, beautiful, premium".
- **One light direction, one color temperature.** Mixing two light sources is okay; three is mush.
- **Specify negative space.** Hero shots need room for headlines; tell the model where the empty area is.
- **Pick a real magazine / brand as style anchor.** "Aesop product page", "Kinfolk feature", "MoMA design store". One per prompt.
- **For lifestyle: name the supporting context items explicitly.** Otherwise the model invents distracting filler.
- **Don't ask for hands unless you mean it.** Default to "no human hands in frame" — accidental hands are the most common product-shot ruiner.
- **Multi-reference compose for real products.** When the product looks need to be exact, pass the product as a reference image instead of describing it.

## Common failure modes

| Symptom | Fix |
|---|---|
| Product looks generic / off-brand | Use multi-reference compose with a real product photo as one of the references |
| Distracting background clutter | Add explicit "no other products visible", reduce supporting items count |
| Wrong materials (plastic instead of ceramic, etc.) | Spell out the material, finish, and tactile details ("matte glaze", "brushed stainless") |
| Text appearing on the product | Add "no text or logos on the product" |
| Over-stylized / too premium-looking | Drop "premium / luxury / professional" praise words; describe the actual style anchor instead |
| Hands or fingers appear unprompted | Add: "no human hands, no fingers, no human presence in frame" |
| Color grading too saturated | Add "neutral white balance" and "muted color grade" |
