#!/usr/bin/env python3
"""pixeltamer_api.py — call GPT Image models over an OpenAI-compatible Images API.

Subcommands:
  generate   POST /images/generations  (text -> image)
  edit       POST /images/edits        (1 source image + optional mask)
  compose    POST /images/edits        (2-16 reference images, blended into one output)

Auth:
  OPENAI_IMAGE_API_KEY   — preferred, image-specific key
  OPENAI_API_KEY         — fallback
  OPENAI_IMAGE_BASE_URL  — override base URL (default https://api.openai.com/v1)
  OPENAI_BASE_URL        — fallback for base URL
  OPENAI_IMAGE_MODEL     — override default model (default gpt-image-2.6-flare)

Transport mode (set by the dispatcher for `--backend codex-images`):
  PIXELTAMER_CODEX_IMAGES=1   — talk to the ChatGPT-backend image service with
      the codex CLI's OAuth token (~/.codex/auth.json) instead of an API key.
      PNG only; size ignored; svg/gif/jpeg/webp/frames/mask/complexity and
      friends are rejected up front (see _validate_codex_images_params). Base
      URL is pinned to chatgpt.com/backend-api/codex — PIXELTAMER_CODEX_IMAGES_BASE
      exists for the test capture server only and must never carry OAuth
      credentials to another host.

Env file loading: looks for .env in cwd, ~/.config/pixeltamer/.env, ~/.claude/.env,
and the script directory. First match wins. Existing process env is never overridden.

`-n N` always fires N parallel single-image calls. Faster wall-clock than asking
the API for n=N in one call, and works even if the host doesn't accept n>1.

Outputs are written to disk; absolute paths are printed one per line on stdout
so callers can capture them cleanly.

No third-party dependencies — uses urllib only. Runs on any Python 3.7+.
"""
from __future__ import annotations

import argparse
import base64
import json
import mimetypes
import os
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
import platform
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any, NoReturn

# ------------------------------------------------------------------ json mode

# The contract, in one sentence: with --json, stdout carries exactly one JSON
# object, on every path out of this program, no exceptions. A JSON mode that
# emits prose on one unlucky branch is worse than no JSON mode, because a caller
# writes `JSON.parse(stdout)` and it works right up until it doesn't.
#
# Getting there without typing all ~75 exit sites: raise instead of exiting, and
# catch everything at the top. `_fail()` carries a real code where we have one;
# a bare `sys.exit("...")` from older code is caught and reported as
# `internal_error` with its message preserved. Nothing escapes as prose.
SCHEMA_VERSION = 1

# Set by a pre-scan of argv, because argparse prints its own prose and exits
# before any of our code runs.
JSON_MODE = "--json" in sys.argv[1:]

# Paths collected in JSON mode instead of printed as they land.
_outputs: list[Path] = []

# Set when the caller asked for transparency, so the result can be checked
# against the request rather than just reported.
_requested_transparent = False


class PixeltamerError(Exception):
    """A failure with a machine-readable code.

    @param code - stable identifier the caller branches on
    @param message - human sentence; never parse this
    @param retryable - "yes" | "no" | "unknown". Unknown matters: a timeout
        after the request was sent may have produced an image, and retrying
        blindly duplicates work you already paid for.
    @param details - optional structured context (http_status, field, ...)
    """

    def __init__(self, code: str, message: str, retryable: str = "no", **details):
        super().__init__(message)
        self.code = code
        self.message = message
        self.retryable = retryable
        self.details = details


def _fail(code: str, message: str, retryable: str = "no", **details) -> NoReturn:
    raise PixeltamerError(code, message, retryable, **details)


def _deliver(path: Path) -> None:
    """Hand a finished file to the caller, however this run reports results.

    Always records the path in _outputs — the transparency postcondition runs
    in both modes and needs to see every produced file, not just the JSON ones.
    """
    _outputs.append(path)
    if not JSON_MODE:
        print(path, flush=True)


def _describe_output(path: Path) -> dict:
    """Metadata for one produced file, including honest alpha reporting."""
    entry: dict = {"path": str(path)}
    try:
        entry["bytes"] = path.stat().st_size
    except OSError:
        pass
    entry["format"] = path.suffix.lstrip(".").lower() or None

    probe = _probe_png(path)
    if probe:
        entry.update(probe)
    return entry


def _probe_png(path: Path) -> dict | None:
    """Read dimensions and alpha coverage via the shared node reader.

    Shelling out to node keeps one implementation of PNG semantics for the whole
    project. Writing a second alpha decoder here in Python is how the bash and
    Python paths would quietly start disagreeing about what "transparent" means.
    """
    helper = Path(__file__).resolve().parent / "lib" / "image-dimensions.mjs"
    if not helper.is_file():
        return None
    script = (
        "import(process.argv[1]).then(m => {"
        "const d = m.readImageDimensions(process.argv[2]);"
        "const c = m.readAlphaCoverage(process.argv[2]);"
        "const a = m.readHasAlphaChannel(process.argv[2]);"
        "process.stdout.write(JSON.stringify({d, c, a}));"
        "}).catch(() => process.stdout.write('{}'));"
    )
    try:
        import subprocess
        out = subprocess.run(
            ["node", "-e", script, str(helper), str(path)],
            capture_output=True, text=True, timeout=30,
        ).stdout
        raw = json.loads(out or "{}")
    except Exception:
        return None

    result: dict = {}
    dims = raw.get("d")
    if dims:
        result["width"] = dims.get("width")
        result["height"] = dims.get("height")

    cov = raw.get("c")
    if cov:
        # measured=true only when we genuinely decoded pixels. Reporting 0 for
        # an unmeasured file would read as "definitely opaque", which is a lie.
        result["alpha"] = {
            "present": True,
            "measured": True,
            "transparent_pct": cov.get("transparentPct"),
            "partial_pct": cov.get("partialPct"),
        }
    else:
        has_alpha = raw.get("a")
        result["alpha"] = {
            "present": None if has_alpha is None else False,
            "measured": False,
            "transparent_pct": None, "partial_pct": None,
            # Structurally knowable even when pixel decoding fails: an RGB
            # PNG (colour type 2) has no alpha channel at all, which the
            # postcondition treats as opaque rather than as "unknown".
            "has_alpha_channel": has_alpha,
        }
    return result


def _check_transparency_postcondition(described: list[dict]) -> None:
    """Asking for transparency and getting an opaque image is a failure.

    `ok: true` has to mean "the asset contract was met", not "a file was
    written" — otherwise the envelope reproduces the exact silent failure the
    alpha metrics exist to expose. Only fires on measured files: an unmeasurable
    one is unknown, not bad.
    """
    if not _requested_transparent:
        return
    opaque = [
        d for d in described
        if (
            # Measured and effectively opaque, OR structurally alpha-less: an
            # RGB PNG carries no alpha channel, so "unknown" would be a lie —
            # the answer is knowably "no alpha".
            ((d.get("alpha") or {}).get("measured")
             and (d["alpha"].get("transparent_pct") or 0) < 1)
            or ((d.get("alpha") or {}).get("has_alpha_channel") is False)
        )
    ]
    if opaque:
        _fail(
            "alpha_not_observed",
            f"--background transparent was requested but {len(opaque)} of "
            f"{len(described)} output(s) came back effectively opaque. The prompt "
            f"most likely described a backdrop, surface or cast shadow, which "
            f"overrides the request.",
            "no",
            opaque_outputs=[d["path"] for d in opaque],
        )


def _emit_success(command: str, backend: str, started: float) -> None:
    payload = {
        "schema_version": SCHEMA_VERSION,
        "ok": True,
        "command": command,
        "backend": backend,
        "duration_ms": int((time.time() - started) * 1000),
        "outputs": [_describe_output(p) for p in _outputs],
    }
    print(json.dumps(payload), flush=True)


def _emit_error(command: str, backend: str, started: float,
                code: str, message: str, retryable: str, details: dict) -> None:
    error: dict = {"code": code, "message": message, "retryable": retryable}
    error.update({k: v for k, v in (details or {}).items() if v is not None})
    payload = {
        "schema_version": SCHEMA_VERSION,
        "ok": False,
        "command": command,
        "backend": backend,
        "duration_ms": int((time.time() - started) * 1000),
        # Files that landed before the failure are still real and still cost
        # money. Report them rather than pretending the run produced nothing.
        "outputs": [_describe_output(p) for p in _outputs],
        "error": error,
    }
    print(json.dumps(payload), flush=True)


# --------------------------------------------------------------------------- env

def _load_env_file(path: Path) -> None:
    """Tiny .env loader. Doesn't override values already in os.environ.

    PIXELTAMER_* keys are refused from .env files on purpose: they flip the
    transport and swap the credential source, so a stray line in some project's
    .env must never be able to redirect OAuth tokens or change which backend a
    `--backend api` invocation actually uses.
    """
    if not path.is_file():
        return
    try:
        for raw in path.read_text(encoding="utf-8").splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            k = k.strip()
            v = v.strip().strip('"').strip("'")
            if k and not k.startswith("PIXELTAMER_") and k not in os.environ:
                os.environ[k] = v
    except Exception:
        pass


_SCRIPT_DIR = Path(__file__).resolve().parent
_HOME = Path.home()
for candidate in (
    Path.cwd() / ".env",
    _HOME / ".config" / "pixeltamer" / ".env",
    _HOME / ".claude" / ".env",
    _SCRIPT_DIR / ".env",
    _SCRIPT_DIR.parent / ".env",
):
    _load_env_file(candidate)

DEFAULT_BASE = (
    os.environ.get("OPENAI_IMAGE_BASE_URL")
    or os.environ.get("OPENAI_BASE_URL")
    or "https://api.openai.com/v1"
)
DEFAULT_MODEL = os.environ.get("OPENAI_IMAGE_MODEL", "gpt-image-2.6-flare")

# ---------------------------------------------------------- codex-images mode

# With PIXELTAMER_CODEX_IMAGES=1 the client talks to OpenAI's ChatGPT-backend
# image service instead of api.openai.com, using the codex CLI's OAuth token
# (~/.codex/auth.json) rather than an API key. Live-verified 2026-11-09:
# transparent backgrounds return real alpha on generate/edit/compose, edits
# take JSON with images[].image_url data URIs (multipart is refused), size and
# output_format are silently ignored (svg falls back to PNG bytes), GIF is
# hard-gated server-side. See references/images26-migration.md item 11.
_CODEX_IMAGES = os.environ.get("PIXELTAMER_CODEX_IMAGES") == "1"
_CODEX_AUTH_PATH = Path(
    os.environ.get("PIXELTAMER_CODEX_AUTH_JSON") or (_HOME / ".codex" / "auth.json")
)
# Base pin: OAuth credentials must never be sent to an arbitrary host. The
# env override exists for the test capture server ONLY and is validated to a
# loopback origin by _codex_images_base() — the dispatcher and docs never set
# it, .env loading refuses PIXELTAMER_* keys, and overriding it in production
# would leak the codex token.
def _codex_images_base() -> str:
    """Resolve the codex-images base URL, refusing non-loopback overrides.

    The override exists so tests can point the transport at a local capture
    server. Anything that isn't 127.0.0.1/localhost/[::1] is a hard fail —
    not a warning — because this base URL is where the OAuth bearer token is
    about to be sent.

    @return base URL without a trailing slash
    """
    raw = os.environ.get("PIXELTAMER_CODEX_IMAGES_BASE")
    if not raw:
        return "https://chatgpt.com/backend-api/codex"
    host = (urllib.parse.urlsplit(raw).hostname or "").lower()
    if host not in ("127.0.0.1", "localhost", "::1"):
        _fail(
            "invalid_argument",
            "PIXELTAMER_CODEX_IMAGES_BASE may only point at a loopback test "
            "capture server (127.0.0.1/localhost); refusing to send the codex "
            f"OAuth token to {host or raw!r}.",
            field="pixeltamer-codex-images-base",
        )
    return raw
_CODEX_SIZE_NOTE = (
    "pixeltamer: codex-images route does not honour --size — the service "
    "picks the canvas (edits tend to follow the input aspect). Size was "
    "not sent."
)


def _codex_oauth_token() -> tuple[str, str]:
    """Read (access_token, account_id) from the codex CLI's auth.json.

    No refresh flow: refreshing in memory would rotate the refresh token
    without updating auth.json, breaking codex's own session. On expiry the
    user runs any codex command to refresh, then retries. Failures exit with
    guidance pointing at either codex login or the API-key backend.

    @return (access_token, account_id) from tokens, both non-empty
    """
    if not _CODEX_AUTH_PATH.exists():
        _fail(
            "auth_missing",
            f"{_CODEX_AUTH_PATH} not found. Run `codex login` first, or use "
            "the API-key backend (--backend api) instead.",
        )
    try:
        auth = json.loads(_CODEX_AUTH_PATH.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        _fail("auth_invalid", f"{_CODEX_AUTH_PATH} is not valid JSON: {e}")
    tokens = auth.get("tokens") or {}
    token = (tokens.get("access_token") or "").strip()
    account = (tokens.get("account_id") or "").strip()
    if not token:
        _fail(
            "auth_missing",
            f"{_CODEX_AUTH_PATH} has no tokens.access_token. Run `codex login`.",
        )
    return token, account


def _codex_images_headers() -> dict:
    """Headers that get the ChatGPT-backend image route past its front door.

    Without the codex originator/user-agent pair the route returns a
    Cloudflare HTML block page rather than a JSON error. Verified live.

    @return header dict for POSTs to the codex-images route
    """
    token, account = _codex_oauth_token()
    sid = str(uuid.uuid4())
    ua = (
        f"codex_exec/0.161.0 ({platform.system()} {platform.release()}; "
        f"{platform.machine()}) (pixeltamer codex-images)"
    )
    return {
        "Authorization": f"Bearer {token}",
        "ChatGPT-Account-ID": account,
        "Content-Type": "application/json",
        "Accept": "application/json",
        "originator": "codex_exec",
        "user-agent": ua,
        "session-id": sid,
        "thread-id": sid,
        "x-client-request-id": sid,
        "x-codex-imagegen-request-id": str(uuid.uuid4()),
    }


def _validate_codex_images_params(a: argparse.Namespace, out_fmt: str | None) -> None:
    """Fail closed on everything not verified live on the codex-images route.

    The route silently ignores size, silently downgrades svg requests to PNG
    bytes, and 400s GIF with a feature-gate error — so a caller pointing a
    .svg output path at this backend would get a PNG saved as .svg without
    this gate. Verified surface: png output, background=transparent (real
    alpha), quality, n, edits/compose via images[].image_url.

    @param a parsed argparse namespace for the current subcommand
    @param out_fmt resolved output format or None (server default png)
    """
    if out_fmt == "svg":
        _fail(
            "invalid_argument",
            "SVG export is not available on the codex subscription route: the "
            "service silently returns PNG bytes for svg requests. Use --backend "
            "api with OPENAI_IMAGE_API_KEY for real SVG.",
            field="output-format",
        )
    if out_fmt == "gif":
        _fail(
            "invalid_argument",
            "GIF output is hard-gated on the codex subscription route (the "
            "server 400s with 'GIF output is not enabled'). Use --backend codex "
            "for agent-assembled GIFs, or --backend api for native GIF.",
            field="output-format",
        )
    if out_fmt in ("jpeg", "webp"):
        _fail(
            "invalid_argument",
            f"{out_fmt} output is not yet verified on the codex-images route. "
            "Use --backend api, or omit --output-format (png is what this "
            "route returns).",
            field="output-format",
        )
    if getattr(a, "frames", None) or getattr(a, "frame_ms", None):
        _fail(
            "invalid_argument",
            "--frames/--frame-ms are GIF-only and GIF is not available on the "
            "codex subscription route.",
            field="frames",
        )
    if getattr(a, "mask", None):
        _fail(
            "invalid_argument",
            "--mask (inpainting) is not verified on the codex-images route. "
            "Use --backend api for masked edits.",
            field="mask",
        )
    if getattr(a, "input_fidelity", None):
        _fail(
            "invalid_argument",
            "--input-fidelity is not supported on the codex-images route "
            "(2.6 edits reject it regardless).",
            field="input-fidelity",
        )
    if getattr(a, "complexity", None):
        _fail(
            "invalid_argument",
            "--complexity is not verified on the codex-images route (the "
            "service may ignore it silently). Use --backend api.",
            field="complexity",
        )
    if getattr(a, "output_compression", None) is not None:
        _fail(
            "invalid_argument",
            "--output-compression applies only to jpeg/webp output, neither "
            "of which is verified on the codex-images route. Drop it.",
            field="output-compression",
        )
    if getattr(a, "moderation", None):
        _fail(
            "invalid_argument",
            "--moderation is not verified on the codex-images route. "
            "Use --backend api.",
            field="moderation",
        )
    if getattr(a, "user", None):
        _fail(
            "invalid_argument",
            "--user is not forwarded on the codex-images route (the service "
            "derives safety_identifier from the codex account). Drop it.",
            field="user",
        )
    if a.model != DEFAULT_MODEL:
        print(
            f"pixeltamer: note — model {a.model} was not verified on the "
            f"codex-images route (only {DEFAULT_MODEL} was tested live); "
            "the service may reject or silently swap it.",
            file=sys.stderr,
        )


def _data_uri(path: str) -> str:
    """Encode a local image file as a data URI for the codex-images edits body.

    @param path filesystem path to a PNG/JPEG/WebP file
    @return "data:<mime>;base64,<...>" string
    """
    fp = Path(path).expanduser()
    if not fp.exists():
        _fail("input_not_found", f"file not found: {fp}", path=str(fp))
    mime = mimetypes.guess_type(fp.name)[0] or "image/png"
    return f"data:{mime};base64,{base64.b64encode(fp.read_bytes()).decode('ascii')}"
DEFAULT_QUALITY = "high"
DEFAULT_CONCURRENCY = 4
MAX_REFERENCE_IMAGES = 16
MAX_SIDE = 3840
MAX_RATIO = 3.0
# 3840x2160 exactly. Also what makes 2880x2880 the practical square ceiling.
MIN_TOTAL_PIXELS = 655_360
MAX_TOTAL_PIXELS = 8_294_400
# GPT Image 2+ takes arbitrary WxH, but both edges must be divisible by 16.
SIZE_EDGE_MULTIPLE = 16

# Shorthands people actually type. Resolved before validation.
SIZE_ALIASES = {
    "2k": "2048x2048",
    "4k": "3840x2160",
}


# ---------------------------------------------------------------------------- io

def _key() -> str:
    """Resolve the API key, with a clear error if missing."""
    key = os.environ.get("OPENAI_IMAGE_API_KEY") or os.environ.get("OPENAI_API_KEY")
    if not key:
        sys.exit(
            "ERROR: no API key found. Set one of:\n"
            "  export OPENAI_IMAGE_API_KEY='sk-...'\n"
            "  export OPENAI_API_KEY='sk-...'\n"
            "Or run `pixeltamer config` to set up interactively."
        )
    return key


def _resolve_size(size: str) -> str:
    """Expand a size alias (2K / 4K) to its WxH form. Pass anything else through."""
    return SIZE_ALIASES.get(size.strip().lower(), size)


def _uses_gpt_image_2_size_floor(model: str) -> bool:
    """Return whether OpenAI documents the 655,360px floor for this model family.

    Custom providers can expose unrelated size rules behind arbitrary model IDs,
    so only enforce the floor for GPT Image 2 / 2.5 / 2.6 aliases and snapshots.
    """
    normalized = model.lower()
    return normalized == "gpt-image-2" or normalized.startswith("gpt-image-2-") or normalized.startswith("gpt-image-2.5-") or normalized.startswith("gpt-image-2.6-")


def _is_gpt_image_26(model: str) -> bool:
    """Return whether the model is the GPT Image 2.6 family.

    2.6 adds `complexity`, GIF output, and SVG output; it drops `input_fidelity`
    on edits. Feature gating keys off this so a 2.5 model never receives a
    2.6-only parameter (the API answers unknown params with a 400).
    """
    normalized = model.lower()
    return normalized == "gpt-image-2.6" or normalized.startswith("gpt-image-2.6-")


def _validate_size(size: str, model: str, frames: int = 1) -> None:
    """Reject sizes the selected model won't accept, before paying for a roundtrip.

    Four constraints, all from OpenAI's spec. Every one of these is a 400 you'd
    otherwise pay a network roundtrip to discover:

      - both edges divisible by 16
      - longest edge at most 3840
      - total pixels from 655,360 through 8,294,400 (the upper bound is
        3840x2160, and is also why 2880x2880 is the practical square ceiling)
      - aspect ratio within 3:1 either way

    For GIF output, `size` is per-frame: the 655,360 floor doesn't apply to
    each frame (small sticker frames are legitimate), but the total budget
    covers every frame — frames × w × h must stay under the cap. `frames`
    is the EFFECTIVE count: the server defaults to 9 when frame_count is
    omitted, so callers must pass 9, not 1, for GIF requests without an
    explicit --frames.
    """
    if size in ("auto", ""):
        return
    try:
        w, h = (int(x) for x in size.lower().split("x", 1))
    except Exception:
        _fail("invalid_size", f"--size must be WxH, 2K, 4K or 'auto' (got {size!r})", field="size")
    if w <= 0 or h <= 0:
        _fail("invalid_size", f"--size dimensions must be positive (got {size!r})", field="size")
    # Inclusive: 3840x2160 is the documented maximum, not one past it.
    if max(w, h) > MAX_SIDE:
        _fail("invalid_size", f"longest side must be ≤ {MAX_SIDE}px (got {max(w, h)}px)", field="size")
    off = [f"{name}={v}" for name, v in (("width", w), ("height", h))
           if v % SIZE_EDGE_MULTIPLE]
    if off:
        _fail(
            "invalid_size",
            f"both edges must be divisible by {SIZE_EDGE_MULTIPLE} "
            f"({', '.join(off)}). Nearest valid: "
            f"{round(w / SIZE_EDGE_MULTIPLE) * SIZE_EDGE_MULTIPLE}x"
            f"{round(h / SIZE_EDGE_MULTIPLE) * SIZE_EDGE_MULTIPLE}"
        )
    pixels = w * h
    if frames > 1:
        total = pixels * frames
        if total > MAX_TOTAL_PIXELS:
            _fail(
                "invalid_size",
                f"GIF total pixel budget exceeded: {w}x{h} x {frames} frames "
                f"= {total:,} > {MAX_TOTAL_PIXELS:,}. Shrink the frame size "
                "or the frame count.",
            )
    elif _uses_gpt_image_2_size_floor(model) and pixels < MIN_TOTAL_PIXELS:
        _fail(
            "invalid_size",
            f"total pixels must be ≥ {MIN_TOTAL_PIXELS:,} "
            f"(got {pixels:,} for {w}x{h})."
        )
    if pixels > MAX_TOTAL_PIXELS:
        _fail(
            "invalid_size",
            f"total pixels must be ≤ {MAX_TOTAL_PIXELS:,} "
            f"(got {pixels:,} for {w}x{h}). 3840x2160 and 2880x2880 both sit "
            f"exactly on the cap."
        )
    ratio = max(w, h) / min(w, h)
    if ratio > MAX_RATIO:
        _fail("invalid_size", f"aspect ratio must be ≤ {MAX_RATIO:.0f}:1 (got {ratio:.2f}:1)", field="size")


# ------------------------------------------------------------- transparency

# Formats that can actually carry an alpha channel. JPEG can't — it has no alpha,
# so `--background transparent --output-format jpeg` is a guaranteed silent
# disappointment (you get an opaque image and no error from the API).
ALPHA_CAPABLE_FORMATS = ("png", "webp")


# What each output_format is allowed to be called on disk. Writing WebP bytes
# into a .png is the kind of thing nothing complains about until some downstream
# tool sniffs the extension instead of the magic bytes.
_FORMAT_EXTS = {
    "png": (".png",),
    "jpeg": (".jpg", ".jpeg"),
    "webp": (".webp",),
    "gif": (".gif",),
    "svg": (".svg",),
}


def _check_extension_matches(fmt: str | None, out: str | None) -> None:
    """Refuse an output path whose extension contradicts the requested format.

    Runs for every format, not just transparent ones — `--output-format jpeg
    -o thing.png` was silently writing mislabeled bytes.

    @param fmt - resolved output_format, or None when the API default applies
    @param out - the -o value, or None
    """
    if not out:
        return
    # No explicit format means the API default (png) — hold it to the png rule
    # rather than letting an unlabelled request write anything anywhere.
    effective = fmt or "png"
    allowed = _FORMAT_EXTS.get(effective)
    if not allowed:
        return
    ext = Path(out).suffix.lower()
    # An extension we don't recognise at all is the caller's business.
    known = {e for exts in _FORMAT_EXTS.values() for e in exts}
    if ext in known and ext not in allowed:
        _fail(
            "invalid_argument",
            f"output format {effective} writes {'/'.join(allowed)} bytes, but -o "
            f"ends in {ext}. Fix the extension or pass --output-format to match.",
            field="out",
        )


def _resolve_output_format(a: argparse.Namespace) -> str | None:
    """Work out the `output_format` value to send, and guard the alpha footguns.

    Two things go wrong here if we don't intervene:

    1. `--background transparent` with no `--output-format`. The API's default is
       png, so this happens to work — but "happens to work" is not a contract.
       We pin it to png explicitly.
    2. `--background transparent --output-format jpeg`. JPEG has no alpha channel.
       The API won't complain; you'll just get an opaque image and wonder why.
       We refuse up front.

    Also catches the sneakier version of (2): the output *path* ends in `.jpg`
    while the requested format is alpha-capable. The file would be a PNG wearing a
    JPEG extension — technically transparent, practically broken in half the tools
    that open it.

    @param a - parsed args (reads .background, .output_format, .out)
    @returns the output_format string to send, or None to let the API default
    """
    fmt = a.output_format
    if a.background != "transparent":
        return fmt

    # Pin the default. The spec says: when using transparent, set output format
    # to png or webp. Don't rely on the server-side default staying png.
    if fmt is None:
        fmt = "png"

    if fmt == "svg":
        # SVG transparency is real and officially supported — but it's vector
        # paint order, not an alpha channel, so the raster alpha probe can't
        # verify it. Allow it, and say the check doesn't apply.
        print(
            "pixeltamer: note — SVG transparency is sent as requested but not "
            "alpha-verified (SVG has no raster alpha channel to measure); "
            "check the render visually.",
            file=sys.stderr,
        )
        return fmt

    if fmt not in ALPHA_CAPABLE_FORMATS:
        if fmt == "gif":
            _fail(
                "invalid_argument",
                "--background transparent is not offered with GIF output: GIF "
                "transparency is binary palette transparency, not an alpha "
                "channel, and pixeltamer's verification can't measure it. "
                "Use png or webp for cutouts.",
                field="output-format",
            )
        _fail(
            "invalid_argument",
            f"--background transparent needs an alpha-capable format; {fmt} has "
            f"no alpha channel. Use --output-format png (or webp).",
            field="output-format",
        )

    return fmt


# GIF frames/timing contract (Images 2.6, official docs).
GIF_MIN_FRAMES = 2
GIF_MAX_FRAMES = 16
GIF_DEFAULT_FRAMES = 9  # server default when frame_count is omitted
GIF_MIN_FRAME_MS = 20
GIF_MAX_FRAME_MS = 2000


def _validate_gif_params(a: argparse.Namespace, fmt: str | None, model: str) -> None:
    """Pre-flight the GIF-specific parameters before a paid roundtrip.

    Contract (official image-generation guide): `frame_count` (2-16) and
    `frame_duration_ms` (20-2000, rounded by the API to 10ms steps) are only
    valid when output_format=gif; GIF requests take no output_compression;
    `size` is per-frame. Frames/timing passed without a GIF target are a
    footgun (the params would be silently ignored or 400), so they're a hard
    reject — the codex wrapper enforces the same rule for its .gif targets.

    @param a - parsed args (reads .frames, .frame_ms, .output_compression)
    @param fmt - resolved output_format, or None for the API default
    @param model - selected model id
    """
    is_gif = fmt == "gif"
    wants_frames = getattr(a, "frames", None) is not None
    wants_ms = getattr(a, "frame_ms", None) is not None
    if (wants_frames or wants_ms) and not is_gif:
        _fail(
            "invalid_argument",
            "--frames/--frame-ms require GIF output. Add --output-format gif "
            "(and write to a .gif path), or drop the frame flags.",
            field="frames",
        )
    if wants_frames and not GIF_MIN_FRAMES <= a.frames <= GIF_MAX_FRAMES:
        _fail(
            "invalid_argument",
            f"--frames must be {GIF_MIN_FRAMES}-{GIF_MAX_FRAMES} (got {a.frames})",
            field="frames",
        )
    if wants_ms and not GIF_MIN_FRAME_MS <= a.frame_ms <= GIF_MAX_FRAME_MS:
        _fail(
            "invalid_argument",
            f"--frame-ms must be {GIF_MIN_FRAME_MS}-{GIF_MAX_FRAME_MS} "
            f"(got {a.frame_ms}); the API rounds to 10ms steps",
            field="frame-ms",
        )
    if fmt in ("gif", "svg") and a.output_compression is not None:
        _fail(
            "invalid_argument",
            "--output-compression applies only to jpeg/webp output; drop it.",
            field="output-compression",
        )
    if getattr(a, "complexity", None) and not _is_gpt_image_26(model):
        _fail(
            "invalid_argument",
            f"--complexity is a GPT Image 2.6 parameter; {model} would reject "
            "it with a 400. Drop it or switch to a 2.6 model.",
            field="complexity",
        )


_print_lock = threading.Lock()


class _SameOriginRedirect(urllib.request.HTTPRedirectHandler):
    """Follow same-origin redirects; refuse cross-origin ones with an HTTPError.

    urllib forwards Authorization headers when it follows a redirect. These
    requests all carry a bearer credential — an API key or a codex OAuth
    token — so a 30x pointing at another host would hand that credential to
    whoever controls the Location. Same-origin hops (http→https on one host,
    trailing-slash fixes) stay allowed.
    """

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        old = urllib.parse.urlsplit(req.full_url)
        new = urllib.parse.urlsplit(newurl)
        if (old.scheme, old.hostname, old.port) == (new.scheme, new.hostname, new.port):
            return super().redirect_request(req, fp, code, msg, headers, newurl)
        return None


_OPENER = urllib.request.build_opener(_SameOriginRedirect)


def _send(req: urllib.request.Request, retries: int = 4) -> dict:
    """POST with exponential backoff on 429/5xx; surface 4xx (except 429) immediately."""
    last_err: str | None = None
    for attempt in range(retries):
        try:
            with _OPENER.open(req, timeout=600) as resp:
                return json.loads(resp.read())
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", "replace")
            retriable = e.code == 429 or 500 <= e.code < 600
            if retriable and attempt < retries - 1:
                wait = 2 ** attempt + (0.1 * attempt)
                time.sleep(wait)
                last_err = f"HTTP {e.code}: {body[:200]}"
                continue
            # 403 commonly means the org has not been verified for GPT Image access.
            hint = ""
            if e.code == 401 and _CODEX_IMAGES:
                hint = (
                    "\n  hint: the codex OAuth token is expired or invalid. Run any "
                    "`codex` command (or `codex login`) to refresh "
                    f"{_CODEX_AUTH_PATH}, then retry. No refresh is attempted "
                    "in-place so codex's own session stays intact."
                )
            elif e.code == 403 and _CODEX_IMAGES:
                hint = (
                    "\n  hint: chatgpt.com blocked this request before it reached "
                    "the image service (Cloudflare). Check network/VPN reachability."
                )
            elif e.code == 403:
                hint = (
                    "\n  hint: verify your org for GPT Image models at "
                    "https://platform.openai.com/settings/organization/general"
                )
            sys.exit(f"HTTP {e.code} from {req.full_url}\n{body}{hint}")
        except urllib.error.URLError as e:
            last_err = f"network error: {e}"
            if attempt < retries - 1:
                time.sleep(2 ** attempt)
                continue
            sys.exit(last_err)
    sys.exit(last_err or "unknown error")


def _request_headers(content_type: str) -> dict:
    """Auth headers for the active transport.

    @param content_type value for the Content-Type header
    @return header dict: API-key bearer for api.openai.com, OAuth + codex
        identity headers for the codex-images route
    """
    if _CODEX_IMAGES:
        return _codex_images_headers()
    return {
        "Authorization": f"Bearer {_key()}",
        "Content-Type": content_type,
        "Accept": "application/json",
    }


def _post_json(path: str, payload: dict) -> dict:
    base = _codex_images_base() if _CODEX_IMAGES else DEFAULT_BASE
    url = base.rstrip("/") + path
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers=_request_headers("application/json"),
        method="POST",
    )
    return _send(req)


def _post_multipart(path: str, fields: dict, files: dict[str, list[str]]) -> dict:
    """Multipart POST — used by /images/edits because it accepts file uploads."""
    url = DEFAULT_BASE.rstrip("/") + path
    boundary = f"----pixeltamer{int(time.time() * 1000)}{threading.get_ident()}"
    parts: list[bytes] = []

    for k, v in fields.items():
        if v is None:
            continue
        parts.append(
            f"--{boundary}\r\n"
            f'Content-Disposition: form-data; name="{k}"\r\n\r\n'
            f"{v}\r\n".encode("utf-8")
        )

    for field_name, paths in files.items():
        for raw in paths:
            fp = Path(raw).expanduser()
            if not fp.exists():
                _fail("input_not_found", f"file not found: {fp}", path=str(fp))
            mime = mimetypes.guess_type(fp.name)[0] or "image/png"
            # Multi-reference: when more than one image is attached for a single
            # field, send them as field[] entries (PHP/OpenAI convention).
            name = field_name if len(paths) == 1 else f"{field_name}[]"
            parts.append(
                f"--{boundary}\r\n"
                f'Content-Disposition: form-data; name="{name}"; '
                f'filename="{fp.name}"\r\n'
                f"Content-Type: {mime}\r\n\r\n".encode("utf-8")
            )
            parts.append(fp.read_bytes())
            parts.append(b"\r\n")

    parts.append(f"--{boundary}--\r\n".encode("utf-8"))
    body = b"".join(parts)
    req = urllib.request.Request(
        url,
        data=body,
        headers=_request_headers(f"multipart/form-data; boundary={boundary}"),
        method="POST",
    )
    return _send(req)


def _download(url: str) -> bytes:
    with urllib.request.urlopen(url, timeout=300) as r:
        return r.read()


def _output_paths(out_arg: str | None, n: int) -> list[Path]:
    """Resolve the destination path(s) for n images. Auto-numbers if n > 1."""
    if out_arg is None:
        base = Path.cwd() / f"pixeltamer-{int(time.time())}"
        ext = ".png"
    else:
        p = Path(out_arg).expanduser()
        # Treat a trailing slash, an existing dir, or no extension as "directory".
        is_dir_like = (
            (p.exists() and p.is_dir())
            or out_arg.endswith("/")
            or (p.suffix == "" and not p.exists())
        )
        if is_dir_like:
            p.mkdir(parents=True, exist_ok=True)
            base = p / "image"
            ext = ".png"
        else:
            base = p.with_suffix("")
            ext = p.suffix or ".png"
            base.parent.mkdir(parents=True, exist_ok=True)

    return [
        Path(f"{base}{'' if n == 1 else f'-{i + 1:02d}'}{ext}")
        for i in range(n)
    ]


def _sniff_output_format(dest: Path, requested: str | None) -> None:
    """Verify saved bytes match the requested output format before success.

    `ok: true` has to mean "the asset contract was met". A server that
    silently falls back (PNG bytes at a .svg path, a still at a .gif path)
    would otherwise be published as a verified success and flow into batch
    pipelines unchecked.

    Raster formats other than gif/svg are skipped — their payloads are
    opaque and the extension match already happened pre-flight; the
    transparency postcondition covers the png/webp alpha case.

    @param dest written file path
    @param requested output_format sent with the request, or None
    @raises RuntimeError on a format mismatch
    """
    if requested not in ("svg", "gif"):
        return
    head = dest.open("rb").read(512)
    if requested == "svg":
        # SVG may start with a BOM, XML declaration, comment or doctype; the
        # root tag must appear near the head for this to be an SVG document.
        if b"<svg" not in head.lower():
            _fail(
                "output_format_mismatch",
                f"{dest.name}: requested output_format=svg but the response "
                f"bytes are not SVG (no <svg> element in the first 512 "
                f"bytes). The server likely fell back to another format.",
            )
        return
    if not head.startswith(b"GIF8"):
        _fail(
            "output_format_mismatch",
            f"{dest.name}: requested output_format=gif but the response "
            f"bytes do not carry a GIF signature. The server likely fell "
            f"back to another format.",
        )


def _write_item(item: dict, dest: Path, requested_format: str | None = None) -> Path:
    """Decode b64 or download URL, write to dest, sniff format, return path.

    Deliberately does NOT print. stdout is a promise about the whole run, and
    only the caller knows whether the run finished — printing from inside a
    worker thread is what let a failed batch emit half its paths and then exit
    non-zero, which a caller reading stdout cannot tell apart from success.

    @param item response data item with b64_json or url
    @param dest target file path
    @param requested_format output_format the request asked for, if any
    @returns resolved written path
    @raises RuntimeError on download failure or format mismatch
    """
    if item.get("b64_json"):
        dest.write_bytes(base64.b64decode(item["b64_json"]))
    elif item.get("url"):
        dest.write_bytes(_download(item["url"]))
    else:
        raise RuntimeError(f"response item missing b64_json/url: {item}")
    _sniff_output_format(dest, requested_format)
    return dest.resolve()


def _run_parallel(n: int, concurrency: int, fn, paths: list[Path],
                  requested_format: str | None = None) -> list[Path]:
    """Fire n independent calls; return the paths that actually landed.

    Genuinely partial-failure tolerant, which is what the docs have always
    claimed: one call failing no longer discards the images the others already
    produced and you already paid for.

    Two rules about stdout follow from that:

      - nothing is printed until every call has settled, so a caller reading
        stdout never sees a half-finished run that later exits non-zero;
      - paths come out in request order, not completion order, so `-n 4 | head -1`
        means something.

    Exit status carries completeness: 0 when all n landed, non-zero when fewer
    did. The paths on stdout are always real files either way.

    @param requested_format forwarded to _write_item for format sniffing
    """
    results: list[Path | None] = [None] * n
    failures: list[tuple[int, str]] = []
    workers = max(1, min(concurrency, n))

    with ThreadPoolExecutor(max_workers=workers) as ex:
        futures = {ex.submit(fn): i for i in range(n)}
        for fut in as_completed(futures):
            i = futures[fut]
            try:
                data = fut.result()
                items = data.get("data") or []
                if not items:
                    raise RuntimeError(
                        f"empty response: {json.dumps(data)[:300]}"
                    )
                results[i] = _write_item(items[0], paths[i], requested_format)
            except SystemExit as e:
                # A worker called sys.exit (e.g. _post_json on a 4xx). Capture
                # it as this call's failure instead of tearing down the batch.
                failures.append((i, str(e) or "request failed"))
            except Exception as e:
                failures.append((i, f"{type(e).__name__}: {e}"))

    landed = [r for r in results if r is not None]

    if failures:
        for i, msg in sorted(failures):
            print(f"ERROR: image {i + 1}/{n} failed: {msg}", file=sys.stderr)
        print(
            f"pixeltamer: {len(landed)}/{n} images generated; "
            f"{len(failures)} failed.",
            file=sys.stderr,
        )

    # Request order, and only once everything has settled.
    for path in landed:
        _deliver(path)

    if failures:
        _fail(
            "partial_failure",
            f"{len(landed)}/{n} images generated; {len(failures)} failed",
            "unknown",
            requested=n, produced=len(landed), failed=len(failures),
        )
    return landed


# ----------------------------------------------------------------------- commands

def cmd_generate(a: argparse.Namespace) -> None:
    if _CODEX_IMAGES:
        # Verified surface only: png output, no size control, no complexity.
        out_fmt = _resolve_output_format(a)
        _check_extension_matches(out_fmt, a.out)
        _validate_codex_images_params(a, out_fmt)
        print(_CODEX_SIZE_NOTE, file=sys.stderr)
        payload: dict = {
            "model": a.model,
            "prompt": a.prompt,
            "n": 1,
        }
        if a.quality:
            payload["quality"] = a.quality
        if a.background:
            global _requested_transparent
            _requested_transparent = _requested_transparent or a.background == "transparent"
            payload["background"] = a.background
        paths = _output_paths(a.out, a.n)
        if a.n == 1:
            data = _post_json("/images/generations", payload)
            items = data.get("data") or []
            if not items:
                _fail("response_invalid", f"empty response from the image API: {json.dumps(data)[:300]}", "unknown")
            _deliver(_write_item(items[0], paths[0], out_fmt))
            return
        _run_parallel(
            n=a.n,
            concurrency=a.concurrency,
            fn=lambda: _post_json("/images/generations", payload),
            paths=paths,
            requested_format=out_fmt,
        )
        return
    a.size = _resolve_size(a.size)
    out_fmt = _resolve_output_format(a)
    _check_extension_matches(out_fmt, a.out)
    _validate_gif_params(a, out_fmt, a.model)
    # Server defaults frame_count to 9 when omitted — validate against that,
    # not 1, or a small GIF slips past the per-frame budget here and 400s there.
    frames = (a.frames or GIF_DEFAULT_FRAMES) if out_fmt == "gif" else 1
    _validate_size(a.size, a.model, frames=frames)
    payload: dict = {
        "model": a.model,
        "prompt": a.prompt,
        "n": 1,
        "size": a.size,
    }
    if a.quality:
        payload["quality"] = a.quality
    if getattr(a, "complexity", None):
        payload["complexity"] = a.complexity
    # `style` is a DALL-E-3 parameter. gpt-image models reject it, so sending it
    # turns a harmless no-op flag into a 400. Only forward it when the model
    # actually looks like DALL-E — which keeps it working for anyone pointing
    # OPENAI_IMAGE_BASE_URL at a proxy that still serves those models.
    if a.style:
        if "dall-e" in a.model.lower():
            payload["style"] = a.style
        else:
            print(
                f"WARNING: --style is DALL-E-3 only and is ignored by {a.model}; "
                "dropping it from the request.",
                file=sys.stderr,
            )
    if a.background:
        payload["background"] = a.background
        # Declared global in the codex-images branch above; one global per
        # name per function — a second one is a compile-time SyntaxError.
        _requested_transparent = _requested_transparent or a.background == "transparent"
    if out_fmt:
        payload["output_format"] = out_fmt
    if out_fmt == "gif":
        if a.frames is not None:
            payload["frame_count"] = a.frames
        if a.frame_ms is not None:
            payload["frame_duration_ms"] = a.frame_ms
    if a.output_compression is not None:
        payload["output_compression"] = a.output_compression
    # Legacy DALL-E param. gpt-image models ignore it (they always return b64),
    # but OpenAI-compatible proxies pointed at by OPENAI_IMAGE_BASE_URL may still
    # honour it — hence the passthrough rather than a hard removal.
    if a.format:
        payload["response_format"] = a.format
    if a.moderation:
        payload["moderation"] = a.moderation
    if a.user:
        payload["user"] = a.user

    paths = _output_paths(a.out, a.n)
    if a.n == 1:
        data = _post_json("/images/generations", payload)
        items = data.get("data") or []
        if not items:
            _fail("response_invalid", f"empty response from the image API: {json.dumps(data)[:300]}", "unknown")
        _deliver(_write_item(items[0], paths[0], out_fmt))
        return
    _run_parallel(
        n=a.n,
        concurrency=a.concurrency,
        fn=lambda: _post_json("/images/generations", payload),
        paths=paths,
        requested_format=out_fmt,
    )


def _edit_or_compose(a: argparse.Namespace, mode: str) -> None:
    """Shared body: 1 image -> edit/inpaint, 2-16 images -> compose."""
    codex_images = _CODEX_IMAGES
    if codex_images:
        print(_CODEX_SIZE_NOTE, file=sys.stderr)
    else:
        a.size = _resolve_size(a.size)
    out_fmt = _resolve_output_format(a)
    _check_extension_matches(out_fmt, a.out)
    if codex_images:
        _validate_codex_images_params(a, out_fmt)
    _validate_gif_params(a, out_fmt, a.model)
    if not codex_images:
        # Same effective-count rule as generate: server default is 9 frames.
        frames = (a.frames or GIF_DEFAULT_FRAMES) if out_fmt == "gif" else 1
        _validate_size(a.size, a.model, frames=frames)
    refs = list(a.image)
    if not refs:
        _fail("invalid_argument", "at least one --image required", field="image")
    if len(refs) > MAX_REFERENCE_IMAGES:
        _fail("invalid_argument", f"at most {MAX_REFERENCE_IMAGES} reference images allowed", field="image")
    if mode == "edit" and len(refs) > 1:
        sys.exit(
            "ERROR: `edit` accepts a single source image. For multi-reference "
            "blends use `compose` instead."
        )

    fields = {
        "model": a.model,
        "prompt": a.prompt,
        "n": "1",
        "size": a.size,
    }
    if a.quality:
        fields["quality"] = a.quality
    if getattr(a, "complexity", None):
        fields["complexity"] = a.complexity
    if getattr(a, "input_fidelity", None):
        if _is_gpt_image_26(a.model):
            _fail(
                "invalid_argument",
                "--input-fidelity is not supported on GPT Image 2.6 edits; the "
                "API rejects requests that include it. Drop it, or use a 2.5 "
                "model via --model gpt-image-2.5-sunburst.",
                field="input-fidelity",
            )
        fields["input_fidelity"] = a.input_fidelity
    if a.background:
        fields["background"] = a.background
        global _requested_transparent
        _requested_transparent = _requested_transparent or a.background == "transparent"
    if out_fmt:
        fields["output_format"] = out_fmt
    if out_fmt == "gif":
        if a.frames is not None:
            fields["frame_count"] = str(a.frames)
        if a.frame_ms is not None:
            fields["frame_duration_ms"] = str(a.frame_ms)
    if a.output_compression is not None:
        fields["output_compression"] = str(a.output_compression)
    # See the note in cmd_generate — kept for proxy compatibility only.
    if a.format:
        fields["response_format"] = a.format
    if a.moderation:
        fields["moderation"] = a.moderation
    if a.user:
        fields["user"] = a.user

    files: dict[str, list[str]] = {"image": refs}
    if getattr(a, "mask", None):
        if mode != "edit":
            _fail("invalid_argument", "--mask is only valid with `edit` (single source)", field="mask")
        files["mask"] = [a.mask]

    # codex-images edits take JSON with data-URI images, not multipart —
    # the route answers multipart with 400 "Unsupported content type".
    codex_payload: dict | None = None
    if codex_images:
        codex_payload = {
            "model": a.model,
            "prompt": a.prompt,
            "n": 1,
            "images": [{"image_url": _data_uri(p)} for p in refs],
        }
        if a.quality:
            codex_payload["quality"] = a.quality
        if a.background:
            codex_payload["background"] = a.background

    paths = _output_paths(a.out, a.n)

    def _call() -> dict:
        if codex_images:
            return _post_json("/images/edits", codex_payload)
        return _post_multipart("/images/edits", fields, files)

    if a.n == 1:
        data = _call()
        items = data.get("data") or []
        if not items:
            _fail("response_invalid", f"empty response from the image API: {json.dumps(data)[:300]}", "unknown")
        _deliver(_write_item(items[0], paths[0], out_fmt))
        return
    _run_parallel(n=a.n, concurrency=a.concurrency, fn=_call, paths=paths,
                  requested_format=out_fmt)


def cmd_edit(a: argparse.Namespace) -> None:
    _edit_or_compose(a, mode="edit")


def cmd_compose(a: argparse.Namespace) -> None:
    _edit_or_compose(a, mode="compose")


# ---------------------------------------------------------------------------- cli

class _JsonAwareParser(argparse.ArgumentParser):
    """argparse exits 2 with prose on a bad flag, before our code ever runs.

    In JSON mode that would be a stray non-JSON line on stdout — the one thing
    the contract forbids — so errors become PixeltamerError and go out through
    the same envelope as everything else. Exit code 2 is preserved: usage errors
    have always meant 2 here and normalising that would break callers.
    """

    def error(self, message):
        if JSON_MODE:
            raise PixeltamerError("invalid_argument", message, "no", exit_code=2)
        super().error(message)


def main() -> None:
    ap = _JsonAwareParser(
        prog="pixeltamer_api.py",
        description="Call GPT Image models over an OpenAI-compatible Images API.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "Tips:\n"
            "  * `-n N` fires N parallel single-image calls (default concurrency 4).\n"
            "  * `compose` blends up to 16 reference images via /images/edits.\n"
            "  * Use `edit` for inpainting or single-source modification.\n"
            "  * Sizes: 1024x1024, 1536x1024, 1024x1536, 2048x2048, 3840x2160 etc.\n"
            "  * Most params are optional; only --prompt is required.\n"
        ),
    )
    sub = ap.add_subparsers(dest="cmd", required=True)

    common_quality: dict[str, Any] = dict(
        choices=["low", "medium", "high", "xhigh", "max", "auto", "standard", "hd"],
        default=DEFAULT_QUALITY,
        help=f"rendering quality (default {DEFAULT_QUALITY})",
    )

    # generate
    g = sub.add_parser("generate", aliases=["gen"], help="text -> image")
    g.add_argument("-p", "--prompt", required=True, help="text prompt")
    g.add_argument("--size", default="1024x1024",
                   metavar="WxH|2K|4K|auto",
                   help="WxH or 'auto'; max side ≤3840, ratio ≤3:1")
    g.add_argument("-n", type=int, default=1,
                   help="number of images (parallel calls; default 1)")
    g.add_argument("--concurrency", type=int, default=DEFAULT_CONCURRENCY)
    g.add_argument("-o", "--out",
                   help="output file path or directory; auto-suffixed when n>1")
    g.add_argument("--model", default=DEFAULT_MODEL,
                   help=f"image model (default {DEFAULT_MODEL}; env OPENAI_IMAGE_MODEL)")
    g.add_argument("--quality", **common_quality)
    g.add_argument("--style", choices=["vivid", "natural"])
    g.add_argument("--background", choices=["transparent", "opaque", "auto"],
                   help="transparent needs --output-format png|webp (auto-pinned to png)")
    g.add_argument("--output-format", choices=["png", "jpeg", "webp", "gif", "svg"],
                   help="file format of the returned image (gif = animated, "
                        "2.6 models; pair with --frames/--frame-ms; svg = 2.6 "
                        "vector export)")
    g.add_argument("--frames", type=int, metavar="2-16",
                   help="GIF frame count (with --output-format gif; API default 9)")
    g.add_argument("--frame-ms", type=int, metavar="20-2000",
                   help="GIF frame duration in ms (with --output-format gif; "
                        "default 200, rounded to 10ms)")
    g.add_argument("--complexity", choices=["low", "medium", "high"],
                   help="2.6 planning depth (default high server-side; lower = "
                        "faster, good for quick edits)")
    g.add_argument("--output-compression", type=int, metavar="0-100",
                   help="compression level for jpeg/webp output only")
    g.add_argument("--format", choices=["url", "b64_json"],
                   help="legacy response_format; ignored by gpt-image models")
    g.add_argument("--json", action="store_true",
                   help="emit one JSON object on stdout instead of paths")
    g.add_argument("--moderation", choices=["auto", "low"])
    g.add_argument("--user")
    g.set_defaults(fn=cmd_generate)

    # edit (single source + optional mask)
    e = sub.add_parser("edit", help="modify or inpaint a single source image")
    e.add_argument("-i", "--image", action="append", required=True,
                   help="path to source image (single)")
    e.add_argument("-p", "--prompt", required=True,
                   help="describe ONLY the change you want")
    e.add_argument("--mask", help="optional PNG mask; white = regenerate")
    e.add_argument("--size", default="1024x1024",
                   metavar="WxH|2K|4K|auto",
                   help="WxH (edges divisible by 16), 2K, 4K, or auto")
    e.add_argument("-n", type=int, default=1)
    e.add_argument("--concurrency", type=int, default=DEFAULT_CONCURRENCY)
    e.add_argument("-o", "--out")
    e.add_argument("--model", default=DEFAULT_MODEL,
                   help=f"image model (default {DEFAULT_MODEL}; env OPENAI_IMAGE_MODEL)")
    e.add_argument("--quality", **common_quality)
    e.add_argument("--input-fidelity", choices=["high", "low"],
                   help="optional edit fidelity control; high preserves faces, "
                        "logos and fine texture when supported by the model/host")
    e.add_argument("--background", choices=["transparent", "opaque", "auto"],
                   help="transparent needs --output-format png|webp (auto-pinned to png)")
    e.add_argument("--output-format", choices=["png", "jpeg", "webp", "gif", "svg"])
    e.add_argument("--frames", type=int, metavar="2-16",
                   help="GIF frame count (with --output-format gif; API default 9)")
    e.add_argument("--frame-ms", type=int, metavar="20-2000",
                   help="GIF frame duration in ms (with --output-format gif)")
    e.add_argument("--complexity", choices=["low", "medium", "high"],
                   help="2.6 planning depth; low suits focused edits")
    e.add_argument("--output-compression", type=int, metavar="0-100")
    e.add_argument("--format", choices=["url", "b64_json"],
                   help="legacy response_format; ignored by gpt-image models")
    e.add_argument("--json", action="store_true",
                   help="emit one JSON object on stdout instead of paths")
    e.add_argument("--moderation", choices=["auto", "low"])
    e.add_argument("--user")
    e.set_defaults(fn=cmd_edit)

    # compose (2-16 refs blended)
    c = sub.add_parser("compose", help="blend 2-16 reference images into one output")
    c.add_argument("-i", "--image", action="append", required=True,
                   help=f"reference image path (repeat 2-{MAX_REFERENCE_IMAGES} times)")
    c.add_argument("-p", "--prompt", required=True,
                   help="how the references should be combined")
    c.add_argument("--size", default="1024x1024",
                   metavar="WxH|2K|4K|auto",
                   help="WxH (edges divisible by 16), 2K, 4K, or auto")
    c.add_argument("-n", type=int, default=1)
    c.add_argument("--concurrency", type=int, default=DEFAULT_CONCURRENCY)
    c.add_argument("-o", "--out")
    c.add_argument("--model", default=DEFAULT_MODEL,
                   help=f"image model (default {DEFAULT_MODEL}; env OPENAI_IMAGE_MODEL)")
    c.add_argument("--quality", **common_quality)
    c.add_argument("--input-fidelity", choices=["high", "low"],
                   help="optional edit fidelity control; high preserves faces, "
                        "logos and fine texture when supported by the model/host")
    c.add_argument("--background", choices=["transparent", "opaque", "auto"],
                   help="transparent needs --output-format png|webp (auto-pinned to png)")
    c.add_argument("--output-format", choices=["png", "jpeg", "webp", "gif", "svg"])
    c.add_argument("--frames", type=int, metavar="2-16",
                   help="GIF frame count (with --output-format gif; API default 9)")
    c.add_argument("--frame-ms", type=int, metavar="20-2000",
                   help="GIF frame duration in ms (with --output-format gif)")
    c.add_argument("--complexity", choices=["low", "medium", "high"],
                   help="2.6 planning depth; low suits focused edits")
    c.add_argument("--output-compression", type=int, metavar="0-100")
    c.add_argument("--format", choices=["url", "b64_json"],
                   help="legacy response_format; ignored by gpt-image models")
    c.add_argument("--json", action="store_true",
                   help="emit one JSON object on stdout instead of paths")
    c.add_argument("--moderation", choices=["auto", "low"])
    c.add_argument("--user")
    c.set_defaults(fn=cmd_compose)

    started = time.time()
    command = "unknown"
    backend = "codex-images" if _CODEX_IMAGES else "api"

    try:
        args = ap.parse_args()
        command = getattr(args, "cmd", "unknown") or "unknown"
        args.fn(args)
    except PixeltamerError as e:
        if not JSON_MODE:
            print(f"ERROR: {e.message}", file=sys.stderr)
            sys.exit(e.details.get("exit_code", 1))
        _emit_error(command, backend, started, e.code, e.message,
                    e.retryable, {k: v for k, v in e.details.items()
                                  if k != "exit_code"})
        sys.exit(e.details.get("exit_code", 1))
    except SystemExit as e:
        # Older call sites still use sys.exit("ERROR: ..."). Success and plain
        # integer exits pass through; a message means a failure that predates
        # typed codes, so it goes out as internal_error rather than as prose.
        code = e.code
        if code in (0, None) or isinstance(code, int):
            raise
        if JSON_MODE:
            _emit_error(command, backend, started, "internal_error",
                        str(code).removeprefix("ERROR: "), "unknown", {})
            sys.exit(1)
        raise
    except KeyboardInterrupt:
        if JSON_MODE:
            _emit_error(command, backend, started, "interrupted",
                        "interrupted by the user", "no", {})
        sys.exit(130)
    except Exception as e:
        if not JSON_MODE:
            raise
        _emit_error(command, backend, started, "internal_error",
                    f"{type(e).__name__}: {e}", "unknown", {})
        sys.exit(1)

    # The postcondition applies whether or not the caller asked for JSON: a
    # transparent request that produced an opaque file failed, and the exit
    # code should say so either way. (Running it only under --json once meant
    # plain invocations shipped opaque cutouts as green successes.)
    described = [_describe_output(pth) for pth in _outputs]
    try:
        _check_transparency_postcondition(described)
    except PixeltamerError as e:
        if not JSON_MODE:
            print(f"ERROR: {e.message}", file=sys.stderr)
            sys.exit(1)
        _emit_error(command, backend, started, e.code, e.message,
                    e.retryable, {k: v for k, v in e.details.items()
                                  if k != "exit_code"})
        sys.exit(1)

    if JSON_MODE:
        _emit_success(command, backend, started)


if __name__ == "__main__":
    main()
