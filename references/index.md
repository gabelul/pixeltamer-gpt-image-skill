# pixeltamer routing index

When a request comes in, scan this map first. Load the smallest useful slice — one recipe or one playbook file or one reference, not all of them. If nothing matches, fall back to `references/prompting.md` plus the closest recipe.

Never write a prompt from scratch when a similar pattern exists in our recipes or playbooks.

## Routing map

| If the user wants… | Load this | Why |
|---|---|---|
| **Recipes** (deep how-to guides — methodology + skeleton + worked example + failure modes) | | |
| Brand mascot, app icon character, sticker pack, onboarding companion | `recipes/mascot.md` | Phased Discovery → Concept Lock → Production → Maintenance workflow with format choice (A flowing brief / A.5 Codex labeled-prose / B engineering spec) |
| Pitch-deck slide, framework diagram, statistic visual, comparison chart, listicle infographic | `recipes/infographic.md` | Canonical 7-part structure for educational visuals; failure modes specific to dense-information layouts |
| Meta / Instagram / Facebook ad creative with hook overlay | `recipes/meta-ad.md` | Hook + product + visual frame patterns for paid social |
| LinkedIn scroll-stop card, quote card, carousel cover | `recipes/viral-linkedin.md` | Engagement-pattern scroll-stop layout |
| Dashboard mockup, app screen, marketing page mockup | `recipes/ui-mockup.md` | UI dialect — analogy-vs-inventory layout, real-data over placeholders. Pair with `references/ui-mockup-prompting.md` |
| Magazine cover, book cover, podcast art, conference poster | `recipes/editorial-cover.md` | Hero image + masthead + headline + corner stamps. Image-led with type overlay |
| Product hero, lifestyle photo, packaging proof | `recipes/product-photo.md` | Commercial-photography vocabulary, lighting + camera direction |
| **Playbook** (curated remixable prompts — grab and swap your subject in) | | |
| Multi-view character reference sheet, expression set, sticker pack, pose library | `playbook/character-sheets.md` | 10 curated prompts for character-system work, extends `recipes/mascot.md` to multi-image deliverables |
| Type-led poster, dense-copy editorial layout, brand typography piece | `playbook/typography-posters.md` | 10 curated prompts for typography-as-hero compositions. Different from `recipes/editorial-cover.md` (image-led) |
| Understanding the boundary rule between recipes and playbooks, discipline checklist, source-citation format | `playbook/README.md` | Playbook meta — read once when contributing or when in doubt about whether content goes in `recipes/` or `playbook/` |
| Auditing existing recipe worked-examples against the boundary rule | `playbook/BOUNDARY-AUDIT.md` | Per-file disposition record (STAYS / CANDIDATE / CLEAR) for v1; v2 migration plan source |
| Planning the next playbook expansion (v2/v3/v4 stages, sources to mine, effort estimates) | `playbook/BACKLOG.md` | Staged backlog for ~18 future playbook files. Read before starting any v2+ ralplan. |
| **References** (cross-cutting doctrine and infrastructure) | | |
| Any non-trivial prompt — canonical structure, style vocabulary, JSON-vs-prose decision, front-50-words rule, praise-language substitution | `references/prompting.md` | The doctrine. Read first if no recipe matches. |
| Programmatic prompt construction, JSON-config schema, role-based opener, brand-consistency-across-many-images | `references/prompt-patterns.md` | Advanced construction patterns. Escalation path beyond `prompting.md` |
| Compose mode (2–16 reference images blended into one) | `references/multi-reference.md` | Labeling patterns + reference-set sizing for `pixeltamer compose` |
| Compress, resize, convert, crop, alpha-extract a generated PNG | `references/post-process.md` | Post-generation manipulation one-liners |
| UI / dashboard / app-screen prompts (paired with `recipes/ui-mockup.md`) | `references/ui-mockup-prompting.md` | UI dialect, asset codification |
| API backend troubleshooting, env vars, custom hosts (jmrai, ZenMux, OpenRouter) | `references/api-backend.md` | OpenAI API specifics |
| Codex backend troubleshooting, invocation patterns | `references/codex-backend.md` | Codex CLI specifics |

## External references

For questions our docs don't cover. These are stable, public, and worth checking when something feels under-documented here.

- **OpenAI Cookbook — GPT Image Generation Models Prompting Guide**: <https://developers.openai.com/cookbook/examples/multimodal/image-gen-models-prompting-guide>
  Use when: you need OpenAI's canonical Scene → Subject → Details → Use Case → Constraints structure, edit-pattern templates, or character-consistency techniques.
- **fal.ai — GPT Image 2 Prompting Guide**: <https://fal.ai/learn/tools/prompting-gpt-image-2>
  Use when: you want a parallel perspective on the same canonical structure with different worked examples.
- **wuyoscar / gpt_image_2_skill**: <https://github.com/wuyoscar/gpt_image_2_skill>
  Use when: you need a remix corpus we don't have — they organize 162 prompts across 30+ category-specific gallery files (anime, isometric, scientific figures, fashion editorial, pixel art, etc.). Their `craft.md` is a parallel doctrine to our `prompting.md`.
- **freestylefly / awesome-gpt-image-2**: <https://github.com/freestylefly/awesome-gpt-image-2>
  Use when: you want a corpus of working prompts from X / Twitter creators, organized by category. Many use legacy magic words ("8K UHD") — strip those when adapting.
- **EvoLinkAI / awesome-gpt-image-2-prompts**: <https://github.com/EvoLinkAI/awesome-gpt-image-2-prompts>
  Use when: you need character-design or ad-creative prompt patterns with attribution to original creators on X.
- **Anil-matcha / Awesome-GPT-Image-2-API-Prompts**: <https://github.com/Anil-matcha/Awesome-GPT-Image-2-API-Prompts>
  Use when: you want ready-to-use prompts curated for the OpenAI API — portraits, posters, UI mockups, game screenshots, character sheets.

## Decision-tree fallbacks

When the request is genuinely ambiguous between two recipes:

- **Mascot vs editorial-cover**: is the *character* the deliverable, or is the *cover layout* the deliverable? Character → `mascot.md`. Cover → `editorial-cover.md`.
- **Infographic vs ui-mockup**: is it data + framework + concept, or is it interface + screen content? Data → `infographic.md`. Interface → `ui-mockup.md`.
- **Editorial-cover vs typography-posters**: is the hero an image with type overlay, or is the type itself the hero with no/minimal image? Image-led → `editorial-cover.md`. Type-led → `playbook/typography-posters.md`.
- **Recipe vs playbook**: are you learning *how* to do this category of work, or do you have a subject and just need a remixable prompt? Learning → recipe. Remixing → playbook.

When still ambiguous, ask the user one disambiguating question. Don't guess between two equally-good recipes — guess wrong and the prompt drifts.

## Maintenance note

When you add a new recipe, playbook, or reference, add a row here in the same edit. The staleness test at `tests/index-staleness.test.mjs` enforces this — every file under `recipes/`, `playbook/`, `references/` must appear in this index by relative path. CI fails otherwise.
