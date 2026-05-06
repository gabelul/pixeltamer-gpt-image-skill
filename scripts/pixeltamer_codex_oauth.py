#!/usr/bin/env python3
"""pixeltamer_codex_oauth.py — codex-OAuth backend for edit + compose modes.

Bypasses the codex CLI and POSTs directly to the Codex Responses API
(POST <chatgpt-base>/backend-api/codex/responses) using ChatGPT OAuth
credentials from ~/.codex/auth.json. Lets pixeltamer's codex backend do
edit + multi-reference compose without an OpenAI API key — capability
proven in gallery #8 with byte-perfect text fidelity on a dense
infographic.

Reads ~/.codex/config.toml the same way `codex exec` does, so users with
local proxies or load balancers (e.g. `[model_providers.codex-lb]`
pointing at 127.0.0.1) keep working — we honor whatever `chatgpt_base_url`
or model_provider `base_url` they have configured. Fall back to upstream
chatgpt.com if no override.

Subcommands:
  generate   text -> image (no input image attached)
  edit       1 source image + prompt that names what to change/preserve
  compose    2-16 reference images, blended into one output

Auth:
  ~/.codex/auth.json         — Bearer access_token + ChatGPT-Account-ID
  ~/.codex/installation_id   — optional, sent as x-codex-installation-id
  ~/.codex/config.toml       — model_provider resolution for proxy users

Notes:
  - Mask-based inpainting is NOT supported here. The Responses API doesn't
    take a mask parameter. Pixeltamer's `edit --mask` still routes through
    the API backend.
  - Token refresh is NOT implemented. If your access_token has expired,
    you'll get a 401 with code "token_expired". Run `codex login` to mint
    a fresh one. Proxy users get refresh handled by their proxy.
  - `-n N` for parallel variants is NOT supported on this backend. Codex
    sessions are sequential. Use the API backend for batch generation.

No third-party dependencies — urllib only. Requires Python 3.11+ for
tomllib (config parsing). Falls back gracefully if tomllib is missing
(uses upstream chatgpt.com URL, may break for proxy users).

Exit codes: 0 success, 2 bad usage, 127 codex auth missing, 1 generation failed.
"""
from __future__ import annotations

import argparse
import base64
import json
import mimetypes
import re
import sys
import urllib.error
import urllib.request
import uuid
from pathlib import Path

# --------------------------------------------------------------------------- constants

# Default upstream — used when no proxy is configured. The Codex Responses API
# lives at /backend-api/codex/responses on chatgpt.com.
UPSTREAM_BASE = "https://chatgpt.com/backend-api/codex"

# The chat model that wraps the image_generation tool. Different from
# gpt-image-2 (which is the actual image model) — gpt-5.4 is what
# orchestrates the tool call.
RESPONSES_MODEL = "gpt-5.4"

# Free-form client identifier sent in the `originator` header. Helps OpenAI
# distinguish pixeltamer traffic from raw Codex CLI traffic.
ORIGINATOR = "pixeltamer"

# Output format the image_generation tool produces. PNG keeps fidelity for
# text-heavy outputs (most of pixeltamer's job). JPEG / WebP would lose
# typography sharpness on dense infographics.
OUTPUT_FORMAT = "png"

# Sizes the Responses API accepts. Subset of what gpt-image-2 supports — the
# "auto" sentinel lets the model pick based on the input. For edits we
# usually want to match the source aspect ratio, so default is "auto".
SUPPORTED_SIZES = (
    "auto",
    "1024x1024",
    "1024x1536",
    "1536x1024",
    "2048x2048",
    "2048x1152",
    "3840x2160",
    "2160x3840",
)

# Codex saves auth state under ~/.codex/. Three files we read.
CODEX_DIR = Path.home() / ".codex"
AUTH_PATH = CODEX_DIR / "auth.json"
INSTALL_PATH = CODEX_DIR / "installation_id"
CONFIG_PATH = CODEX_DIR / "config.toml"


# --------------------------------------------------------------------------- auth + config

def load_codex_session() -> dict:
    """Read ~/.codex/auth.json and ~/.codex/installation_id.

    Returns a dict with access_token, account_id, installation_id, auth_mode.
    Exits with code 127 if auth.json is missing or malformed — the user needs
    to run `codex login` before pixeltamer's codex-OAuth backend can do
    anything.
    """
    if not AUTH_PATH.exists():
        sys.exit(
            f"pixeltamer_codex_oauth: {AUTH_PATH} not found. "
            f"Run `codex login` first."
        )

    try:
        auth = json.loads(AUTH_PATH.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        sys.exit(f"pixeltamer_codex_oauth: {AUTH_PATH} is not valid JSON: {e}")

    tokens = auth.get("tokens") or {}
    access_token = (tokens.get("access_token") or "").strip()
    account_id = (tokens.get("account_id") or "").strip()
    if not access_token or not account_id:
        sys.exit(
            f"pixeltamer_codex_oauth: {AUTH_PATH} missing tokens.access_token "
            f"or tokens.account_id. Run `codex login` again."
        )

    installation_id = None
    if INSTALL_PATH.exists():
        installation_id = INSTALL_PATH.read_text(encoding="utf-8").strip() or None

    return {
        "access_token": access_token,
        "account_id": account_id,
        "installation_id": installation_id,
        "auth_mode": auth.get("auth_mode"),
    }


def resolve_base_url() -> str:
    """Resolve which base URL to POST to, mirroring codex CLI's resolution.

    Reads ~/.codex/config.toml. If `model_provider` is set at top level and a
    matching `[model_providers.<name>]` block has `base_url`, use that.
    Otherwise fall back to upstream chatgpt.com.

    Honoring this is critical for users with a local proxy or load balancer
    (e.g. `[model_providers.codex-lb]` with base_url = "http://127.0.0.1:..."
    that handles auth refresh, rate limiting, multi-account fallback).
    Hardcoding chatgpt.com would break those setups silently.
    """
    if not CONFIG_PATH.exists():
        return UPSTREAM_BASE

    try:
        import tomllib  # Python 3.11+ stdlib
    except ImportError:
        # No TOML parser available — fall back to upstream. Users on Python
        # 3.10 or older with a proxy will need to upgrade Python.
        return UPSTREAM_BASE

    try:
        config = tomllib.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    except Exception:
        return UPSTREAM_BASE

    provider_name = config.get("model_provider")
    if not provider_name:
        return UPSTREAM_BASE

    provider = (config.get("model_providers") or {}).get(provider_name) or {}
    return provider.get("base_url") or UPSTREAM_BASE


# --------------------------------------------------------------------------- image encoding

def encode_image_data_url(path: Path) -> str:
    """File path -> data URL the Responses API accepts as input_image.

    Format is `data:<mime>;base64,<encoded>`. The model treats the URL as if
    it were a real image attachment and uses it as either the edit source
    (one image) or a compose reference (multiple images).
    """
    if not path.exists():
        sys.exit(f"pixeltamer_codex_oauth: image not found: {path}")
    mime, _ = mimetypes.guess_type(str(path))
    mime = mime or "image/png"
    encoded = base64.b64encode(path.read_bytes()).decode("ascii")
    return f"data:{mime};base64,{encoded}"


# --------------------------------------------------------------------------- request building

def build_request(
    *,
    session: dict,
    prompt: str,
    images: list[Path],
    size: str,
) -> tuple[str, dict, dict]:
    """Construct the (url, headers, body) tuple for a Responses API call.

    Same shape works for generate / edit / compose — the difference is just
    whether `images` is empty (generate), one (edit), or many (compose).
    The `image_generation` tool is requested unconditionally; the model
    decides whether to use input images as edit source vs compose references
    based on the prompt's instructions.

    For multi-reference compose, the prompt should use role labels
    ("PRIMARY SOURCE is image 1; image 2 is style reference") so the model
    knows which input controls what. Without role labels, the model may
    average the references rather than treating one as the structural anchor.
    """
    base_url = resolve_base_url()
    url = f"{base_url.rstrip('/')}/responses"

    headers = {
        "Authorization": f"Bearer {session['access_token']}",
        "ChatGPT-Account-ID": session["account_id"],
        "Content-Type": "application/json",
        "Accept": "text/event-stream",
        "originator": ORIGINATOR,
        "session_id": str(uuid.uuid4()),
    }

    content: list[dict] = [{"type": "input_text", "text": prompt}]
    for img_path in images:
        content.append({
            "type": "input_image",
            "image_url": encode_image_data_url(img_path),
        })

    tool_spec: dict = {"type": "image_generation", "output_format": OUTPUT_FORMAT}
    # Only set size if the caller specified one explicitly; "auto" lets the
    # model pick which is usually correct for edits (matches source aspect).
    if size and size != "auto":
        tool_spec["size"] = size

    body = {
        "model": RESPONSES_MODEL,
        "instructions": "",
        "input": [
            {"type": "message", "role": "user", "content": content}
        ],
        "tools": [tool_spec],
        "tool_choice": "auto",
        "parallel_tool_calls": False,
        "reasoning": None,
        "store": False,
        "stream": True,
        "include": ["reasoning.encrypted_content"],
    }
    if session.get("installation_id"):
        body["client_metadata"] = {"x-codex-installation-id": session["installation_id"]}

    return url, headers, body


# --------------------------------------------------------------------------- SSE parsing

def parse_sse_stream(raw_text: str) -> list[dict]:
    """Split a Server-Sent Events response text into [{event, data}] dicts.

    Events are separated by blank lines (one or more \\n\\n). Each event has
    one or more `event:` and `data:` lines. We only keep events whose data
    is JSON-parseable; control events with non-JSON data are dropped.
    """
    normalized = raw_text.replace("\r\n", "\n")
    blocks = [b.strip() for b in re.split(r"\n\n+", normalized) if b.strip()]
    events: list[dict] = []
    for block in blocks:
        event_type = "message"
        data_lines: list[str] = []
        for line in block.splitlines():
            if not line or line.startswith(":"):
                continue
            if line.startswith("event:"):
                event_type = line[6:].strip()
            elif line.startswith("data:"):
                data_lines.append(line[5:].lstrip())
        data_text = "\n".join(data_lines)
        if not data_text:
            continue
        try:
            events.append({"event": event_type, "data": json.loads(data_text)})
        except json.JSONDecodeError:
            continue
    return events


def extract_image_b64(events: list[dict]) -> str | None:
    """Find the base64-encoded PNG in the parsed SSE events.

    Preferred source: `response.output_item.done` events where the item is an
    `image_generation_call` with a non-empty `result`. Fallback: the most
    recent `response.image_generation_call.partial_image` event's
    `partial_image_b64` (sometimes the final-result event is missing but a
    partial got through).
    """
    for event in reversed(events):
        data = event.get("data") or {}
        if data.get("type") == "response.output_item.done":
            item = data.get("item") or {}
            if item.get("type") == "image_generation_call" and item.get("result"):
                return item["result"]
    for event in reversed(events):
        data = event.get("data") or {}
        if data.get("type") == "response.image_generation_call.partial_image":
            partial = data.get("partial_image_b64")
            if partial:
                return partial
    return None


# --------------------------------------------------------------------------- runner

def run_one(*, prompt: str, images: list[Path], size: str, out: Path, debug: bool) -> Path:
    """Orchestrate one POST: build request, send, parse SSE, save the PNG."""
    session = load_codex_session()
    url, headers, body = build_request(
        session=session, prompt=prompt, images=images, size=size,
    )

    request = urllib.request.Request(
        url,
        data=json.dumps(body).encode("utf-8"),
        headers=headers,
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=300) as response:
            response_text = response.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as error:
        body_preview = error.read().decode("utf-8", errors="replace")[:1500]
        # Detect token_expired specifically — surface a useful next-step.
        if error.code == 401 and "token_expired" in body_preview:
            sys.exit(
                "pixeltamer_codex_oauth: codex access_token expired. "
                "Run `codex login` to mint a fresh one. "
                "(If you're behind a local codex proxy that should auto-refresh, "
                "check that the proxy is reachable.)"
            )
        sys.exit(
            f"pixeltamer_codex_oauth: HTTP {error.code} {error.reason}\n"
            f"Response body:\n{body_preview}"
        )
    except urllib.error.URLError as error:
        sys.exit(f"pixeltamer_codex_oauth: connection error: {error}")

    events = parse_sse_stream(response_text)
    image_b64 = extract_image_b64(events)

    if not image_b64:
        # Save raw response for diagnosis.
        debug_path = out.parent / f"{out.stem}.debug-response.txt"
        out.parent.mkdir(parents=True, exist_ok=True)
        debug_path.write_text(response_text, encoding="utf-8")
        sys.exit(
            f"pixeltamer_codex_oauth: response stream completed without an "
            f"image_generation_call result.\n"
            f"Raw SSE saved to: {debug_path}\n"
            f"Likely causes: (a) the model declined to call image_generation, "
            f"(b) the response shape changed upstream, or (c) the request "
            f"was rejected silently."
        )

    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_bytes(base64.b64decode(image_b64))

    if debug:
        # Quick event summary so the caller can see what happened.
        event_types: dict[str, int] = {}
        for ev in events:
            t = (ev.get("data") or {}).get("type", "?")
            event_types[t] = event_types.get(t, 0) + 1
        print(f"[debug] {len(events)} SSE events:", file=sys.stderr)
        for t, n in sorted(event_types.items(), key=lambda x: -x[1]):
            print(f"[debug]   {n:3} × {t}", file=sys.stderr)

    return out


# --------------------------------------------------------------------------- subcommand handlers

def cmd_generate(args: argparse.Namespace) -> int:
    """text -> image. Reference images are optional."""
    images = [Path(p) for p in (args.image or [])]
    out = run_one(
        prompt=args.prompt,
        images=images,
        size=args.size,
        out=Path(args.out),
        debug=args.debug,
    )
    print(out.resolve())
    return 0


def cmd_edit(args: argparse.Namespace) -> int:
    """1 source image + prompt -> edited image."""
    if not args.image or len(args.image) != 1:
        sys.exit("pixeltamer_codex_oauth: edit requires exactly one -i/--image")
    out = run_one(
        prompt=args.prompt,
        images=[Path(args.image[0])],
        size=args.size,
        out=Path(args.out),
        debug=args.debug,
    )
    print(out.resolve())
    return 0


def cmd_compose(args: argparse.Namespace) -> int:
    """2-16 reference images + prompt -> composed image."""
    if not args.image or not (2 <= len(args.image) <= 16):
        sys.exit("pixeltamer_codex_oauth: compose requires 2-16 -i/--image")
    out = run_one(
        prompt=args.prompt,
        images=[Path(p) for p in args.image],
        size=args.size,
        out=Path(args.out),
        debug=args.debug,
    )
    print(out.resolve())
    return 0


# --------------------------------------------------------------------------- main

def _add_common_flags(p: argparse.ArgumentParser) -> None:
    p.add_argument("-p", "--prompt", required=True, help="image description (quote it)")
    p.add_argument("-o", "--out", required=True, help="output PNG path")
    p.add_argument("-i", "--image", action="append",
                   help="reference image; repeatable (-i a -i b -i c)")
    p.add_argument("--size", default="auto",
                   choices=SUPPORTED_SIZES,
                   help="output size (default auto)")
    p.add_argument("--quality",
                   choices=("low", "medium", "high", "auto"),
                   default="high",
                   help="quality dial — accepted for CLI parity with API "
                        "backend, but Responses API doesn't expose this knob "
                        "directly; flag is recorded but not currently sent")
    p.add_argument("--debug", action="store_true",
                   help="print SSE event summary on stderr")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="pixeltamer_codex_oauth",
        description="Codex-OAuth backend for pixeltamer edit + compose modes.",
    )
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_gen = sub.add_parser("generate", help="text -> image")
    _add_common_flags(p_gen)
    p_gen.set_defaults(func=cmd_generate)

    p_edit = sub.add_parser("edit", help="1 source image + prompt -> edited image")
    _add_common_flags(p_edit)
    p_edit.set_defaults(func=cmd_edit)

    p_comp = sub.add_parser("compose", help="2-16 references + prompt -> composed")
    _add_common_flags(p_comp)
    p_comp.set_defaults(func=cmd_compose)

    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
