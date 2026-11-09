import { resolve, extname } from 'node:path';
import { readFileSync, openSync, readSync, closeSync } from 'node:fs';
import { inspectGifFile as inspectGifFileDefault } from './gif-inspect.mjs';

const MIN_FILE_SIZE = 10 * 1024;
// SVG is text: a legitimate hand-sized icon sits far below the raster floor,
// so SVG entries get their own minimum (keep the shared max).
const MIN_SVG_FILE_SIZE = 64;
// Root tag sits near the head of the file; read only this much, not the whole
// path-sized payload.
const SVG_HEAD_BYTES = 4096;
const MAX_FILE_SIZE = 10 * 1024 * 1024;

const PNG_EXTS = new Set(['.png']);
const JPG_EXTS = new Set(['.jpg', '.jpeg']);
const GIF_EXTS = new Set(['.gif']);
const SVG_EXTS = new Set(['.svg']);

export function verifyEntry(entry, projectRoot, deps) {
  const { fs, getDimensions, getHasAlpha, getAlphaCoverage } = deps;
  const inspectGifFile = deps.inspectGifFile ?? inspectGifFileDefault;
  const readSvgHead = deps.readSvgHead ?? readSvgHeadDefault;
  const fullPath = resolve(projectRoot, entry.path);

  if (!fs.existsSync(fullPath)) {
    return { ok: false, reason: 'file not found' };
  }

  const { size } = fs.statSync(fullPath);
  const formatLower = entry.format.toLowerCase();
  const minSize = formatLower.includes('svg') ? MIN_SVG_FILE_SIZE : MIN_FILE_SIZE;
  if (size < minSize) {
    return { ok: false, reason: `file too small (${size} bytes, minimum ${minSize})` };
  }
  if (size > MAX_FILE_SIZE) {
    return { ok: false, reason: `file too large (${size} bytes, maximum ${MAX_FILE_SIZE})` };
  }

  const ext = extname(entry.path).toLowerCase();

  if (formatLower.includes('gif')) {
    return verifyGifEntry({ entry, fullPath, ext, size, formatLower, inspectGifFile });
  }

  if (formatLower.includes('svg')) {
    return verifySvgEntry({ entry, fullPath, ext, formatLower, readSvgHead });
  }

  let allowedExts;
  if (formatLower.includes('png')) {
    allowedExts = PNG_EXTS;
  } else if (formatLower.includes('jpg') || formatLower.includes('jpeg')) {
    allowedExts = JPG_EXTS;
  } else {
    return { ok: false, reason: `unrecognized format field: "${entry.format}"` };
  }
  if (!allowedExts.has(ext)) {
    return { ok: false, reason: `extension ${ext} does not match format "${entry.format}"` };
  }

  const expected = parseSize(entry.nativeSize);
  if (!expected) {
    return { ok: false, reason: `unparseable native size: "${entry.nativeSize}"` };
  }

  const actual = getDimensions(fullPath);
  if (!actual || typeof actual.width !== 'number' || typeof actual.height !== 'number') {
    return { ok: false, reason: 'unable to read image dimensions' };
  }

  if (actual.width !== expected.width || actual.height !== expected.height) {
    return {
      ok: false,
      reason: `dimensions ${actual.width}×${actual.height} expected ${expected.width}×${expected.height}`,
    };
  }

  // "PNG transparent" in the Format field is a promise the file has to keep.
  // The common failure is silent: the prompt described a backdrop, gpt-image-2
  // obliged, and you get flat RGB back with no error anywhere in the chain.
  //
  // Header-only check — see parseHasAlphaChannel. It catches "no alpha channel
  // at all", which is most of the misses. It CANNOT catch an alpha channel
  // that's fully opaque; that one is the visual self-review step's job.
  //
  // getHasAlpha stays optional so older callers passing only {fs, getDimensions}
  // keep working instead of throwing on an undefined call.
  if (formatLower.includes('transparent') && getHasAlpha) {
    const hasAlpha = getHasAlpha(fullPath);
    if (hasAlpha === null) {
      return { ok: false, reason: 'unable to read alpha channel' };
    }
    if (!hasAlpha) {
      return {
        ok: false,
        reason: 'format says transparent but the PNG has no alpha channel',
      };
    }

    // Having an alpha channel is not the same as using it. A PNG can be RGBA
    // with every pixel opaque — the model painted a backdrop — and that passes
    // every check above while being useless for the one job it had.
    if (getAlphaCoverage) {
      const coverage = getAlphaCoverage(fullPath);
      if (coverage && coverage.transparentPct < 1) {
        return {
          ok: false,
          reason: `alpha channel present but only ${coverage.transparentPct}% transparent — the prompt probably described a background`,
        };
      }
    }
  }

  return { ok: true };
}

/**
 * Verify a GIF batch entry: signature, bounded structure, per-frame timing,
 * and dimensions from the logical screen descriptor.
 *
 * GIF transparency is binary palette transparency — it can't be measured the
 * way PNG alpha is, and the client refuses to generate it — so a `transparent`
 * token on a GIF entry is a config error, not a checkable promise. Structural
 * parsing also can't prove the frames differ; for that, use the visual
 * self-review step or ImageMagick's frame RMSE.
 *
 * @param {object} params
 * @param {object} params.entry - parsed prompts.md entry
 * @param {string} params.fullPath - resolved file path
 * @param {string} params.ext - lower-cased path extension
 * @param {number} params.size - file size in bytes (bounds already checked)
 * @param {string} params.formatLower - lower-cased Format field
 * @param {Function} params.inspectGifFile - structural GIF reader
 * @returns {{ok: boolean, reason?: string, frames?: number}}
 */
function verifyGifEntry({ entry, fullPath, ext, size, formatLower, inspectGifFile }) {
  if (!GIF_EXTS.has(ext)) {
    return { ok: false, reason: `extension ${ext} does not match format "${entry.format}"` };
  }
  if (formatLower.includes('transparent')) {
    return {
      ok: false,
      reason: 'transparent is not offered with GIF output (binary palette transparency, unverifiable); use PNG transparent instead',
    };
  }

  const expected = parseSize(entry.nativeSize);
  if (!expected) {
    return { ok: false, reason: `unparseable native size: "${entry.nativeSize}"` };
  }

  const gif = inspectGifFile(fullPath);
  if (!gif) {
    return { ok: false, reason: 'unable to read GIF structure' };
  }
  if (!gif.ok) {
    return { ok: false, reason: `invalid GIF (${gif.reason})` };
  }

  if (gif.width !== expected.width || gif.height !== expected.height) {
    return {
      ok: false,
      reason: `dimensions ${gif.width}×${gif.height} expected ${expected.width}×${expected.height}`,
    };
  }

  // "GIF animated" is the promise that the file actually moves. A single-frame
  // GIF passes every structural check while failing the one job it had.
  if (formatLower.includes('animated') && gif.frames < 2) {
    return { ok: false, reason: `format says animated but the GIF has ${gif.frames} frame(s)` };
  }

  return { ok: true, frames: gif.frames };
}

/**
 * Verify an SVG batch entry: extension, that it IS svg, and declared
 * dimensions (width/height attributes, falling back to the viewBox) against
 * Native size.
 *
 * The checks are deliberately shallow — XML well-formedness, semantics, and
 * visual output belong to the visual self-review step. A `transparent` token
 * is rejected: SVG transparency is real but unmeasurable by tooling, so it
 * can't be treated as a verifiable promise; use PNG transparent when the
 * cutout has to be provable.
 *
 * @param {object} params
 * @param {object} params.entry - parsed prompts.md entry
 * @param {string} params.fullPath - resolved file path
 * @param {string} params.ext - lower-cased path extension
 * @param {string} params.formatLower - lower-cased Format field
 * @returns {{ok: boolean, reason?: string, width?: number, height?: number}}
 */
/**
 * Bounded head read for SVG files: opens the file and reads at most
 * SVG_HEAD_BYTES bytes, so a path-sized payload is never pulled into memory
 * just to find the root tag. Injectable so tests can stub it.
 *
 * @param {string} fullPath
 * @returns {string} UTF-8 decoded head
 */
function readSvgHeadDefault(fullPath) {
  const fd = openSync(fullPath, 'r');
  try {
    const buf = Buffer.alloc(SVG_HEAD_BYTES);
    const bytesRead = readSync(fd, buf, 0, SVG_HEAD_BYTES, 0);
    return buf.toString('utf8', 0, bytesRead);
  } finally {
    closeSync(fd);
  }
}

/**
 * Walk the prolog of an SVG document (whitespace, comments, processing
 * instructions, declarations) and return its first real element. Detecting
 * the root this way stops impostors — an HTML file containing an SVG string,
 * or a commented-out fake — from passing as SVG.
 *
 * @param {string} head - beginning of the file
 * @returns {{root: string|null, tag?: string}} lower-cased root element name
 *   and its full start tag when found
 */
function findSvgRoot(head) {
  let i = 0;
  while (i < head.length) {
    while (i < head.length && /\s/.test(head[i])) i += 1;
    if (i >= head.length) return { root: null }; // truncated in the prolog
    if (head[i] !== '<') return { root: null }; // garbage before any element
    if (head.startsWith('<!--', i)) {
      const end = head.indexOf('-->', i + 4);
      if (end === -1) return { root: null }; // unterminated comment
      i = end + 3;
      continue;
    }
    if (head.startsWith('<?', i)) {
      const end = head.indexOf('?>', i + 2);
      if (end === -1) return { root: null }; // unterminated processing instruction
      i = end + 2;
      continue;
    }
    if (head.startsWith('<!', i)) {
      const end = head.indexOf('>', i + 2);
      if (end === -1) return { root: null }; // unterminated declaration
      i = end + 1;
      continue;
    }
    const m = head.slice(i).match(/^<([A-Za-z][\w:.-]*)(\s[^>]*)?>/);
    if (!m) return { root: null };
    return { root: m[1].toLowerCase(), tag: m[0] };
  }
  return { root: null };
}

/**
 * Parse a dimension attribute value like "512" or "512px". Rejects anything
 * that is not a finite positive number — fractional values stay fractional so
 * the exact compare below can fail them.
 *
 * @param {string} raw
 * @returns {number|null}
 */
function parseSvgDim(raw) {
  const stripped = raw.replace(/px$/i, '');
  const n = Number(stripped);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

/**
 * Verify an SVG batch entry: extension, that the file IS an SVG document
 * (root element after a well-formed prolog), and declared dimensions
 * (width/height attributes, falling back to the viewBox) against Native size.
 *
 * The checks are deliberately shallow — XML well-formedness beyond the
 * prolog, semantics, and visual output belong to the visual self-review step.
 * A `transparent` token is rejected: SVG transparency is real but
 * unmeasurable by tooling, so it can't be treated as a verifiable promise;
 * use PNG transparent when the cutout has to be provable.
 *
 * viewBox numbers are user units, not guaranteed viewport pixels — using
 * them as Native size is a project convention, applied only when explicit
 * width/height attributes are absent.
 *
 * @param {object} params
 * @param {object} params.entry - parsed prompts.md entry
 * @param {string} params.fullPath - resolved file path
 * @param {string} params.ext - lower-cased path extension
 * @param {string} params.formatLower - lower-cased Format field
 * @param {(path: string) => string} params.readSvgHead - bounded head reader
 * @returns {{ok: boolean, reason?: string, width?: number, height?: number}}
 */
function verifySvgEntry({ entry, fullPath, ext, formatLower, readSvgHead }) {
  if (!SVG_EXTS.has(ext)) {
    return { ok: false, reason: `extension ${ext} does not match format "${entry.format}"` };
  }
  if (formatLower.includes('transparent')) {
    return {
      ok: false,
      reason: 'transparent is not verifiable on SVG entries (no raster alpha to measure); use PNG transparent when the cutout must be provable',
    };
  }

  const expected = parseSize(entry.nativeSize);
  if (!expected) {
    return { ok: false, reason: `unparseable native size: "${entry.nativeSize}"` };
  }

  let head;
  try {
    head = readSvgHead(fullPath);
  } catch {
    return { ok: false, reason: 'unable to read SVG file' };
  }

  const { root, tag } = findSvgRoot(head);
  if (root === null) {
    return { ok: false, reason: 'no SVG root element found — not an SVG document (or truncated)' };
  }
  if (root !== 'svg') {
    return { ok: false, reason: `root element is <${root}>, not <svg>` };
  }

  const wAttr = tag.match(/(?:^|\s)width\s*=\s*["']([^"']+)["']/i);
  const hAttr = tag.match(/(?:^|\s)height\s*=\s*["']([^"']+)["']/i);
  const viewBox = tag.match(/(?:^|\s)viewBox\s*=\s*["']([^"']+)["']/i);

  let width;
  let height;
  if (wAttr && hAttr) {
    width = parseSvgDim(wAttr[1]);
    height = parseSvgDim(hAttr[1]);
  } else if (viewBox) {
    // min-x min-y width height, whitespace- or comma-separated, may be
    // negative/exponential. Only width/height are meaningful here.
    const nums = viewBox[1].trim().split(/[\s,]+/).map(Number);
    if (nums.length === 4 && nums.every((n) => Number.isFinite(n))) {
      width = nums[2] > 0 ? nums[2] : null;
      height = nums[3] > 0 ? nums[3] : null;
    }
  }

  if (width == null || height == null) {
    return {
      ok: false,
      reason: 'SVG declares no verifiable width/height or viewBox — dimension check impossible',
    };
  }

  // Exact compare on purpose: a 511.6×512 file is not a 512×512 asset.
  if (width !== expected.width || height !== expected.height) {
    return {
      ok: false,
      reason: `dimensions ${width}×${height} expected ${expected.width}×${expected.height}`,
    };
  }

  return { ok: true, width, height };
}

function parseSize(value) {
  const m = value.match(/^\s*(\d+)\s*[×x]\s*(\d+)\s*$/);
  if (!m) return null;
  return { width: Number(m[1]), height: Number(m[2]) };
}
