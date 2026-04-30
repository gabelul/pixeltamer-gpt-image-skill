---
name: pixeltamer
description: |
  Generate, edit, and compose images with gpt-image-2. Two backends — OpenAI API key
  or codex CLI (uses your ChatGPT subscription, no key needed). Three modes —
  one-shot generate, multi-image batch with verification, and multi-reference
  composition (up to 16 inputs blended into one). Use when the user asks to make
  an image, generate a poster, draw a mockup, design an icon, create an ad creative,
  build an infographic, blend reference images, edit or inpaint an existing image,
  or anything else that ends in a PNG.
license: MIT
metadata:
  author: gabelul
  version: "0.1.0"
  tags:
    - image-generation
    - gpt-image
    - claude-code-skill
    - codex-cli
    - opencode
    - openai-api
    - chatgpt-subscription
    - infographic
    - ui-mockup
    - poster
    - editorial
    - ai-image
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
  - Grep
  - Glob
  - AskUserQuestion
---

# pixeltamer — generate, edit, and compose images with gpt-image-2

Image generation that actually does what you asked for. Two backends so you don't have to pick a side: bring an OpenAI API key OR use the codex CLI signed in to your ChatGPT subscription. Same skill, same prompts, same output format, your choice of how to pay.

## When to use this

Trigger this skill when the user asks for any of:

- A new image, poster, illustration, photograph, mockup, icon, sticker, sprite, logo, hero, infographic, ad creative, scroll-stop card, magazine cover, podcast art, product shot, banner, OG image, social card, character reference sheet, app screen, dashboard mockup
- An *edit* of an existing image (modify, inpaint, mask, change-only-X)
- A *composition* of multiple reference images blended into one
- A batch of related images to be generated together with verification

If the request is "make me an image" or any flavor of it, this is the skill.

## Prerequisites — check the install (do this BEFORE the first generation)

Run this first to see what's available:

```bash
pixeltamer doctor
```

If the output shows at least one backend with a `✓` marker, you're set — go generate. Auto-detect picks API if a key is set, otherwise codex. Override with `--backend api|codex` per-call or set `PIXELTAMER_BACKEND` env var.

If BOTH backends show `✗`, **do not run `pixeltamer config`** — it's an interactive prompt that needs a real TTY, which the Bash tool doesn't have, so the call hangs forever. Use `AskUserQuestion` instead and offer the user this choice:

> "Pixeltamer needs one of two backends. Pick:
>  **API key** — fastest, full feature set (edit + compose), per-image cost.
>  **Codex CLI** — uses your existing ChatGPT Plus/Team/Enterprise subscription, no key, generation only."

### If the user picks API

Tell them to drop their key in pixeltamer's config dir. This is the cleanest path because the Python script auto-loads it on every invocation — no shell restart, no env-var management:

```bash
mkdir -p ~/.config/pixeltamer
echo 'OPENAI_IMAGE_API_KEY=sk-yourkeyhere' > ~/.config/pixeltamer/.env
chmod 600 ~/.config/pixeltamer/.env
```

If their org isn't verified for gpt-image-2, the first call returns 403 — point them at https://platform.openai.com/settings/organization/general for the one-time verification.

If they prefer dotfiles instead, `export OPENAI_API_KEY="sk-..."` in `~/.zshrc` (or `.bashrc`) works too — but they'll need to **restart the agent** so the new env is inherited. The `.env` file path doesn't have that requirement.

### If the user picks codex

```bash
# 1. install codex if missing
npm install -g @openai/codex

# 2. log in (opens a browser, OAuth via ChatGPT)
codex login

# 3. confirm
codex login status
```

No restart needed. The bash backend reads codex auth fresh on every invocation.

### After the user sets things up

Re-run `pixeltamer doctor` to confirm. Then proceed with the original request.

## Three modes

### Mode 1 — One-shot generation

```bash
pixeltamer generate -p "<prompt>" --size 1024x1024 --quality high -o output.png
```

Or the shortcut, which infers `generate`:

```bash
pixeltamer "Create a pitch-deck slide titled..."
```

For exploration, fire 4 in parallel:

```bash
pixeltamer generate -p "..." -n 4 --concurrency 4 -o variants/
```

### Mode 2 — Edit / inpaint (API only)

```bash
# Modify a single existing image
pixeltamer edit -i source.png -p "Change ONLY the sky to overcast. Preserve everything else exactly." -o edited.png

# With a mask — white pixels regenerate
pixeltamer edit -i source.png --mask mask.png -p "..." -o edited.png
```

Codex's `image_gen` tool doesn't support edits. If the user wants an edit and only codex is available, tell them they need an API key for that.

### Mode 3 — Multi-reference composition (API only)

Pass 2–16 reference images to be blended into a single output via `/images/edits`:

```bash
pixeltamer compose \
  -p "Reference 1 is the product. Reference 2 is the kitchen scene. Compose: place the product on the counter with morning window light from the left." \
  -i product.png \
  -i kitchen.png \
  -o composed.png \
  --size 1536x1024
```

This is the killer feature. See `references/multi-reference.md` for the labeling pattern that actually works.

### Mode 4 — Batch (multi-image plan with verification)

For projects that need 4+ related images (a website's hero + features + footer + social), use the batch state machine. Workflow:

1. Survey what images are needed.
2. Plan a `prompts.md` with one entry per image (target path, format, native size, optional reference, status, prompt).
3. Generate each one, calling the right backend per entry.
4. Run `pixeltamer batch <path-to-prompts.md>` to verify every output (file exists, dimensions match, file size sane).
5. Visually self-review each generated PNG using the `Read` tool; demote to `failed:<reason>` if it doesn't match the prompt.
6. Re-generate only the failed entries.

The `prompts.md` format is parsed by the verifier in `scripts/verify-images.mjs`. See `references/multi-reference.md` for the structure.

## Workflow — what to do when invoked

1. **Understand the request.** Identify the mode (generate / edit / compose / batch). Identify the recipe (infographic / ad / poster / mockup / etc) — load it from `recipes/` if one fits.
2. **Read references when relevant.** Load `references/prompting.md` for any non-trivial prompt. Load `references/ui-mockup-prompting.md` for UI work. Load `references/multi-reference.md` for compose mode. Don't dump every reference into context — pull only what's needed.
3. **Resolve unspecified params.** Pick a sensible size based on the use case (see the size table in `references/prompting.md`). Default `--quality high`. Pick a backend if the user didn't specify.
4. **Build the prompt.** Apply the canonical structure: Intent → Scene → Subject → Details → Text → Style → Constraints. Drop magic words ("8K, ultra detailed, masterpiece, professional"). Quote any text that should appear in the image. Specify what to preserve on edits.
5. **Generate.** Call the right `pixeltamer` subcommand. Print the resulting absolute path.
6. **Visually self-verify.** Use the `Read` tool to view the generated PNG. Judge it against the prompt:
   - Does the subject match?
   - Is the text rendered correctly and spelled exactly as quoted?
   - Are there obvious artifacts (warped anatomy, misspellings, glitched typography)?
   - Does the composition match what was asked?
   If it fails — say so honestly. Don't paper over a bad result with "looks great!"
7. **Iterate or hand off.** If the result is wrong, change ONE dimension and regenerate (see iteration table in `references/prompting.md`). If the result is good, surface the file path to the user.

## Visual self-verification — non-negotiable

Every generated image gets `Read`-loaded back and visually judged before claiming success. Image generation is stochastic; "API call succeeded" doesn't mean "the image is what was asked for". This step catches:

- Misspelled or paraphrased text overlays
- Wrong subject (a coffee shop instead of a coffee cup)
- Visual artifacts (warped hands, glitched typography, extra limbs)
- Wrong aspect ratio framing (subject too small or cropped)
- Off-brand color or tone

When something is wrong, the right move is usually to change ONE thing in the prompt and regenerate, not to bolt three new clauses on hoping one helps.

## Output format — what to tell the user

After a successful generation, surface:

- Absolute file path (the script prints this on stdout)
- One sentence on what was generated (e.g. "Generated a 1024×1536 portrait cover with the headline rendered exactly")
- If multiple variants (`-n N`), list all paths

After a self-verified failure:

- Explain what went wrong (text was paraphrased, subject was generic, etc.)
- Suggest the single most likely fix and offer to regenerate
- Don't auto-regenerate without the user's nod — they may want to tweak the prompt themselves

## Recipes available

`recipes/infographic.md` · `recipes/meta-ad.md` · `recipes/viral-linkedin.md` · `recipes/ui-mockup.md` · `recipes/editorial-cover.md` · `recipes/product-photo.md`

Load the matching one when its trigger fits. They contain prompt skeletons, worked examples, sizing defaults, and common-failure tables.

## References available

`references/prompting.md` — the doctrine. Canonical structure, what NOT to say, style/composition/lighting vocabulary.
`references/api-backend.md` — API specifics, env vars, troubleshooting.
`references/codex-backend.md` — codex CLI specifics, both invocation patterns, tradeoffs.
`references/multi-reference.md` — compose mode mastery, labeling patterns, reference set sizing.
`references/post-process.md` — compress, resize, convert, alpha-extract, combine.
`references/ui-mockup-prompting.md` — analogy vs inventory style, real-data over placeholders, asset codification.

Pull only what's needed for the current job. Don't dump them all.

## Common mistakes — drop these patterns

| Don't | Why |
|---|---|
| "8K, ultra detailed, masterpiece, trending on artstation" | Old-model magic words. gpt-image-2 ignores them or worse. |
| "professional, beautiful, premium, stunning" | Praise language with zero instructional content. |
| Generating before checking which backend is available | Run `pixeltamer doctor` first if it's the first call this session. |
| Multi-image input on the codex backend | Codex's `image_gen` tool is generation-only. Use the API for edits / compose. |
| Skipping visual self-verification | Image gen is stochastic. "API succeeded" ≠ "image is correct". |
| Stacking three new clauses when one isn't working | Change one dimension at a time. You won't know what helped otherwise. |
| Running examples folder PNGs as ground truth | They're demonstrations, not specs. Composition will vary on regen. |

## Backend cheat sheet

| Need | Use |
|---|---|
| Fastest single image | API |
| Don't have / don't want an API key | codex |
| Edit / inpaint an existing image | API only |
| Compose 2–16 references into one | API only |
| Run on a teammate's machine without sharing credentials | codex (each user signs in separately) |
| Custom OpenAI-compatible host (jmrai, ZenMux, OpenRouter) | API with `OPENAI_IMAGE_BASE_URL` set |
| Largest sizes (4K) at high quality | API; codex's reasoning loop gets slow for large outputs |

## Persona note

Output (file path, success message, failure explanation) should be terse and useful. No hype, no "here's your stunning generated masterpiece" framing — that's the kind of slop pixeltamer is supposed to help kill, not produce. Just: what was generated, where it lives, and what to do next.
