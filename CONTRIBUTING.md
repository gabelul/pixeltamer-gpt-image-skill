# Contributing

PRs, issues, and shared horror stories all welcome. Few notes to make life easier:

## Bugs

Open an issue with:

- What you ran (`pixeltamer doctor` output is gold for environment-related bugs)
- What you expected
- What you got
- The exact prompt if it's a quality issue

Image-generation quality is hard to debug without the prompt. Don't paraphrase it — paste it.

## Feature ideas

Open an issue first if it's substantial — saves you the work if I'm going to push back on scope.

The skill stays focused on **image generation**. Anything that drifts toward HTML reconstruction, browser screenshot validation, design-system management, or full design pipelines belongs in a separate skill (or in [stitch-kit](https://github.com/gabelul/stitch-kit), which already covers a lot of that).

## Code

```bash
# clone + run the test suite
git clone https://github.com/gabelul/pixeltamer.git
cd pixeltamer
npm install
npm test
```

The test suite (29 tests, `node:test`) covers the multi-image batch verifier — parser, per-entry verifier, status writer. Keep them green if you touch any of `scripts/lib/` or `scripts/verify-images.mjs`.

The Python API client (`scripts/pixeltamer_api.py`) and bash codex backend (`scripts/pixeltamer_codex.sh`) don't have tests yet — they're integration-heavy and need real backends. Manual smoke tests:

```bash
# API
OPENAI_API_KEY=sk-... pixeltamer generate -p "a single red apple" -o /tmp/apple.png

# Codex
pixeltamer --backend codex generate -p "a single red apple" -o /tmp/apple-codex.png

# Doctor
pixeltamer doctor
```

## Style

- Bash scripts: `set -euo pipefail`, prefix logs with `$prog:`, errors to stderr.
- Python: zero third-party deps, stdlib only. Type hints on function signatures. Don't add `requests` or `openai` — urllib is doing the job.
- JS/Node: ES modules (`.mjs`), pure functions where possible, dependency injection for anything that touches the filesystem so it stays testable.
- Markdown: no AI slop. No "delve", "leverage", "harness", "tapestry", "in today's landscape", emoji decoration. If the doc reads like an LLM wrote it, rewrite it.

## Adding a recipe

A new recipe should fit the existing shape — see `recipes/infographic.md` as the template:

- `# Recipe: <Name>` heading
- "When to use" / "When NOT to use" sections
- Defaults block (size, quality, backend)
- Prompt skeleton with bracketed placeholders
- At least one worked example as a runnable `pixeltamer generate` command
- Composition tips
- Common-failure-modes table

Recipes belong in `recipes/`. Add a row to the recipes table in both `SKILL.md` and `SKILL-OC.md` so Claude knows when to load it.

## Adding a reference

References go in `references/`. They're the deeper "doctrine" docs — load on demand. Add a row to the references table in both `SKILL.md` and `SKILL-OC.md`.

Don't duplicate content between recipes and references — recipes are tight playbooks, references are the underlying reasoning. If a recipe needs a section that lives in a reference, link to it instead of copying.

## License

MIT. By contributing, you agree to license your contributions under MIT.
