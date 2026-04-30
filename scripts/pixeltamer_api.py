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
from typing import Any

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


def _validate_size(size: str) -> None:
    """Reject sizes the model won't accept, before paying for a roundtrip."""
    if size in ("auto", ""):
        return
    try:
        w, h = (int(x) for x in size.lower().split("x", 1))
    except Exception:
        sys.exit(f"ERROR: --size must be WxH or 'auto' (got {size!r})")
    if w <= 0 or h <= 0:
        sys.exit(f"ERROR: --size dimensions must be positive (got {size!r})")
    if max(w, h) >= MAX_SIDE:
        sys.exit(f"ERROR: longest side must be < {MAX_SIDE}px (got {max(w, h)}px)")
    ratio = max(w, h) / min(w, h)
    if ratio > MAX_RATIO:
        sys.exit(f"ERROR: aspect ratio must be ≤ {MAX_RATIO:.0f}:1 (got {ratio:.2f}:1)")


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
                sys.exit(f"ERROR: file not found: {fp}")
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
    """Decode b64 or download URL, write to dest, print resolved path on stdout."""
    if item.get("b64_json"):
        dest.write_bytes(base64.b64decode(item["b64_json"]))
    elif item.get("url"):
        dest.write_bytes(_download(item["url"]))
    else:
        sys.exit(f"ERROR: response item missing b64_json/url: {item}")
    with _print_lock:
        print(dest.resolve(), flush=True)
    return dest.resolve()


def _run_parallel(n: int, concurrency: int, fn, paths: list[Path]) -> list[Path]:
    """Fire n parallel calls; write each response to paths[i]."""
    results: list[Path | None] = [None] * n
    workers = max(1, min(concurrency, n))
    with ThreadPoolExecutor(max_workers=workers) as ex:
        futures = {ex.submit(fn): i for i in range(n)}
        for fut in as_completed(futures):
            i = futures[fut]
            data = fut.result()
            items = data.get("data") or []
            if not items:
                sys.exit(f"ERROR: empty response: {json.dumps(data)[:500]}")
            results[i] = _write_item(items[0], paths[i])
    return [r for r in results if r is not None]


# ----------------------------------------------------------------------- commands

def cmd_generate(a: argparse.Namespace) -> None:
    _validate_size(a.size)
    payload: dict = {
        "model": a.model,
        "prompt": a.prompt,
        "n": 1,
        "size": a.size,
    }
    if a.quality:
        payload["quality"] = a.quality
    if a.style:
        payload["style"] = a.style
    if a.background:
        payload["background"] = a.background
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
            sys.exit(f"ERROR: empty response: {json.dumps(data)[:500]}")
        _write_item(items[0], paths[0])
        return
    _run_parallel(
        n=a.n,
        concurrency=a.concurrency,
        fn=lambda: _post_json("/images/generations", payload),
        paths=paths,
    )


def _edit_or_compose(a: argparse.Namespace, mode: str) -> None:
    """Shared body: 1 image -> edit/inpaint, 2-16 images -> compose."""
    _validate_size(a.size)
    refs = list(a.image)
    if not refs:
        sys.exit("ERROR: at least one --image required")
    if len(refs) > MAX_REFERENCE_IMAGES:
        sys.exit(f"ERROR: at most {MAX_REFERENCE_IMAGES} reference images allowed")
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
    if a.background:
        fields["background"] = a.background
    if a.format:
        fields["response_format"] = a.format
    if a.moderation:
        fields["moderation"] = a.moderation
    if a.user:
        fields["user"] = a.user

    files: dict[str, list[str]] = {"image": refs}
    if getattr(a, "mask", None):
        if mode != "edit":
            sys.exit("ERROR: --mask is only valid with `edit` (single source).")
        files["mask"] = [a.mask]

    paths = _output_paths(a.out, a.n)

    def _call() -> dict:
        return _post_multipart("/images/edits", fields, files)

    if a.n == 1:
        data = _call()
        items = data.get("data") or []
        if not items:
            sys.exit(f"ERROR: empty response: {json.dumps(data)[:500]}")
        _write_item(items[0], paths[0])
        return
    _run_parallel(n=a.n, concurrency=a.concurrency, fn=_call, paths=paths)


def cmd_edit(a: argparse.Namespace) -> None:
    _edit_or_compose(a, mode="edit")


def cmd_compose(a: argparse.Namespace) -> None:
    _edit_or_compose(a, mode="compose")


# ---------------------------------------------------------------------------- cli

def main() -> None:
    ap = argparse.ArgumentParser(
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
                   help="WxH or 'auto'; max side <3840, ratio ≤3:1")
    g.add_argument("-n", type=int, default=1,
                   help="number of images (parallel calls; default 1)")
    g.add_argument("--concurrency", type=int, default=DEFAULT_CONCURRENCY)
    g.add_argument("-o", "--out",
                   help="output file path or directory; auto-suffixed when n>1")
    g.add_argument("--model", default=DEFAULT_MODEL)
    g.add_argument("--quality", **common_quality)
    g.add_argument("--style", choices=["vivid", "natural"])
    g.add_argument("--background", choices=["transparent", "opaque", "auto"])
    g.add_argument("--format", choices=["url", "b64_json"])
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
    e.add_argument("--size", default="1024x1024")
    e.add_argument("-n", type=int, default=1)
    e.add_argument("--concurrency", type=int, default=DEFAULT_CONCURRENCY)
    e.add_argument("-o", "--out")
    e.add_argument("--model", default=DEFAULT_MODEL)
    e.add_argument("--quality", **common_quality)
    e.add_argument("--background", choices=["transparent", "opaque", "auto"])
    e.add_argument("--format", choices=["url", "b64_json"])
    e.add_argument("--moderation", choices=["auto", "low"])
    e.add_argument("--user")
    e.set_defaults(fn=cmd_edit)

    # compose (2-16 refs blended)
    c = sub.add_parser("compose", help="blend 2-16 reference images into one output")
    c.add_argument("-i", "--image", action="append", required=True,
                   help=f"reference image path (repeat 2-{MAX_REFERENCE_IMAGES} times)")
    c.add_argument("-p", "--prompt", required=True,
                   help="how the references should be combined")
    c.add_argument("--size", default="1024x1024")
    c.add_argument("-n", type=int, default=1)
    c.add_argument("--concurrency", type=int, default=DEFAULT_CONCURRENCY)
    c.add_argument("-o", "--out")
    c.add_argument("--model", default=DEFAULT_MODEL)
    c.add_argument("--quality", **common_quality)
    c.add_argument("--background", choices=["transparent", "opaque", "auto"])
    c.add_argument("--format", choices=["url", "b64_json"])
    c.add_argument("--moderation", choices=["auto", "low"])
    c.add_argument("--user")
    c.set_defaults(fn=cmd_compose)

    args = ap.parse_args()
    args.fn(args)


if __name__ == "__main__":
    main()
