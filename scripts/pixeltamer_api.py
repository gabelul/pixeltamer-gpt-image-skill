#!/usr/bin/env python3
"""pixeltamer_api.py — call gpt-image-2 over the OpenAI-compatible Images API.

Subcommands:
  generate   POST /images/generations  (text -> image)
  edit       POST /images/edits        (1 source image + optional mask)
  compose    POST /images/edits        (2-16 reference images, blended into one output)

Auth:
  OPENAI_IMAGE_API_KEY   — preferred, image-specific key
  OPENAI_API_KEY         — fallback
  OPENAI_IMAGE_BASE_URL  — override base URL (default https://api.openai.com/v1)
  OPENAI_BASE_URL        — fallback for base URL
  OPENAI_IMAGE_MODEL     — override default model (default gpt-image-2)

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
import urllib.request
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
    """Hand a finished file to the caller, however this run reports results."""
    if JSON_MODE:
        _outputs.append(path)
    else:
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
        "process.stdout.write(JSON.stringify({d, c}));"
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
        result["alpha"] = {
            "present": None, "measured": False,
            "transparent_pct": None, "partial_pct": None,
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
        if (d.get("alpha") or {}).get("measured")
        and (d["alpha"].get("transparent_pct") or 0) < 1
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
    """Tiny .env loader. Doesn't override values already in os.environ."""
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
            if k and k not in os.environ:
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
DEFAULT_MODEL = os.environ.get("OPENAI_IMAGE_MODEL", "gpt-image-2")
DEFAULT_QUALITY = "high"
DEFAULT_CONCURRENCY = 4
MAX_REFERENCE_IMAGES = 16
MAX_SIDE = 3840
MAX_RATIO = 3.0
# 3840x2160 exactly. Also what makes 2880x2880 the practical square ceiling.
MAX_TOTAL_PIXELS = 8_294_400
# gpt-image-2 takes arbitrary WxH, but both edges must be divisible by 16.
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


def _validate_size(size: str) -> None:
    """Reject sizes the model won't accept, before paying for a roundtrip.

    Four constraints, all from OpenAI's spec. Every one of these is a 400 you'd
    otherwise pay a network roundtrip to discover:

      - both edges divisible by 16
      - longest edge at most 3840
      - total pixels at most 8,294,400 (which is 3840x2160, and is also why
        2880x2880 is the practical square ceiling)
      - aspect ratio within 3:1 either way
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
    if w * h > MAX_TOTAL_PIXELS:
        _fail(
            "invalid_size",
            f"total pixels must be ≤ {MAX_TOTAL_PIXELS:,} "
            f"(got {w * h:,} for {w}x{h}). 3840x2160 and 2880x2880 both sit "
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

    if fmt not in ALPHA_CAPABLE_FORMATS:
        _fail(
            "invalid_argument",
            f"--background transparent needs an alpha-capable format; {fmt} has "
            f"no alpha channel. Use --output-format png (or webp).",
            field="output-format",
        )

    return fmt


_print_lock = threading.Lock()


def _send(req: urllib.request.Request, retries: int = 4) -> dict:
    """POST with exponential backoff on 429/5xx; surface 4xx (except 429) immediately."""
    last_err: str | None = None
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(req, timeout=600) as resp:
                return json.loads(resp.read())
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", "replace")
            retriable = e.code == 429 or 500 <= e.code < 600
            if retriable and attempt < retries - 1:
                wait = 2 ** attempt + (0.1 * attempt)
                time.sleep(wait)
                last_err = f"HTTP {e.code}: {body[:200]}"
                continue
            # 403 is a common "your org isn't verified for gpt-image-2" wall.
            hint = ""
            if e.code == 403:
                hint = (
                    "\n  hint: verify your org for gpt-image-2 at "
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


def _post_json(path: str, payload: dict) -> dict:
    url = DEFAULT_BASE.rstrip("/") + path
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {_key()}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
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
        headers={
            "Authorization": f"Bearer {_key()}",
            "Content-Type": f"multipart/form-data; boundary={boundary}",
            "Accept": "application/json",
        },
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


def _write_item(item: dict, dest: Path) -> Path:
    """Decode b64 or download URL, write to dest, return the resolved path.

    Deliberately does NOT print. stdout is a promise about the whole run, and
    only the caller knows whether the run finished — printing from inside a
    worker thread is what let a failed batch emit half its paths and then exit
    non-zero, which a caller reading stdout cannot tell apart from success.
    """
    if item.get("b64_json"):
        dest.write_bytes(base64.b64decode(item["b64_json"]))
    elif item.get("url"):
        dest.write_bytes(_download(item["url"]))
    else:
        raise RuntimeError(f"response item missing b64_json/url: {item}")
    return dest.resolve()


def _run_parallel(n: int, concurrency: int, fn, paths: list[Path]) -> list[Path]:
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
                results[i] = _write_item(items[0], paths[i])
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
    a.size = _resolve_size(a.size)
    _validate_size(a.size)
    payload: dict = {
        "model": a.model,
        "prompt": a.prompt,
        "n": 1,
        "size": a.size,
    }
    if a.quality:
        payload["quality"] = a.quality
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
        global _requested_transparent
        _requested_transparent = _requested_transparent or a.background == "transparent"
    out_fmt = _resolve_output_format(a)
    _check_extension_matches(out_fmt, a.out)
    if out_fmt:
        payload["output_format"] = out_fmt
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
        _deliver(_write_item(items[0], paths[0]))
        return
    _run_parallel(
        n=a.n,
        concurrency=a.concurrency,
        fn=lambda: _post_json("/images/generations", payload),
        paths=paths,
    )


def _edit_or_compose(a: argparse.Namespace, mode: str) -> None:
    """Shared body: 1 image -> edit/inpaint, 2-16 images -> compose."""
    a.size = _resolve_size(a.size)
    _validate_size(a.size)
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
    if getattr(a, "input_fidelity", None):
        fields["input_fidelity"] = a.input_fidelity
    if a.background:
        fields["background"] = a.background
        global _requested_transparent
        _requested_transparent = _requested_transparent or a.background == "transparent"
    out_fmt = _resolve_output_format(a)
    _check_extension_matches(out_fmt, a.out)
    if out_fmt:
        fields["output_format"] = out_fmt
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

    paths = _output_paths(a.out, a.n)

    def _call() -> dict:
        return _post_multipart("/images/edits", fields, files)

    if a.n == 1:
        data = _call()
        items = data.get("data") or []
        if not items:
            _fail("response_invalid", f"empty response from the image API: {json.dumps(data)[:300]}", "unknown")
        _deliver(_write_item(items[0], paths[0]))
        return
    _run_parallel(n=a.n, concurrency=a.concurrency, fn=_call, paths=paths)


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
        description="Call gpt-image-2 over the OpenAI-compatible Images API.",
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
        choices=["low", "medium", "high", "auto", "standard", "hd"],
        default=DEFAULT_QUALITY,
        help=f"rendering quality (default {DEFAULT_QUALITY})",
    )

    # generate
    g = sub.add_parser("generate", aliases=["gen"], help="text -> image")
    g.add_argument("-p", "--prompt", required=True, help="text prompt")
    g.add_argument("--size", default="1024x1024",
                   metavar="WxH|2K|4K|auto",
                   help="WxH or 'auto'; max side <3840, ratio ≤3:1")
    g.add_argument("-n", type=int, default=1,
                   help="number of images (parallel calls; default 1)")
    g.add_argument("--concurrency", type=int, default=DEFAULT_CONCURRENCY)
    g.add_argument("-o", "--out",
                   help="output file path or directory; auto-suffixed when n>1")
    g.add_argument("--model", default=DEFAULT_MODEL)
    g.add_argument("--quality", **common_quality)
    g.add_argument("--style", choices=["vivid", "natural"])
    g.add_argument("--background", choices=["transparent", "opaque", "auto"],
                   help="transparent needs --output-format png|webp (auto-pinned to png)")
    g.add_argument("--output-format", choices=["png", "jpeg", "webp"],
                   help="file format of the returned image (gpt-image models only)")
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
    e.add_argument("--model", default=DEFAULT_MODEL)
    e.add_argument("--quality", **common_quality)
    e.add_argument("--input-fidelity", choices=["high", "low"],
                   help="high preserves faces, logos and fine texture from the "
                        "input images (default low). Only the FIRST image gets "
                        "the extra texture richness — order your refs accordingly")
    e.add_argument("--background", choices=["transparent", "opaque", "auto"],
                   help="transparent needs --output-format png|webp (auto-pinned to png)")
    e.add_argument("--output-format", choices=["png", "jpeg", "webp"])
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
    c.add_argument("--model", default=DEFAULT_MODEL)
    c.add_argument("--quality", **common_quality)
    c.add_argument("--input-fidelity", choices=["high", "low"],
                   help="high preserves faces, logos and fine texture from the "
                        "input images (default low). Only the FIRST image gets "
                        "the extra texture richness — order your refs accordingly")
    c.add_argument("--background", choices=["transparent", "opaque", "auto"],
                   help="transparent needs --output-format png|webp (auto-pinned to png)")
    c.add_argument("--output-format", choices=["png", "jpeg", "webp"])
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
    backend = "api"

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
    # transparent request that produced an opaque file failed, and the exit code
    # should say so either way.
    described = [_describe_output(pth) for pth in _outputs] if JSON_MODE else []
    try:
        if JSON_MODE:
            _check_transparency_postcondition(described)
    except PixeltamerError as e:
        _emit_error(command, backend, started, e.code, e.message,
                    e.retryable, {k: v for k, v in e.details.items()
                                  if k != "exit_code"})
        sys.exit(1)

    if JSON_MODE:
        _emit_success(command, backend, started)


if __name__ == "__main__":
    main()
