---
name: pixeltamer
description: Generate, edit, compose images via gpt-image-2. Two backends (OpenAI API or codex CLI), three modes (one-shot, batch, multi-reference). Use for any image-make request.
version: 0.1.0
author: gabelul
tags: [image-generation, gpt-image, claude-code-skill, codex-cli, ai-image]
---

**Platform:** OpenClaw (token-optimized)

## Triggers

Make/generate/draw an image, poster, illustration, mockup, icon, sticker, sprite, hero, infographic, ad, scroll-stop, magazine cover, podcast art, product shot, banner, OG, social card, character sheet, app screen, dashboard. Edit/inpaint/mask an existing image. Compose 2–16 references into one.

## Backends

| Backend | Auth | Strengths | Limits |
|---|---|---|---|
| `api` | `OPENAI_API_KEY` / `OPENAI_IMAGE_API_KEY` | fastest, all modes, custom hosts | per-image cost, org must be verified for gpt-image-2 |
| `codex` | `codex login` (ChatGPT subscription) | no API key, included in plan | generate only — no edit/compose; slower |

Auto-detect: api if key set, else codex. Override: `--backend api|codex` or `PIXELTAMER_BACKEND` env.

## First-run / no-backend setup

Always start with `pixeltamer doctor`. If both backends show `✗`, **do NOT run `pixeltamer config`** (interactive prompt, no TTY in Bash tool, hangs forever).

Use `AskUserQuestion` instead. Offer:

| Option | What | Friction |
|---|---|---|
| API key | fastest, all modes | per-image cost; org must be verified for gpt-image-2 |
| Codex CLI | ChatGPT subscription, no key | generate only; slower |

**API path — recommended setup (no agent restart):**
```bash
mkdir -p ~/.config/pixeltamer
echo 'OPENAI_IMAGE_API_KEY=sk-...' > ~/.config/pixeltamer/.env
chmod 600 ~/.config/pixeltamer/.env
```
Alternative: `export OPENAI_API_KEY=sk-...` in `~/.zshrc` — but the user must restart the agent after.

**Codex path:**
```bash
npm install -g @openai/codex   # if missing
codex login                    # one-time browser OAuth
```
No restart needed.

After setup → re-run `pixeltamer doctor` → proceed with request.

## Modes

| Mode | Subcommand | Endpoint | Codex? |
|---|---|---|---|
| one-shot | `generate` (alias: `gen`, also default) | `/images/generations` | yes |
| edit/inpaint | `edit -i src.png` (+ optional `--mask`) | `/images/edits` | no |
| compose 2–16 refs | `compose -i ref1 -i ref2 …` | `/images/edits` | no |
| batch w/ verification | `batch <prompts.md>` | dispatches per entry | yes (per entry backend) |

## Common flags

```
-p PROMPT              required
-o PATH                output path or dir; auto-suffixed -01..-NN when n>1
--size WxH             max edge <3840, multiples of 16, ratio ≤3:1, ≤8.29M total px
--quality              low|medium|high|auto (default: high)
-n N                   parallel calls when N>1
--concurrency C        max parallel HTTP (default 4)
-i PATH                reference image (repeatable for compose)
--mask PATH            inpaint mask (edit only); white = regenerate
--backend api|codex    override auto-detect
```

Shortcut: `pixeltamer "make me X"` infers `generate`.

## Workflow

1. Identify mode (generate/edit/compose/batch). Pick a recipe if one fits.
2. Load the relevant reference(s) on demand — don't load all of them.
3. Resolve unspecified params: pick a size from the table below, default `--quality high`, pick backend.
4. Build prompt: Intent → Scene → Subject → Details → Text → Style → Constraints. Drop magic words. Quote any text. Specify what to preserve on edits.
5. Run pixeltamer. It prints absolute path(s) on stdout.
6. **Visually self-verify with `Read`.** Check subject, text spelling, artifacts, framing, color. Fail honestly if it's wrong.
7. Iterate one-dimension-at-a-time, or surface the path to the user.

## Sizes

| Use | Size |
|---|---|
| square / IG / icon | 1024x1024 |
| portrait poster / mobile | 1024x1536, 1024x1792 |
| landscape hero / 16:9 | 1536x864, 1536x1024, 1792x1024 |
| high-res square | 2048x2048 |
| 4K landscape | 3840x2160 |
| 4K portrait | 2160x3840 |

## Prompt rules

| Do | Don't |
|---|---|
| Open with intent ("Create a pitch-deck slide…") | Open with subject ("A chart and KPIs") |
| Quote every character verbatim, with font/color/position | Describe text vaguely |
| Spec language ("50mm f/2.8, north-window light") | Praise language ("beautiful, premium, professional") |
| Single named style anchor ("Wes Anderson palette") | Stacked styles ("watercolor + 3D + cyberpunk") |
| Edit prompts: "change ONLY X / preserve everything else" | Re-describe whole image on edit |
| Specify negative space ("copy area on right third") | Magic words ("8K, ultra detailed, masterpiece") |

## Self-verification — required

Every generation gets `Read` and judged before claiming success. Image gen is stochastic; API success ≠ correct image.

Check:
- Subject matches?
- Text rendered correctly, spelled exactly as quoted?
- Visible artifacts (warped anatomy, glitched typography)?
- Composition matches request?
- Color/tone matches request?

If wrong: change ONE prompt dimension, regenerate. Never bolt 3 new clauses on at once.

## Iteration table

| Result is… | Change THIS only |
|---|---|
| Wrong vibe | Style anchor (named artist/movement/film) |
| Too generic | Composition (camera, angle, framing) |
| Lifeless | Lighting (direction + color temp) |
| Cluttered | Add negative space + cut adjectives |
| Off-brand color | Add hex codes / named palette |
| Text wrong | Re-quote text + add "no extra characters" |

## References on demand

| File | Load when |
|---|---|
| `references/prompting.md` | Any non-trivial prompt |
| `references/api-backend.md` | API troubleshooting, env vars, custom hosts |
| `references/codex-backend.md` | Codex troubleshooting, invocation patterns |
| `references/multi-reference.md` | Compose mode (labeling pattern matters) |
| `references/post-process.md` | Compress, resize, convert, alpha-extract |
| `references/ui-mockup-prompting.md` | UI / dashboard / app screen / marketing page |

## Recipes on demand

| File | Trigger |
|---|---|
| `recipes/infographic.md` | Educational visual, stats, framework, listicle |
| `recipes/meta-ad.md` | Meta/IG/FB ad creative, hook overlay |
| `recipes/viral-linkedin.md` | LinkedIn scroll-stop, quote card, carousel cover |
| `recipes/ui-mockup.md` | Dashboard, marketing page, mobile screen |
| `recipes/editorial-cover.md` | Magazine cover, book cover, podcast art, poster |
| `recipes/product-photo.md` | Product hero, lifestyle, packaging proof |

## Output to user

Success: absolute file path + one-sentence summary of what was made.
Failure: what went wrong + single most likely fix + offer to regenerate.
Never: hype framing ("stunning masterpiece"), vague success ("looks great"), auto-regen without nod.
