# Recipe: Mascot / Brand Character

Brand mascots, app icon characters, sticker packs, onboarding companions. The class of work where a *designed character* — not an illustration of a real subject — represents a product, brand, or feature. This is the domain where gpt-image-2 fails most often, because it averages every "cute character" request toward a generic Slack/Discord/Trello blob unless you anchor hard.

## Step -1 — Minimum viable prompt FIRST (Discovery phase ONLY)

**Scope**: this technique belongs to the Discovery workflow phase. Once you've locked a canon prompt for your project, abandon "surprise me" and switch to the canon prompt verbatim — every regeneration. Drift starts the moment you "tweak" canon prose mid-production. See "Workflow phases" below for the four phases and when each format applies.

Before the character bible, before the anchor decision tree, before any forbidden block — write a 5–10 line minimal prompt and run it. Examples:

```
Design an iOS app mascot character for [PRODUCT] — a [PRODUCT_DESCRIPTION].
Vibe: [3-4 adjectives]. Pet-neutral / serves [audience]. Surprise me with
the character. Flat 2D illustration. [Background description].
```

The model often has better creative taste than your prescriptions. **The "broken concepts" you ruled out from over-prescribed failures may resolve beautifully when given creative latitude.** This was discovered during the PetBinder session: I had ruled out "binder-as-character" after three over-prescribed attempts produced bag-shaped failures. A 10-line minimal prompt produced a binder-character-with-clipboard concept that became the canonical mascot.

Only escalate to the full recipe (character bible, anti-patterns, DoD) once you've picked the strongest minimal-prompt result and need to refine it for production (icon scale, animation, sticker pack, etc.).

**The workflow:**
1. Run minimal prompt — let the model surprise you
2. Pick the strongest creative direction it produces
3. Write a Format A art-director brief that refines that direction (100–150 words, flowing, single paragraph)
4. Generate
5. Iterate one dimension at a time

**Only escalate to Format B engineering spec for batch/brand-system work.**

## When to use

- Mobile app icon mascot
- SaaS brand-illustration character (Linear, Notion, Stripe-style sets)
- Sticker pack / Lottie animation character
- Onboarding / empty-state companion
- Brand "buddy" for marketing materials

## When NOT to use

- Editorial illustration of a real subject → write a normal prompt, no character design needed
- Photographic product shot → `recipes/product-photo.md`
- Logo with no character body → straight typography/symbol prompt
- IP fan art of an existing character → use multi-reference compose with the source artwork

## Defaults

- **Size:** `1024x1024` (square — works for app icon, marketing, social)
- **Quality:** `high`
- **Variants:** ALWAYS run `-n 4`. Mascots benefit massively from variant selection — picking 1 of 4 designs is the workflow, not a luxury
- **Backend:** API (parallel variants matter; codex runs sequentially)

## Workflow phases — Discovery → Concept Lock → Production → Maintenance

Mascot work moves through four phases, each with a different default format and discipline:

**Discovery** — you don't know what the mascot should look like yet. Run minimal prompts ("surprise me") with low prescription. Goal: surface 2–3 viable directions. Format: 5–10 line minimal prompt. Don't lock anything.

**Concept Lock** — you've picked a direction. Now write the canon prompt that produces it reliably. Use Format A art-director brief (~150 words, flowing) or Format A.5 Codex labeled-prose (~170 words, structured by labels) — see Step 3.5 for when to use which. The prompt that produces the canon ships becomes your project's prompt pack.

**Production** — every render uses the locked canon prompt + small variant deltas (e.g., "use canon, change pose to waving"). NEVER rewrite canon prose mid-production; that's how drift happens. Variants are deltas, not rewrites.

**Maintenance** — model behavior drifts over time, or scope grows. Re-validate the canon if outputs degrade. If you intentionally re-canonize (e.g., new product direction), do it deliberately as a re-Discovery, not as a Production-time tweak.

**Build a project prompt pack as a deliverable** — once you reach Concept Lock, capture the canon as a project-level artifact (commonly `docs/design/MASCOT_PROMPT_PACK.md` or similar). See "Build your project's prompt pack" below for the template.

## Step 0 — Write the character bible BEFORE describing anatomy

Per modern mascot-design research (masko.ai, ziggle.art, design4users), **the
single biggest mistake teams make is jumping to "what does it look like"
before "who is it."** Write these five things in the prompt FIRST. They
constrain every visual decision that follows.

```
Name: [single short word — Pip, Duo, Andy, Snoo]
One-sentence essence: [what this character does and why anyone would care]
Personality: [3-5 adjectives — "cheerful, dependable, slightly proud,
              nimble, curious"]
Reacting RIGHT NOW to: [one specific user-state moment — "just delivered a
                        record" / "celebrating a streak" / "noticing a
                        missing field"]
Voice samples (the character bible's anchor):
  - Win state: "[short phrase]"
  - Failure / missing data: "[short phrase]"
  - Idle: "[short phrase]"
```

Why this works: gpt-image-2 follows long instruction-style prompts well,
but a mascot's "feel" emerges from posture and expression — both of which
flow from personality. Without a bible, the model defaults to "happy
friendly modern" which produces a Slack-blob. With a bible, "quietly
proud, just delivered something" produces a chest-out posture, a slight
head tilt, and attentive eyes — exactly what makes Duo and Andy feel
*alive*.

**Cap distinctive characteristics at 3.** Duolingo Duo is: green color +
rounded body + oversized expressive eyes. Three things. Octocat: octopus
tentacles + cat. Two things. List your three (or two) at the top of the
SUBJECT block and constrain the rest.

## Step 0.5 — Concept gut check (run this BEFORE picking an anchor)

The style anchor and the subject have to be physically coherent. Common
broken concepts that produce nonsense:

- "Origami [non-foldable object]" — origami works for foldable forms
  (cranes, foxes, swans). Don't force it on objects that aren't paper-
  folded (binders, phones, coffee cups). The model will resolve the
  contradiction by producing a paper bag with the object's name on it.
- "Designer toy [abstract concept]" — vinyl figures need a body. Don't
  ask for "a designer toy of trust" or "a Bearbrick of productivity."
- "Flat geometric [photoreal subject]" — flat geometric works for
  designed characters, not for realistic subjects in disguise.
- "Anthropomorphized [the product]" — sometimes the right move is a
  CHARACTER that USES the product, not a character that IS the product.
  Mailchimp Freddie isn't a stamp — he's a chimp who delivers mail.
  Pip isn't a binder — he's a crane that carries a record tag.

Gut check: would a designer at Linear / Stripe / Headspace draw this
concept? If the answer is "they'd push back on the brief," fix the
brief before prompting.

## Step 1 — Pick the right anchor

The single most important choice. The model's default for any "cute character mascot" is a generic round blob with stub arms — Slack-emoji-derivative. To break out of that gravity well you have to anchor to a *specific named brand mascot or designer*. Pick from where the mascot will live, not from what feels premium in the abstract.

| Where it lives | Style anchor | Avoid |
|---|---|---|
| **Mobile app icon + onboarding** | Flat geometric vector. Anchors: Reddit Snoo, Duolingo Duo, MetaMask origami fox, GitHub Octocat, Things 3, Pocket bird | 3D vinyl, designer toy, photoreal |
| **SaaS brand illustration system** | Flat editorial illustration. Anchors: Linear's character set, Notion brand illos, Stripe brand illustrations, Headspace Andy | chibi, over-cute, anime |
| **Premium B2B / fintech** | Minimal geometric mark. Anchors: Stripe, Things 3, Linear, Arc Browser | colorful, playful, animal-cartoon |
| **Children's app** | Soft watercolor or chunky cartoon. Anchors: Khan Kids, Sago Mini, Toca Boca, Beatrix Potter | corporate-flat, photoreal |
| **Game IP character** | Match the game's art direction. Pixel / low-poly / painted | generic 3D blob, default cute |
| **Designer collectible / merch** | Matte vinyl figure. Anchors: Bearbrick, Funko, Medicom Toy, Daniel Arsham, Pop Mart | flat-vector (looks cheap on a shelf) |
| **Editorial / content brand** | Restrained character work. Anchors: Mailchimp Freddie, MailerLite, MetaMask fox, Duolingo Lily | cute-overload, sparkles, rosy cheeks |
| **Loading / splash screen single-color** | Monoline / silhouette character. Anchors: Octocat single-color, Twitter old logo bird, Things 3 mark | painterly, multi-tone |

**Rule**: name ONE specific anchor in the prompt, not a list. "Linear's character set" is a contract; "Linear-inspired flat-vector friendly modern" is mush.

## Step 2 — Mobile-app-mascot rules (the most common case)

If the mascot will live in a mobile app — icon, splash, onboarding, sticker — these are non-negotiable:

1. **Silhouette test**: filled solid black at 64×64px, the character must be uniquely identifiable as your brand. If it could be any other app's mascot, redesign.
2. **Front view OR 3/4 view, never pure side profile.** Side profile loses the face — fatal for app icons.
3. **One signature feature**: ONE thing only this character has — specific ear shape, accessory, marking, color block, or pose. Two = noise, three = no identity.
4. **Generous safe area**: character occupies ~65% of frame. App icons crop aggressively; padding saves you.
5. **Eye-level or slight low angle camera** — never looking down at the user.
6. **Flat color blocks, ≤2 shading tones per surface** — animator-friendly, scales to icon, prints to merch.
7. **3–5 colors total, including background.** More = unscalable across surfaces.

## Step 2.5 — Praise-language substitution table (gpt-image-2-specific)

Per OpenAI's cookbook: avoid "cute, charming, beautiful, premium, stunning" — they're praise without observable content. Replace with concrete observable phrases. This is especially load-bearing for character work because adjectives like "cute" pull the model toward children's-book defaults.

| Don't say | Say instead |
|---|---|
| "cute character" | "kind expression, gentle eyes" |
| "charming mascot" | "brave but warm demeanor" |
| "beautiful design" | "[name material]: brushed paper, flat folds, two-tone shading" |
| "stunning mascot" | "balanced silhouette with one signature accessory" |
| "professional look" | "Inter Bold typography, 8px grid spacing, single accent color #1F6B6B" |
| "playful and fun" | "head tilted 5° camera-left, weight on one leg, gaze meeting viewer" |
| "premium quality" | "two shading tones per surface, no gradients, crisp polygon edges" |
| "iconic" | "instantly recognizable in solid black silhouette at 64×64px" |

Rule: every adjective should be testable. "Premium" isn't testable; "two shading tones per surface" is.

## Step 3 — Anti-patterns the model defaults to (suppress these explicitly)

This is the table you didn't know you needed. Each row is a real failure mode this skill has produced.

| Default the model produces | Why it happens | Suppress with |
|---|---|---|
| "Smiling round blob with stub arms" (Slack/Discord/Trello/Wumpus derivative) | "Anthropomorphized object character with face" averages to this | Anchor to a SPECIFIC named brand mascot, NOT "flat character illustration" |
| 3D vinyl figure when you wanted a flat app mascot | Words like "matte finish," "vinyl," "premium" pull rendering toward Bearbrick / Funko | Say `flat 2D illustration` AND explicit `no 3D rendering, no specular highlights, no ambient occlusion, no rendered material finish` |
| Realistic anatomy when you wanted a designed character | Naming a breed/species ("golden retriever") pulls toward photoreal | `designed character proportions, simplified geometric anatomy, NOT realistic, NOT photographic` |
| Generic two-dot eyes + curve mouth | Default cute-blob template | Specify a personality archetype + asymmetric features (one raised eyebrow, sideways glance, head tilt) |
| Cute-overload (sparkles, rosy cheeks, hearts, stars) | "Cute" pulls toward children's-book mode | Constraints: `no sparkles, no rosy cheeks, no decorative markings, no hearts, no stars, no flowers` |
| Unrecognizable at icon size | Too much detail, complex silhouette | Bold geometric shapes only, large face features, single signature accessory |
| Symmetric and lifeless | Strict symmetry reads as static / corporate | Asymmetric pose, head tilt 5–10°, off-center eye/eyebrow detail |
| Generic SaaS-character mush | "Linear-style flat character" without a real anchor | Cite the actual brand by name + cite a specific designer if known (e.g., "Headspace's character system designed by Andy Puddicombe's team") |
| Wrong species when you wanted species-neutral | Listing "dogs and cats" gets you a hybrid weirdo | Pick an OBJECT or abstract character if your audience is multi-species. Don't ask the model to abstract animals on its own |

## Step 3.5 — Format: art-director brief vs engineering spec

The prompt FORMAT matters as much as the content. Two valid formats, different use cases:

### Format A — Art-director brief (PRIMARY, default for one-off mascots)

This is what the freestylefly / EvoLink / Anil-matcha gallery prompts use. **Single flowing paragraph, 100–150 words, comma-separated visual specs, style anchor at the end, negatives as a flowing comma list at the very end.** No section headers. No formal blocks. Conversational and evocative.

Why it works: gpt-image-2 has strong creative interpretation. A flowing brief gives it room to compose; a labeled spec sheet suppresses it. The model performs better when it can read the prompt as a coherent vision rather than a checklist.

**Template:**

```
[ONE OPENING SENTENCE — what the image is and what it's for].
[FLOWING COMMA-SEPARATED VISUAL DESCRIPTION — character, materials, pose,
expression, accessories, palette, lighting, composition, all in prose].
Style: [STYLE ANCHOR — one or two named brand mascots or designers] —
[2-3 atmospheric phrases that set quality target]. [NEGATIVES AS COMMA
LIST: no X, no Y, no Z, no W].
```

**Worked example — the canonical PetBinder mascot (Pip the binder character)**:

```
Flat 2D editorial illustration of a premium iOS app icon mascot for
PetBinder. An anthropomorphized navy hardcover document binder character
with two simple stub arms holding a small cream clipboard with three
checkmarks and a tiny gold paw print. Soft hardcover navy body with brass
corner accents and a spine band, colored tabbed dividers (cream, sage,
terracotta) peeking from the side. Gentle closed-eye smile, calm warm
posture, standing centered. Warm off-white background, generous negative
space, soft directional light from upper-left. Style: Linear's character
system meets Things 3 brand mark and Headspace's restrained character
work — flat color blocks, two-tone shading, single deep-teal accent on
the clipboard tab, premium and trustworthy, designed for app icon
clarity at any scale. No 3D rendering, no specular highlights, no
gradients, no decorative leaves or background flourishes, no anime
sparkle eyes, no cute-blob smile template, no realistic paper textures.
```

That's 144 words. One paragraph. No `INTENT:`, no `--- SUBJECT`, no `DEFINITION OF DONE`. Produced the canonical PetBinder mascot in one shot.

**Why this beat the 96-line engineering spec on the same backend, same concept, same model**: the engineering spec told the model exactly what to draw at the cost of foreclosing creative composition. The brief told it the *vision* and let it compose.

### Format A.5 — Codex labeled-prose pattern (ALTERNATIVE for slot-fillable canon work)

Same length range as Format A (~150–170 words) but organized as labeled prose blocks instead of flowing paragraph. Each label gets a short prose value; "Must keep" and "Avoid" are bullet lists at the end. Example labels: `Subject:` / `Tone:` / `Style:` / `Palette:` / `Expression:` / `Pose:` / `Must keep:` / `Avoid:`.

**When Format A.5 wins over Format A**:
- Your canon has 6+ named constraints that need explicit slots (e.g., a brand mascot with locked palette, locked pose family, locked accessories, locked text rules)
- You're writing variant prompts that derive from a canon by swapping one labeled section (e.g., "use canon, change `Pose:` to waving, keep everything else") — labeled-prose makes the delta explicit
- You're building a project prompt pack with multiple state variants (welcome / empty / success / marketing) where the per-variant deltas are easier to audit when each variant lists which labels changed

**When Format A still wins**:
- One-off renders where narrative flow helps the model compose creatively
- Discovery-phase exploration that's bridging into Concept Lock
- Prompts under 100 words where labels add overhead without payoff

**Empirical note**: validated against Format A on Pip canon (n=8 renders, 4 per format) on 2026-05-07. Both formats produced 5/5 best-of-4 on the rubric — see `.omc/research/upgrade-validation/phase-1/format-ab/scoring.md`. Tie at maximum quality. Format A stays primary for one-off creative work; Format A.5 wins for slot-fillable canon and variant series. Status quo (Format A) wins ties per Principle 3 ("Empirical wins over taste").

**Worked example template**:

```
[Opening sentence: what the image is + 1-line key constraints]

Subject: [committed concept description, 2–3 sentences in flowing prose]

Tone: [adjective list, what it should/shouldn't be]

Style: [render direction, named anchor]

Palette:
- [color 1 with role]
- [color 2 with role]
- [accent]

Expression:
- [eye state]
- [emotional read]

Pose:
- [posture]
- [weight]

Must keep:
- [non-negotiable 1]
- [non-negotiable 2]
- [readable silhouette at app-icon scale]

Avoid:
- [forbidden default 1]
- [forbidden default 2]
- [3D rendering / gradients / extra props as applicable]
```

### Format B — Engineering spec (ESCALATION, for batch / brand-system / production)

Use the formal-block format below ONLY when:
- Generating a series with strict consistency requirements (sticker pack, expression sheet)
- Building a brand-character system across many touchpoints
- An agent is composing the prompt programmatically (slot-by-slot)
- The image has 6+ independent visual subsystems that need verbatim consistency on regeneration

For one-off mascot exploration, default to Format A. Escalate only when slot-filling actually pays off.

## Step 4 — Engineering-spec skeleton (escalation path only)

**Critical gpt-image-2 rule**: the first ~50 words of your prompt carry disproportionate weight. The model treats whatever comes first as the anchor and everything else as secondary detail (per OpenAI's cookbook + fal.ai's prompting guide). So lead with the SUBJECT — a 2–3 sentence concrete description of the character — BEFORE intent framing, character bible, or style anchors.

The character bible from Step 0 is for *your thinking*. The prompt body should be ordered for *the model's reading*. Don't conflate the two.

OpenAI's canonical 5-part structure: **Scene → Subject → Key Details → Use Case → Constraints**. For mascots specifically, lead with subject (since the scene is just "flat off-white background") and reorder accordingly:

```
[SUBJECT — 2–3 sentences in the first 50 words, NO labels]
A small designed [character archetype] character with [3 distinctive
characteristics]. [Key posture / expression in one phrase]. [Style
anchor — ONE named brand mascot or designer].

[Now you have the model's attention. Continue with structured detail.]

--- CHARACTER IDENTITY
Name: [single word]
Personality: [3-5 adjectives — observable, not praise]
Reacting RIGHT NOW to: [one specific user-state moment]

--- SUBJECT (full design, NOT anatomy)
[Concrete character description with DESIGNED proportions — not realistic.
Lead with shapes (rounded triangle, soft trapezoid, folded paper plane),
not species or anatomy. Specify: body silhouette, head/body ratio if
applicable, posture, expression, gaze direction.]

Signature feature (the ownable hook): [ONE thing only this character has —
specific ear shape, accessory, marking, color block, or pose detail. Just one.]

--- TEXT (if any)
Quoted exactly: "[STRING]" — [position, font style, color]. No other text
anywhere in the image.

--- RENDER
Flat 2D illustration. Solid color blocks with at most TWO shading tones per
surface (one base, one shadow tone for dimension only). Clean vector-quality
edges. Crisp shapes. NO 3D rendering, NO specular highlights, NO ambient
occlusion, NO painterly brush strokes, NO realistic texture, NO gradients
on the body.

--- COMPOSITION
[Front view OR 3/4 view] — never pure side profile. Character occupies
~65% of frame, generous padding (~15%) on all four sides. Eye-level camera,
slight low angle so the character feels grounded.

Background: flat single color [#XXXXXX] — no texture, no gradient, no shadow
under the character.

--- PALETTE
3–5 colors with HEX codes:
- background: #XXXXXX
- character primary: #XXXXXX
- character secondary / shadow tone: #XXXXXX
- accent / brand color: #XXXXXX
- linework + features: #XXXXXX

--- FORBIDDEN
No 3D rendering, no vinyl/plastic finish, no specular highlights, no
ambient occlusion, no realistic anatomy, no painterly texture, no gradients
on the body, no gradient backgrounds, no drop shadows under the character,
no sparkles, no rosy cheeks, no hearts, no stars, no decorative flourishes,
no chibi disproportions [unless explicitly the chosen style], no extra props
beyond the signature feature, no text other than [STRING], no generic
Slack/Discord/Trello/Wumpus-style smiling blob template — this character
must have a unique silhouette.

--- DEFINITION OF DONE
- Silhouette test: filled solid black at 64×64px, the character is still
  uniquely identifiable as [PRODUCT] mascot, not "any happy app character"
- Personality clearly reads as [ARCHETYPE], not "generic happy"
- Signature feature is visually obvious in the first 0.5 seconds
- Style anchor [BRAND/DESIGNER] is recognizable in the rendering
- Works at app-icon scale (test by mentally shrinking to 60×60)
```

## Worked example — mobile app mascot (Pip the origami courier crane, PetBinder)

This example shows the full Step-0 character bible flowing into the prompt.
Generated successfully via codex backend, 1024×1024, single shot.

```bash
pixeltamer generate -o pip.png --size 1024x1024 -p '
INTENT
Brand mascot character "Pip" for PetBinder, an iOS app for pet owners
preparing handoff packets for boarding and sitters.

CHARACTER BIBLE (drives every visual choice — personality first)
Name: Pip
One-sentence essence: Pip is the diligent little paper crane who carries
pet records from owner to caregiver, neat and on time.
Personality: cheerful, dependable, slightly proud, nimble, curious.
Reacting RIGHT NOW to: just delivered a record successfully — quietly
proud of a job well done.

Reference aesthetic: Duolingo Duo character system meets origami folded
paper. Bright accent color, rounded body, oversized expressive eyes.

THREE DISTINCTIVE CHARACTERISTICS (the only three things that define Pip):
1. Origami paper-crane silhouette — pointed beak, folded angular wing
   planes, swept tail. Crisp paper folds visible as flat planes.
2. A small manila document tag tied to the beak with simple twine cord —
   Pip''s signature accessory.
3. Single deep-teal accent on wing tips and tag — the brand color is
   part of the character.

[... rest of skeleton: SUBJECT / TEXT / RENDER / COMPOSITION / PALETTE /
     FORBIDDEN / DEFINITION OF DONE — see full prompt in scratch/ ...]
'
```

**Why this version worked**: the binder-as-origami concept failed earlier
because binders aren't foldable. Pivoting the SUBJECT (crane that carries
the binder's record tag) instead of just the STYLE (origami) made the
anchor honest. The Duolingo formula (oversized eyes, single accent color,
simple silhouette) gave the character immediate personality.

## Worked example — original origami binder attempt (paper-bag failure case)

```bash
pixeltamer generate -o mascot.png --size 1024x1024 -n 4 --concurrency 4 -p '
INTENT
Brand mascot for PetBinder, an iOS app for pet owners preparing handoff
packets for boarding and sitters. The mascot lives as: app icon, splash
screen, onboarding companion, sticker pack.

Reference aesthetic: MetaMask origami fox style by 3Box Design — flat
geometric folded-paper illustration with crisp angular planes, single
clean color blocks, distinctive silhouette. NOT a 3D vinyl figure.

--- ARCHETYPE
The prepared friend — calm, attentive, ready to help. Reads as quietly
confident, not eager-puppy enthusiastic.

--- SUBJECT
A folded-paper origami character shaped from a manila document binder.
Body silhouette: a stylized folded-paper form with crisp angular planes —
imagine a binder origami-folded into a small standing figure with subtle
geometric facets. The folds suggest pages stacked inside.

Top of the body has a single tab fin sticking up like a crown — this is
the signature feature.

Face: two simple circular eyes (solid, no pupils), positioned centered
on the front face plane, with a single small triangular crease above the
left eye suggesting one raised brow (curiosity). No mouth — the character
expresses through posture and the eye placement.

Posture: standing centered, head tilted ~5° to camera-left, weight even.
No arms or legs — purely the folded-paper form.

--- TEXT
Tab label, quoted exactly: "READY"
Set in clean uppercase geometric sans (Inter Bold style), small, charcoal
text on the deep teal label. This is the only text in the image.

--- RENDER
Flat 2D vector illustration with crisp angular folds. Solid color blocks
with at most two shading tones per plane (a base color and one slightly
darker fold-shadow for geometric dimension). NO 3D rendering, NO specular
highlights, NO ambient occlusion, NO painterly texture, NO gradients.

--- COMPOSITION
Three-quarter view, character centered, occupies ~65% of frame, generous
padding on all sides. Eye-level camera with slight low angle.
Background: flat warm off-white #F7F2E9, no texture, no gradient, no
shadow under the character.

--- PALETTE
- background: #F7F2E9
- binder body primary: #D9C39A (warm manila)
- fold-shadow tone: #B89E70 (one step darker, used only on receding planes)
- tab label + accent: #1F6B6B (deep teal)
- eyes + brow crease: #2A2722 (rich charcoal)

--- FORBIDDEN
No 3D rendering, no vinyl finish, no specular highlights, no ambient
occlusion, no realistic paper texture, no painterly brush strokes, no
gradient on the body, no gradient background, no drop shadow under the
character, no sparkles, no rosy cheeks, no hearts, no decorative
flourishes, no extra props, no animals of any species, no paw prints,
no arms or legs, no smiling cute-blob features, no Slack/Trello-style
generic mascot template, no text other than "READY" on the tab.

--- DEFINITION OF DONE
- Silhouette test: filled solid black at 64×64px, immediately recognizable
  as a folded-paper binder character with the tab fin
- Personality: quietly attentive (the brow crease + head tilt do this)
- Signature feature: the tab fin crown is the brand silhouette
- Style anchor: MetaMask-fox / origami clarity is recognizable
- Works as a 60×60 app icon
'
```

## Worked example — flat editorial mascot (SaaS character set)

```bash
pixeltamer generate -o saas-mascot.png --size 1024x1024 -n 4 -p '
INTENT
Brand character for a B2B project-management SaaS called "Throughline."
Lives in: marketing site illustrations, empty states, error pages,
onboarding sequence. Must work as part of a 12-character set later.

Reference aesthetic: Linear character illustrations and Notion brand
illos — flat editorial, restrained, premium-but-warm, not cute.

--- ARCHETYPE
The thoughtful operator — gets things done quietly. Closer to a librarian
than a cheerleader.

--- SUBJECT
A small abstract human-ish figure with simplified geometric anatomy.
Round head, no facial features (no eyes, no mouth) — identity comes from
posture and silhouette only. Body: simple T-shirt and pants in two flat
colors. Standing pose, holding a single index card thoughtfully in one
hand, the other hand at side.

Signature feature: a square card with a single horizontal line on it —
this card appears in every character of the set.

--- TEXT
None.

--- RENDER
Flat 2D illustration. Solid color blocks, single subtle shadow tone per
surface. No facial features. No 3D, no specular, no gradients on body.
Editorial line economy — fewer details, more clarity.

--- COMPOSITION
Three-quarter view. Character on flat off-white #FAFAF8 background.
Generous padding. Eye-level.

--- PALETTE
- background: #FAFAF8
- skin tone: #E8C9A8
- shirt: #2D3340
- pants: #C8D4D9
- card: #FFFFFF with a single line in #2D3340

--- FORBIDDEN
No facial features (no eyes, no mouth, no nose), no 3D rendering, no
gradients, no specular, no ambient occlusion, no busy patterns, no logos,
no cartoon-cute styling, no chibi proportions, no decorative elements,
no shadow under the character, no text.

--- DEFINITION OF DONE
- Silhouette is unique enough to start a 12-character set
- Card-with-line motif is the visual hook
- Posture conveys "thoughtful" without facial expression
- Reads as Linear / Notion adjacent
'
```

## Composition tips

- **Anchor by name, not by mood.** "Reddit Snoo" beats "playful flat character." The model has seen Snoo; it has not seen "playful flat character" specifically.
- **Lead with shapes, not species.** "Rounded triangle body" works better than "small dog." Naming a species pulls the model toward realism.
- **The signature feature is the brand.** What's the one thing only this character has? Octocat = octopus tentacles + cat. Snoo = antenna ball. Duo = oversized eyes + green color. MetaMask fox = origami folds. Pick yours and commit.
- **No facial features can be the strongest move.** Linear / Notion / Things-style characters often have no eyes/mouth at all — identity comes from silhouette and posture. Try it before defaulting to two-dot eyes + curve mouth.
- **Run 4 variants minimum.** Mascot work is a selection problem, not a generation problem. The model produces 4 different valid interpretations of the same prompt; you pick one.
- **Self-verify with the 64×64 mental test.** Squint at the result. Can you still identify the brand? If not, the silhouette is too noisy.

## Build your project's prompt pack (deliverable pattern)

Once Concept Lock produces a canon mascot you're happy with, capture it as a project-level artifact so future regenerations don't drift. The pack lives in your project's docs (commonly `docs/design/MASCOT_PROMPT_PACK.md` — but the location is yours), and it's a small markdown file with five sections:

```markdown
# [Project] Mascot Prompt Pack

## Current decision

The project uses a [character archetype, one sentence] mascot family. Do not restart from:
- [concept that was explicitly considered and rejected]
- [another rejected concept]

The mascot should be: [3–5 traits]. It should NOT be: [3–5 anti-traits].

## Canon [name] base prompt

\`\`\`
[The exact prompt that produces the canonical mascot — verbatim, every constraint, every label]
\`\`\`

## Variant prompts

### [Variant name — Welcome / Empty state / Success / Marketing / etc.]

Use the canon prompt, but change [ONE labeled section, usually pose or expression] to:
- [delta line 1]
- [delta line 2]

Keep [things that must remain unchanged].

[Repeat for each variant your project needs.]

## Cleanup rules

Keep active:
- [path to canonical PNG]
- [path to canonical prompt file]

Keep as archived reference:
- [path to exploration PNGs]

Delete when superseded:
- [duplicate exports, old explorations]
```

**Why this matters**: months from now, you (or a future agent / Codex / Claude session) will need to make a sticker pack, an onboarding variant, a holiday animation. Without a pack, every regeneration risks drift away from the canon. With a pack, every new asset is a small *delta* from a known canon — variant prompts state "use canon, change pose to X, keep everything else."

**The pack is YOUR artifact, not the skill's.** This recipe teaches the pattern. The pack itself lives in your project's docs and you maintain it across the lifetime of the brand.

A real-world reference pack exists at `MASCOT_PROMPT_PACK.md` in the PetBinder project (path varies — check the project's `docs/design/` or equivalent). It illustrates the variant-delta pattern in production.

## Common failure modes

| Symptom | Most likely cause | Fix |
|---|---|---|
| Generic Slack-blob result | Style anchor too vague | Replace "flat character illustration" with ONE specific named mascot or designer |
| 3D vinyl figure when you wanted flat | "Premium," "matte," "vinyl" leaked rendering hints | Add explicit `no 3D rendering, no specular, no ambient occlusion`; use word "flat" 3+ times |
| Photoreal animal instead of designed character | Named a breed/species | Lead with shapes ("rounded triangle body"), not species; add `designed proportions, NOT realistic` |
| Cute-overload (sparkles, blush, hearts) | "Cute" pulled toward children's-book | Drop the word "cute"; replace with archetype ("calm helper"); list decorations as forbidden |
| Faces all look the same across variants | Too many face spec details | Reduce face spec; let posture + signature feature carry identity. Often: remove face entirely |
| Doesn't read at icon size | Too much detail | Bigger features, simpler silhouette, fewer colors, kill the linework |
| Symmetric and corporate | Strict symmetry in the prompt | Add asymmetric pose detail (head tilt 5–10°, off-center accessory, weight on one leg) |
| Wrong species (dog/cat hybrid weirdo) | Asked model to be species-neutral | Use an OBJECT mascot or abstract figure; don't ask the model to average species |
| Tab label / accessory text misspelled | Quoted text once, model fudged it | Quote text TWICE — once in TEXT block, once in CONSTRAINTS reminder |

## Character series — multi-image consistency (the system problem)

Per wuyoscar's gpt_image_2_skill insight: *"character design is a system problem, not a single-image problem."* For sticker packs, expression sheets, and multi-character brand sets, you need explicit consistency anchors that get **repeated verbatim on every iteration**.

OpenAI's children's-book pattern (cookbook § 6.4):

```
Scene: [new action / environment, clearly described]

CHARACTER CONSISTENCY (repeat verbatim on every generation):
- Same [outfit details — list every visible element]
- Same [facial features, proportions, palette]
- Same [personality / pose family]

Style: [identical to anchor image]

Constraints:
- Do not redesign the character
- Character appearance must remain unchanged
- [Other hard locks: no text drift, no new accessories]
```

**The verbatim-repeat rule**: copy the consistency block character-for-character into every prompt in the series. Paraphrasing introduces drift; verbatim repetition keeps the character locked.

**Multi-view sheet shortcut**: instead of N separate prompts, ask for one "character reference sheet" image with three-view drawings (front / side / back), expression set (idle / win / failure / surprise / sleepy / wave), and a color palette callout. This is wuyoscar's "compress identity, wardrobe, and palette into one anchor" pattern. Then use that sheet as a `pixeltamer compose -i sheet.png` reference for every downstream generation.

## When to escalate

- For a multi-character set with consistency requirements → generate a character reference sheet first, then `pixeltamer compose` with the sheet as the anchor image.
- For animated mascots (Lottie / Rive) → generate the rest pose first, then generate the expression sheet using the verbatim consistency block above.
- For app icon specifically → generate the mascot at 1024×1024, then use `references/post-process.md` to crop and scale to icon sizes.

## Sources informing this recipe

- OpenAI Cookbook: [GPT Image Generation Models Prompting Guide](https://developers.openai.com/cookbook/examples/multimodal/image-gen-models-prompting-guide) — canonical 5-part structure (Scene → Subject → Details → Use Case → Constraints), praise-language guidance, character-consistency pattern from § 6.4.
- [fal.ai prompting guide](https://fal.ai/learn/tools/prompting-gpt-image-2) — first-50-words priority, anchor-image-then-repeat technique.
- [wuyoscar/gpt_image_2_skill](https://github.com/wuyoscar/gpt_image_2_skill) — character-as-system-problem framing, multi-view reference-sheet pattern.
- [masko.ai mascot guide](https://masko.ai/blog/best-app-mascots) + [ziggle.art](https://ziggle.art/how-to-create-a-mascot) — personality-first design, 2–3 distinctive characteristics rule, Duolingo Duo formula (oversized eyes, single accent color, simple silhouette).
- [Anil-matcha/Awesome-GPT-Image-2-API-Prompts](https://github.com/Anil-matcha/Awesome-GPT-Image-2-API-Prompts) + [EvoLinkAI/awesome-gpt-image-2-prompts](https://github.com/EvoLinkAI/awesome-gpt-image-2-prompts) + [freestylefly/awesome-gpt-image-2](https://github.com/freestylefly/awesome-gpt-image-2) — corpus of working character/mascot prompts mined for pattern extraction.
