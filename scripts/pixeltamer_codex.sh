#!/usr/bin/env bash
# pixeltamer_codex.sh — generate images via the codex CLI's built-in image_gen tool.
#
# Uses your logged-in ChatGPT subscription instead of an OpenAI API key.
#
# Two invocation patterns are tried in sequence:
#   1. Clean numbered task list  (codex's reasoning loop tends to handle this well)
#   2. Augmented "force tool use" prompt as a fallback if pattern 1 doesn't
#      produce an image (some codex versions need the explicit nudge)
#
# Usage:
#   pixeltamer_codex.sh -p "<prompt>" -o <output.png> [--size WxH] [--quality low|medium|high|auto] [-n N]
#
# Exit codes: 0 success, 2 bad usage, 127 codex not installed, 1 generation failed.

set -euo pipefail

prog="$(basename "$0")"

usage() {
  cat >&2 <<EOF
usage: $prog -p "<prompt>" -o <output.png> [--size WxH] [--quality Q] [-n N] [-i FILE]... [--reasoning E] [--debug]

required:
  -p, --prompt PROMPT     image description (quote it)
  -o, --out PATH          where to save the PNG; auto-suffixed -01, -02 when n>1

optional:
  --size WxH              e.g. 1024x1024, 1536x1024, 1024x1536, auto (default: auto)
  --quality Q             low | medium | high | auto (default: auto)
  -n, --count N           number of images, 1-10 (default: 1)
  -i, --image FILE        reference image to attach for character/style consistency.
                          Pass once per file; codex's image_gen will use them as
                          visual context. Repeatable (use -i twice for two images).
  --reasoning E           codex reasoning effort: low | medium | high (default: medium)
  --debug                 keep codex log on success and print its path

env:
  CODEX_BIN               override the codex executable (default: codex)
EOF
  exit 2
}

# --- arg parsing -------------------------------------------------------------

prompt=""
out=""
size="auto"
quality="auto"
count=1
reasoning="medium"
debug=0
images=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    -p|--prompt)    prompt="${2:-}"; shift 2 ;;
    -o|--out)       out="${2:-}"; shift 2 ;;
    --size)         size="${2:-}"; shift 2 ;;
    --quality)      quality="${2:-}"; shift 2 ;;
    -n|--count)     count="${2:-}"; shift 2 ;;
    -i|--image)     images+=("${2:-}"); shift 2 ;;
    --reasoning)    reasoning="${2:-}"; shift 2 ;;
    --debug)        debug=1; shift ;;
    -h|--help)      usage ;;
    *)              echo "$prog: unknown arg: $1" >&2; usage ;;
  esac
done

[[ -z "$prompt" ]] && { echo "$prog: --prompt required" >&2; usage; }
[[ -z "$out" ]] && { echo "$prog: --out required" >&2; usage; }
[[ "$count" =~ ^[0-9]+$ ]] || { echo "$prog: -n must be a positive integer" >&2; usage; }
(( count >= 1 && count <= 10 )) || { echo "$prog: -n must be 1-10" >&2; usage; }

# Validate every reference image exists and resolve to absolute paths so codex
# can find them regardless of where it cd's into. Bail fast on a missing file
# rather than discovering it 60s into a codex run.
image_args=()
if (( ${#images[@]} > 0 )); then
  for img in "${images[@]}"; do
    [[ -z "$img" ]] && { echo "$prog: -i/--image given an empty path" >&2; exit 2; }
    [[ -f "$img" ]] || { echo "$prog: reference image not found: $img" >&2; exit 2; }
    abs_img="$(cd "$(dirname "$img")" && pwd)/$(basename "$img")"
    image_args+=(-i "$abs_img")
  done
fi

# --- preflight: codex installed and logged in -------------------------------

CODEX="${CODEX_BIN:-codex}"

if ! command -v "$CODEX" >/dev/null 2>&1; then
  cat >&2 <<EOF
$prog: codex CLI not found on PATH.
  install: npm install -g @openai/codex   (or brew install codex on macOS)
  then:    codex login
EOF
  exit 127
fi

if ! "$CODEX" login status 2>&1 | grep -qi "logged in"; then
  echo "$prog: codex is not logged in. Run: codex login" >&2
  exit 127
fi

# --- output paths ------------------------------------------------------------

# Resolve absolute output path. If the parent dir doesn't exist, create it.
out_dir="$(dirname "$out")"
mkdir -p "$out_dir"
out_dir="$(cd "$out_dir" && pwd)"
out_base="$(basename "$out")"
out_stem="${out_base%.*}"
out_ext="${out_base##*.}"
[[ "$out_ext" == "$out_base" ]] && out_ext="png"

target_paths=()
if (( count == 1 )); then
  target_paths+=("$out_dir/${out_stem}.${out_ext}")
else
  for i in $(seq 1 "$count"); do
    target_paths+=("$(printf "%s/%s-%02d.%s" "$out_dir" "$out_stem" "$i" "$out_ext")")
  done
fi

# Pre-clean targets so we can detect "did codex actually write the file?"
for p in "${target_paths[@]}"; do rm -f "$p"; done

# --- prompt builders ---------------------------------------------------------

# Pattern 1: clean numbered task list. Codex's reasoning loop tends to
# invoke image_gen naturally with this shape, no forcing required.
build_clean_prompt() {
  local target_block=""
  if (( count == 1 )); then
    target_block="6. Save the image to '${target_paths[0]}'."
  else
    local lines="6. Save the images to these exact paths in order:"
    for i in "${!target_paths[@]}"; do
      lines+=$'\n'"   $(( i + 1 )). ${target_paths[$i]}"
    done
    target_block="$lines"
  fi
  local ref_note=""
  if (( ${#images[@]} > 0 )); then
    ref_note=$'\n''0. Attached to this message are '"${#images[@]}"' reference image(s). Look at them and treat them as the visual style and character anchor for the new image — match the character design, color palette, lighting, and proportions you see there. Do not literally copy or paste the references; generate a new composition that visibly belongs to the same visual world.'
  fi
  cat <<EOF
Perform the following tasks:${ref_note}
1. Use the built-in image_gen tool to generate $count image(s).
2. Prompt: $prompt
3. Size: $size
4. Quality: $quality
5. Count: $count
$target_block
7. After saving, print only the absolute file path(s), one per line.
EOF
}

# Pattern 2: augmented "force tool use". Adds explicit guardrails so codex
# doesn't fabricate a PNG via Python or curl when pattern 1 misfires.
build_forced_prompt() {
  local target_block=""
  if (( count == 1 )); then
    target_block="Save the image to this exact path: ${target_paths[0]}"
  else
    target_block="Save the images to these exact paths, in order:"
    for i in "${!target_paths[@]}"; do
      target_block+=$'\n'"  $(( i + 1 )). ${target_paths[$i]}"
    done
  fi
  local ref_note=""
  if (( ${#images[@]} > 0 )); then
    ref_note=$'\n\n''REFERENCES: '"${#images[@]}"' image(s) are attached to this message. Use them as the visual anchor — match the character design, palette, lighting, and proportions. Generate a new composition in the same visual world; do not literally copy them.'
  fi
  cat <<EOF
Use your image_generation tool (gpt-image-2) to create $count image(s).${ref_note}

PROMPT: $prompt
SIZE: $size
QUALITY: $quality
COUNT: $count

Requirements:
- You MUST call the image_generation tool. This is non-negotiable.
- Do NOT write a Python script, shell out to curl, or fabricate a PNG any other way.
- ${target_block}
- Reply with only the absolute path(s) of the saved PNG(s), one per line. Nothing else.
EOF
}

# --- runner ------------------------------------------------------------------

run_codex() {
  local prompt_text="$1"
  local log
  log="$(mktemp "${TMPDIR:-/tmp}/pixeltamer-codex.XXXXXX")"

  # Why feed the prompt via stdin instead of as a positional arg:
  # `codex exec`'s `-i, --image <FILE>...` is greedy — when an `-i` flag
  # is present, the next positional is parsed as ANOTHER image file, not
  # as the prompt. Piping the prompt through stdin sidesteps that entirely
  # and works whether or not -i was passed.
  # The `${arr[@]+"${arr[@]}"}` idiom expands to nothing when the array is
  # empty and to the array's elements when it isn't — compatible with the
  # macOS system bash 3.2, which otherwise trips `set -u` on empty array
  # expansion (`"${image_args[@]}"` alone errors as "unbound variable").
  if ! printf '%s' "$prompt_text" \
      | "$CODEX" exec \
            --skip-git-repo-check \
            -s workspace-write \
            -c "model_reasoning_effort=\"${reasoning}\"" \
            ${image_args[@]+"${image_args[@]}"} \
            >"$log" 2>&1
  then
    echo "$prog: codex exec failed (last 30 log lines):" >&2
    tail -n 30 "$log" >&2
    echo "(full log: $log)" >&2
    return 1
  fi

  # Did codex actually drop the requested PNG(s)?
  local missing=0
  for p in "${target_paths[@]}"; do
    [[ -f "$p" ]] || missing=1
  done

  if (( missing == 1 )); then
    # Last-ditch recovery: codex sometimes saves to ~/.codex/generated_images/
    # without copying. Grab the most recent ig_*.png and copy it to our target.
    local cache="$HOME/.codex/generated_images"
    if [[ -d "$cache" ]]; then
      local latest
      latest="$(find "$cache" -type f -name 'ig_*.png' -print0 \
                  | xargs -0 ls -t 2>/dev/null | head -n "$count")"
      if [[ -n "$latest" ]]; then
        local i=0
        while IFS= read -r src; do
          cp "$src" "${target_paths[$i]}"
          i=$(( i + 1 ))
        done <<< "$latest"
        missing=0
        for p in "${target_paths[@]}"; do
          [[ -f "$p" ]] || missing=1
        done
      fi
    fi
  fi

  if (( missing == 1 )); then
    echo "$prog: codex finished but expected PNG(s) not found." >&2
    tail -n 30 "$log" >&2
    echo "(full log: $log)" >&2
    return 1
  fi

  if (( debug == 1 )); then
    echo "$prog: log preserved at $log" >&2
  else
    rm -f "$log"
  fi
  return 0
}

# Try pattern 1, fall back to pattern 2 on failure.
if run_codex "$(build_clean_prompt)"; then
  used="clean"
else
  echo "$prog: clean pattern produced no image — retrying with augmented prompt..." >&2
  for p in "${target_paths[@]}"; do rm -f "$p"; done
  if run_codex "$(build_forced_prompt)"; then
    used="forced"
  else
    exit 1
  fi
fi

# Print the resulting paths and which pattern got us there (on stderr so stdout
# remains a clean list of paths for callers).
for p in "${target_paths[@]}"; do echo "$p"; done
echo "$prog: ok (pattern: $used)" >&2
