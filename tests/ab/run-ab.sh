#!/usr/bin/env bash
# tests/ab/run-ab.sh — fire two pixeltamer generate prompts side-by-side and
# compare the outputs by MD5 + file size, so you can tell at a glance whether
# the test actually produced two distinct images or got deduplicated by codex.
#
# Designed for the prompt-construction-pattern A/B test described in
# tests/ab/README.md and tracked in issue #1.
#
# Usage:
#   tests/ab/run-ab.sh <variant-a.txt> <variant-b.txt> <output-dir> [--backend api|codex] [--size WxH] [--quality Q]
#
# Defaults:
#   --backend api       (the only backend where prompt-construction patterns
#                        actually translate to model-side differences; codex
#                        normalizes prompts internally — see issue #1)
#   --size 1536x1024    (matches infographic / dashboard mockup tests)
#   --quality high      (production-grade A/B; lower if you're iterating fast)
#
# Output naming:
#   <output-dir>/<basename-of-variant-a>.png
#   <output-dir>/<basename-of-variant-b>.png
#
# Exit codes:
#   0  both generations succeeded
#   1  one or both generations failed
#   2  bad usage
#   3  outputs are byte-identical (likely codex normalization or cache hit —
#      the test is invalid; check your backend)

set -euo pipefail

prog="$(basename "$0")"

usage() {
  cat >&2 <<EOF
usage: $prog <variant-a.txt> <variant-b.txt> <output-dir> [options]

required:
  <variant-a.txt>     path to a text file containing the first prompt
  <variant-b.txt>     path to a text file containing the second prompt
  <output-dir>        where to write the two PNGs

optional:
  --backend BACKEND   api | codex | auto    (default: api)
  --size WxH          1024x1024 / 1536x1024 / 1024x1536 / etc.
                                            (default: 1536x1024)
  --quality Q         low | medium | high | auto
                                            (default: high)
  --pixeltamer PATH   override pixeltamer dispatcher path
                                            (default: \$(command -v pixeltamer)
                                             or ~/.claude/skills/pixeltamer/scripts/pixeltamer)

EOF
  exit 2
}

# --- parse args ---
[[ $# -lt 3 ]] && usage

variant_a="$1"; shift
variant_b="$1"; shift
out_dir="$1"; shift

backend="api"
size="1536x1024"
quality="high"
pixeltamer=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --backend)     backend="${2:-}"; shift 2 ;;
    --size)        size="${2:-}"; shift 2 ;;
    --quality)     quality="${2:-}"; shift 2 ;;
    --pixeltamer)  pixeltamer="${2:-}"; shift 2 ;;
    -h|--help)     usage ;;
    *)             echo "$prog: unknown arg: $1" >&2; usage ;;
  esac
done

# --- validate ---
[[ -f "$variant_a" ]] || { echo "$prog: variant-a not found: $variant_a" >&2; exit 2; }
[[ -f "$variant_b" ]] || { echo "$prog: variant-b not found: $variant_b" >&2; exit 2; }

mkdir -p "$out_dir"
out_dir="$(cd "$out_dir" && pwd)"

# Resolve pixeltamer dispatcher.
if [[ -z "$pixeltamer" ]]; then
  if command -v pixeltamer >/dev/null 2>&1; then
    pixeltamer="$(command -v pixeltamer)"
  elif [[ -x "$HOME/.claude/skills/pixeltamer/scripts/pixeltamer" ]]; then
    pixeltamer="$HOME/.claude/skills/pixeltamer/scripts/pixeltamer"
  else
    echo "$prog: pixeltamer dispatcher not found. Pass --pixeltamer PATH or install the skill." >&2
    exit 2
  fi
fi

# --- name outputs after the prompt-file basenames so they're self-describing ---
name_a="$(basename "${variant_a%.*}")"
name_b="$(basename "${variant_b%.*}")"
out_a="$out_dir/${name_a}.png"
out_b="$out_dir/${name_b}.png"

# --- fire both ---
echo "Backend: $backend  ·  Size: $size  ·  Quality: $quality"
echo "Variant A: $variant_a -> $out_a"
echo "Variant B: $variant_b -> $out_b"
echo

# Read prompts from files (preserves whitespace + multi-line).
prompt_a="$(cat "$variant_a")"
prompt_b="$(cat "$variant_b")"

echo "Firing Variant A..."
"$pixeltamer" --backend "$backend" generate \
  --size "$size" --quality "$quality" \
  -o "$out_a" -p "$prompt_a"
[[ -f "$out_a" ]] || { echo "$prog: variant-a produced no output" >&2; exit 1; }
echo "  done."

echo
echo "Firing Variant B..."
"$pixeltamer" --backend "$backend" generate \
  --size "$size" --quality "$quality" \
  -o "$out_b" -p "$prompt_b"
[[ -f "$out_b" ]] || { echo "$prog: variant-b produced no output" >&2; exit 1; }
echo "  done."

# --- compare ---
echo
echo "=== A/B comparison ==="

# md5 on macOS, md5sum on Linux. Try both.
if command -v md5sum >/dev/null 2>&1; then
  md5_a="$(md5sum "$out_a" | awk '{print $1}')"
  md5_b="$(md5sum "$out_b" | awk '{print $1}')"
elif command -v md5 >/dev/null 2>&1; then
  md5_a="$(md5 -q "$out_a")"
  md5_b="$(md5 -q "$out_b")"
else
  echo "$prog: neither md5sum nor md5 found; can't compute checksums" >&2
  md5_a="(no md5 tool)"
  md5_b="(no md5 tool)"
fi

size_a="$(wc -c < "$out_a" | tr -d ' ')"
size_b="$(wc -c < "$out_b" | tr -d ' ')"

printf "A: %s   (MD5 %s, %s bytes)\n" "$out_a" "$md5_a" "$size_a"
printf "B: %s   (MD5 %s, %s bytes)\n" "$out_b" "$md5_b" "$size_b"
echo

if [[ "$md5_a" == "$md5_b" && "$md5_a" != "(no md5 tool)" ]]; then
  cat <<EOF >&2
$prog: WARNING — A and B are byte-identical (same MD5).

This means the test is invalid. Likely causes:
  1. You ran with --backend codex. Codex normalizes prompts internally
     before calling gpt-image-2, so structurally different prompts
     collapse to the same underlying call. Re-run with --backend api.
  2. The API host returned a cached result for both calls. Some
     OpenAI-compatible proxies do aggressive caching.
  3. Both prompts were literally identical (check the input files).

See tests/ab/README.md for the full story on codex normalization.
EOF
  exit 3
fi

echo "DIFFERENT — proceed to visual comparison."
echo "Score on three axes (see tests/ab/README.md):"
echo "  1. Typography fidelity — does every quoted string render exactly?"
echo "  2. Layout coherence    — does the composition match what was asked?"
echo "  3. Plausibility        — do values look real, not Lorem Ipsum?"
echo
echo "Decision rule: doctrine ships if B wins on >= 2 of 3 across >= 2 categories."
