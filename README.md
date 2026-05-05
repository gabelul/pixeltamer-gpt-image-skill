<p align="center">
  <img src=".github/assets/hero-with-text.png" alt="pixeltamer — image generation skill for AI coding agents" width="100%"/>
</p>

# pixeltamer — image generation skill for AI coding agents | gpt-image-2 toolkit

Six different image-gen skills were rotting in my `to_check/` folder, each doing one thing well and three things badly. So I merged them, kept the parts that earned their keep, dropped the rest. This is the result — one skill, two backends, three modes, zero generic-AI-slop output.

Generate, edit, and compose images with `gpt-image-2` from inside Claude Code, Codex CLI, OpenCode, Cursor — or any agent that reads `SKILL.md`. Bring an OpenAI API key OR sign in to your ChatGPT subscription via codex; same prompts, same recipes, your call on how to pay. Ships with a prompting doctrine that drops the "8K, ultra detailed, masterpiece" magic words this model actively hates, six production recipes (infographic, meta-ad, viral-linkedin, ui-mockup, editorial-cover, product-photo), and a 29-test multi-image batch verifier so you don't ship broken renders.

Works in Claude Code, Codex CLI, OpenCode, Cursor, and 50+ other agents via [the Skills CLI](https://github.com/vercel-labs/skills).

---

## Install

### Quick install (recommended)

```bash
npx skills add gabelul/pixeltamer-gpt-image-skill
```

One command. Auto-detects your agent, symlinks the skill into the right place, works across all of them at once. Update later with `npx skills update`.

<details>
<summary>Manual setup</summary>

```bash
git clone https://github.com/gabelul/pixeltamer-gpt-image-skill.git pixeltamer

# Claude Code (user level)
ln -s "$PWD/pixeltamer" ~/.claude/skills/pixeltamer

# Codex CLI
ln -s "$PWD/pixeltamer" ~/.codex/skills/pixeltamer

# OpenCode / generic agents
ln -s "$PWD/pixeltamer" ~/.agents/skills/pixeltamer

# Project level (Claude Code)
ln -s "$PWD/pixeltamer" ./.claude/skills/pixeltamer
```

</details>

### Where pixeltamer lives after install

`npx skills add` is a file-placement step — it symlinks the skill into agent dirs and stops. It doesn't run anything, doesn't prompt for credentials, doesn't set anything up. That happens at first **invocation**, not at install. Two ways to invoke:

**Inside an agent (the common path).** When you ask Claude Code, Codex CLI, OpenCode, Cursor, etc. to "make me an image", the host reads `SKILL.md`, runs the dispatcher script for you, and the bash dispatcher's first-run check auto-prompts the interactive setup if no config exists. Nothing extra to do.

**From your shell directly.** The dispatcher script is at `~/.agents/skills/pixeltamer/scripts/pixeltamer` (or wherever `npx skills add` placed it for your agent — `~/.claude/skills/...`, `~/.codex/skills/...`, etc.). Either call by full path or symlink to your PATH:

```bash
ln -s ~/.agents/skills/pixeltamer/scripts/pixeltamer ~/.local/bin/pixeltamer
```

### First run

Once you can invoke `pixeltamer`:

```bash
pixeltamer doctor      # diagnose which backends are available
pixeltamer config      # interactive backend setup
```

Or skip `config` and just set the credentials yourself: `OPENAI_API_KEY` for the API path, or `codex login` for the codex path. Auto-detect picks API if a key is set, else codex. Override with `--backend api|codex` per call or `PIXELTAMER_BACKEND` env var.

---

## How it works

1. **Detect mode** — pixeltamer reads the request and picks one of: `generate` (text → image), `edit` (modify or inpaint a single source), `compose` (blend 2–16 reference images into one), `batch` (state-machine workflow for multiple related images with verification).
2. **Pick a backend** — auto-detects API key first, falls back to codex CLI. Override per call with `--backend`.
3. **Build the prompt** — applies the canonical structure (Intent → Scene → Subject → Details → Text → Style → Constraints), drops magic words, quotes any text that should appear in the image.
4. **Call the right transport** — Python urllib → `/images/generations` or `/images/edits` for the API path; bash → `codex exec` with the built-in `image_gen` tool for the codex path.
5. **Verify visually** — every generated PNG gets `Read`-loaded back and checked against the prompt before claiming success. Image gen is stochastic; "API succeeded" ≠ "image is correct."
6. **Surface or iterate** — print the absolute path on success, or change one prompt dimension and regenerate on failure.

---

## Two backends, your choice

| Need | Use |
|---|---|
| Fastest single image | `--backend api` |
| Don't have / don't want an API key | `--backend codex` (uses ChatGPT subscription) |
| Edit / inpaint / mask | `--backend api` (codex's image_gen is generation-only) |
| Compose 2–16 references into one | `--backend api` |
| Custom OpenAI-compatible host (jmrai, ZenMux, OpenRouter) | API with `OPENAI_IMAGE_BASE_URL` set |
| Run on a teammate's machine without sharing creds | `--backend codex` (each user signs in separately) |

| Axis | API | Codex |
|---|---|---|
| Auth | API key | ChatGPT subscription |
| Marginal cost | per-image | included in subscription up to limits |
| Latency per image | ~10–20s | ~30–90s (reasoning loop) |
| Edit / inpaint | yes | no |
| Multi-reference compose | yes (up to 16) | no |
| Mask / region edit | yes | no |
| Custom base URL / proxy | yes | no |

---

## Three modes (plus batch)

<table>
  <tr>
    <td align="center" width="33%"><img src=".github/assets/mode-generate.png" alt="generate mode"/><br/><b>generate</b><br/><sub>text → image</sub></td>
    <td align="center" width="33%"><img src=".github/assets/mode-edit.png" alt="edit mode"/><br/><b>edit</b><br/><sub>change one thing, keep the rest</sub></td>
    <td align="center" width="33%"><img src=".github/assets/mode-compose.png" alt="compose mode"/><br/><b>compose</b><br/><sub>blend 2–16 references into one</sub></td>
  </tr>
</table>

```bash
# one-shot generation — easiest
pixeltamer "Create a pitch-deck slide titled 'Q3 Revenue', warm cream background, deep navy text, single accent burnt orange, 1536x1024"

# with explicit flags
pixeltamer generate -p "..." --size 1536x1024 --quality high -o slide.png

# 4 variants in parallel (API only — fires 4 concurrent calls)
pixeltamer generate -p "..." -n 4 --concurrency 4 -o variants/

# edit / inpaint a single image (API only)
pixeltamer edit -i source.png -p "Change ONLY the sky to overcast. Preserve everything else exactly." -o edited.png

# compose 2–16 references blended into one (API only)
pixeltamer compose -i product.png -i kitchen.png -p "Place product on counter, morning window light from left." -o composed.png

# multi-image batch with state-machine verification
pixeltamer batch ./prompts.md
```

---

## Gallery — built with pixeltamer, prompts included

Real images we shipped with this repo (mascot, social card, hero, mode trio, comparison infographic) plus the **exact prompt** that produced each one. Copy a prompt, drop it into your own `pixeltamer generate -p "..."` call, get something in the same family. Each entry tags which patterns from `references/prompt-patterns.md` it uses, so the gallery doubles as a worked-example index for the doctrine.

→ [`gallery/README.md`](gallery/README.md)

---

## What's in the box

```
pixeltamer/
├── SKILL.md                    workflow Claude reads
├── SKILL-OC.md                 token-optimized variant for OpenClaw
├── scripts/
│   ├── pixeltamer              bash dispatcher, auto-detects backend
│   ├── pixeltamer_api.py       Python API client, zero deps (urllib only)
│   ├── pixeltamer_codex.sh     codex CLI wrapper with dual invocation + fallback
│   ├── verify-images.mjs       multi-image batch verifier orchestrator
│   └── lib/                    parser + verifier + status writer (pure functions)
├── references/                 prompting doctrine, backend guides, multi-ref mastery, post-processing
├── recipes/                    6 production recipes (infographic, meta-ad, viral-linkedin, ui-mockup, editorial-cover, product-photo)
├── examples/                   4 demonstration PNGs (~3 MB)
└── tests/                      29 tests covering parser, verifier, status writer
```

---

## Supported agents

| Agent | Path | Status |
|---|---|---|
| Claude Code | `~/.claude/skills/` | Supported |
| Codex CLI | `~/.codex/skills/` | Supported |
| OpenCode | `~/.opencode/skills/` | Supported |
| Cursor | varies | Supported |

Plus [50+ more agents](https://github.com/vercel-labs/skills) via the Skills CLI.

---

## Prerequisites

- **For the API backend:** an `OPENAI_API_KEY` with org verification for gpt-image-2 (https://platform.openai.com/settings/organization/general). Python 3.7+ on the machine.
- **For the codex backend:** `npm install -g @openai/codex`, then `codex login`. ChatGPT Plus / Team / Enterprise subscription.
- **For batch mode:** Node.js 18+ (covered by most recent npm installs).
- **For multi-target install:** `npx` (ships with npm).

---

## Related

Other tools for agents that care about quality:

- **[slopbuster](https://github.com/gabelul/slopbuster)** — AI text humanizer. 100+ patterns, two-pass audit, three-tier scoring. Makes AI-generated prose, code comments, and academic writing sound human.
- **[pixelslop](https://github.com/gabelul/pixelslop)** — Design quality scanner. Opens real pages in Playwright, measures actual pixels, catches visual AI slop.
- **[stitch-kit](https://github.com/gabelul/stitch-kit)** — Design superpowers for AI coding agents. 35 skills for ideation, generation, iteration, and production conversion via Google Stitch MCP.
- **[claude-code-skill-activator](https://github.com/gabelul/claude-code-skill-activator)** — Skill auto-detection for Claude Code. AI extracts keywords once, then fast offline matching suggests skills as you type.

---

Built by Gabi @ [Booplex.com](https://booplex.com) — because AI agents are getting scary good at generating images, and someone needs to make sure 'generated' doesn't become synonymous with 'generic'. MIT.
