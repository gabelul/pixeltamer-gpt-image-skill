# playbook/

Curated, modernized prompts ready to remix. Different from `recipes/` — here you grab a working prompt and swap in your subject, you don't read methodology.

## Boundary rule (the one-sentence test)

> If you can swap the named subject and reuse the prompt verbatim → it belongs in `playbook/`.
> If it teaches method, structure, or decision-making → it belongs in `recipes/`.

When you're not sure, ask: "would this prompt still work if I replaced 'pet binder character' with 'coffee subscription character'?" If yes, playbook. If no (because the discussion teaches you *why* a binder works for that brief), recipe.

## Boundary policy (v1)

Existing recipe worked-examples STAY in `recipes/` as canonical teaching examples — see `BOUNDARY-AUDIT.md` for the per-file disposition. Future variants of those examples go into the matching playbook file instead of swelling the recipe body.

This is a documented exception, not a migration. v2 may revisit if drift makes it painful.

## Discipline checklist (every prompt earns its place)

Each prompt in this folder must pass all five:

1. **Subject-first** — the first ~50 words concretely describe what's in the image. No `INTENT:` / `FROM:` / meta-framing preamble before the subject.
2. **Magic-words stripped** — no `8K UHD`, `8K render`, `ultra-detailed`, `masterpiece`, `hyperrealistic`, `极致锐度`, `trending on artstation`. gpt-image-2 ignores or actively dislikes these.
3. **English-only** — Asian-language source prompts adapted to English unless the prompt subject IS the script (e.g., a poster *of* Chinese typography).
4. **Source-cited** — `Source: <repo-or-author> <case-id-or-path>` (URL when public, repo+path when local). Originals: `Source: Original — pixeltamer v1`.
5. **Why/Swap notes** — every entry has a 2–3 line "Why this works" + a 1 line "Swap X for Y to adapt." If you can't articulate either, the prompt isn't ready to ship.

## Source-citation format

```
Source: freestylefly cases.json case 31
Source: EvoLink cases/character.md case 5
Source: wuyoscar gallery-isometric (case 2)
Source: Original — pixeltamer v1
```

URL form when the repo is publicly linkable in the routing index; relative repo+path form is the v1 default.

## English enforcement

Human review during curation. No automated linter in v1. The reviewer's job: flag any prompt that contains untranslated source-language text where the subject of the image isn't the script itself.

If the prompt subject IS the language ("a poster of the Chinese phrase 山川茶事 in calligraphy"), the source-language text stays in quotes — that's literal text rendering, not language drift.

## v1 TODOs (deferred from open questions)

These were originally open questions in the upgrade plan. Downgraded to TODOs that ship if/when needed:

- **External URL public/private confirmation** — `references/index.md` external-references section uses GitHub repo roots (stable, public). If a referenced repo is private, switch to relative path with note.
- **Format A propagation policy** — whether the Codex labeled-prose pattern should propagate from `recipes/mascot.md` to other recipes (infographic, ui-mockup, etc.) is decided per-recipe with its own A/B if it comes up. Don't propagate without evidence.
- **Decay re-validation cadence** — every playbook entry has an implicit "validated against gpt-image-2 as of [date]" timestamp via git history. If model behavior shifts and entries drift, re-validate the affected file. No fixed quarterly schedule in v1.

## Staged backlog (v2 / v3 / v4)

The full playbook isn't done — v1 ships 2 files. The remaining ~18 categories from external corpora (wuyoscar `gpt_image_2_skill`, freestylefly, EvoLink, claude-image) are staged across three ralplan cycles. See `BACKLOG.md` for the per-stage file list, sources to mine, and effort estimates.

Quick summary:
- **v2** (5 files + 1 reference patch): scientific-figures, isometric, brand-systems, architecture-renders, illustration-styles + hermes-editing pattern fold-in
- **v3** (6 files): anime-manga, pixel-art, app-icons, cinematic, photography-styles, data-viz
- **v4** (7 files): fashion-editorial, tattoo-design, gaming-assets, retro-cyberpunk, events-experience, screen-mockups, beauty-lifestyle

Each stage is one ralplan + ralph cycle, independently shippable. **Niche audience is NOT a skip reason** — designers, illustrators, game devs, and brand teams all have legitimate use for the v3/v4 categories. The only true skip filter is "already covered by an existing recipe at full depth."

v2 also evaluates retrofitting YAML frontmatter so `references/index.md` can be auto-generated.

## v1 contents

- `README.md` (this file)
- `BACKLOG.md` — staged plan for v2/v3/v4 playbook files, with sources to mine and effort estimates
- `BOUNDARY-AUDIT.md` — per-file audit of existing recipe worked-examples
- `character-sheets.md` — multi-view reference sheets, expression sets, sticker packs
- `typography-posters.md` — type-led posters, dense-copy layouts, brand typography
