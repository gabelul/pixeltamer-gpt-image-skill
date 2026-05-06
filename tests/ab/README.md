# `tests/ab/` — A/B test harness for prompt-construction patterns

Why this exists, how to run it, and how to interpret results.

## Why

Pixeltamer's `references/prompt-patterns.md` doctrine claims that JSON-schema prompts, role-based openers, and specific-negative blocks each produce better images than equivalent prose. The **input-side** value of those patterns (structural completeness, agent composability, scales to large prompts) is defensible from first principles. The **output-side** claim — do these patterns actually produce better images? — is unverified.

We tried to verify it on the codex backend during the 0.2.0 work and got a null result: codex's `image_gen` reasoning loop normalizes prompts before calling gpt-image-2 internally, so two structurally different prompts with the same content produced byte-identical PNGs (same MD5, twice, on two different test categories). The codex backend masks any model-side delta from prompt-construction patterns.

This harness exists so the same A/B can be run on the **API backend**, where pixeltamer's Python script forwards the prompt verbatim to `/v1/images/generations` — no reasoning model in between. Two structurally different prompts produce two genuinely different gpt-image-2 calls, and (assuming a non-deterministic seed) two different images we can compare.

Tracked in [issue #1](https://github.com/gabelul/pixeltamer-gpt-image-skill/issues/1).

## What's in this folder

- **`README.md`** — this file
- **`run-ab.sh`** — runner: takes two prompt files + an output dir, fires both via `pixeltamer generate` at the same size and quality, prints both paths plus their MD5s
- **`fixtures/`** — example prompt pairs ready to A/B
  - `coffee-infographic-prose.txt` + `coffee-infographic-json.txt` — same content (5-column comparison infographic), different prompt construction. The JSON variant uses the doctrine: role-based opener, JSON-config schema, specific-negatives block.

## How to run

You need an OpenAI API key configured for the API backend. Put it in `~/.config/pixeltamer/.env`:

```bash
mkdir -p ~/.config/pixeltamer
echo 'OPENAI_IMAGE_API_KEY=sk-yourkey' > ~/.config/pixeltamer/.env
chmod 600 ~/.config/pixeltamer/.env
```

Then from the repo root:

```bash
./tests/ab/run-ab.sh tests/ab/fixtures/coffee-infographic-prose.txt \
                     tests/ab/fixtures/coffee-infographic-json.txt \
                     scratch/ab-results/
```

The runner fires both prompts at `1536x1024 --quality high --backend api` and prints output like:

```
A: scratch/ab-results/coffee-infographic-prose.png   (MD5 5fc4...)
B: scratch/ab-results/coffee-infographic-json.png    (MD5 b219...)
DIFFERENT — proceed to visual comparison.
```

If MD5s match, that's the codex-normalization signature (you ran on codex backend by mistake or hit a cache). If they differ, proceed to visual scoring.

## How to score

For each pair, judge on three axes — same scoring rubric we'd use for any pixeltamer recipe:

| Axis | Question | What "B wins" looks like |
|---|---|---|
| **Typography fidelity** | Does every quoted text string render exactly? | B has more strings spelled right (no "Course" → "Coarse" drift, no "95C" → "95°C" drift) |
| **Layout coherence** | Does the composition match what was asked? | B's layout is closer to the spec (right column count, right zones, no extra/missing elements) |
| **Plausibility** | Do the values look like real product data, not generic filler? | B has no Lorem Ipsum, no "Project 1 / Project 2", no placeholder content |

**Decision rule for shipping the doctrine**: B wins on at least 2 of 3, across at least 2 different test categories. If A wins or it's a wash, the doctrine claim is wrong — soften `prompt-patterns.md` accordingly.

## Why MD5 comparison first

Three reasons:

1. **Catches the codex-normalization failure mode automatically.** If you accidentally ran with `--backend codex` (or a cache hit happened), you'll see identical MD5s and know the test is invalid before you spend time visually comparing.
2. **Tells you whether the test ran at all.** Same MD5 + same file size = something deduplicated. Different MD5 = two distinct API calls produced two distinct images, even if visually similar.
3. **Cheap and immediate.** No human judgment needed for the first-pass sanity check.

## Limitations

- **gpt-image-2 is stochastic.** Two API calls with the *same* prompt produce different images. Some of the visual difference between A and B is noise, not signal. Mitigation: run 3 pairs at different size/quality combos, look for consistent patterns rather than single-instance wins.
- **Scoring is subjective.** Typography fidelity is the most objective axis (text either spells right or doesn't); layout coherence and plausibility require judgment. Use the same scorer across all pairs for consistency.
- **API costs money.** Each `--quality high` 1536x1024 generation runs ~$0.10. A serious A/B (3 pairs × 2 variants × 3 sizes = 18 calls) is ~$2. Budget for it before firing.
- **Not yet validated.** This harness exists because we want to validate the doctrine but haven't yet. If you run it and the data contradicts what `prompt-patterns.md` claims, **update the doctrine, don't bury the data**. Honest results > shipped story.

## What this harness does NOT do

- It doesn't run your test for you. You score the visual output.
- It doesn't render diffs or visualize differences pixel-by-pixel. Use your eyes (or an external diff tool like ImageMagick `compare`).
- It doesn't repeat the same prompt N times to average out stochasticity. Add `--n 3` to your variant prompts if you want that, then compare across the trio.
