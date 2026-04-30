import { resolve, extname } from 'node:path';

const MIN_FILE_SIZE = 10 * 1024;
const MAX_FILE_SIZE = 10 * 1024 * 1024;

const PNG_EXTS = new Set(['.png']);
const JPG_EXTS = new Set(['.jpg', '.jpeg']);

export function verifyEntry(entry, projectRoot, deps) {
  const { fs, getDimensions } = deps;
  const fullPath = resolve(projectRoot, entry.path);

  if (!fs.existsSync(fullPath)) {
    return { ok: false, reason: 'file not found' };
  }

  const { size } = fs.statSync(fullPath);
  if (size < MIN_FILE_SIZE) {
    return { ok: false, reason: `file too small (${size} bytes, minimum ${MIN_FILE_SIZE})` };
  }
  if (size > MAX_FILE_SIZE) {
    return { ok: false, reason: `file too large (${size} bytes, maximum ${MAX_FILE_SIZE})` };
  }

  const formatLower = entry.format.toLowerCase();
  const ext = extname(entry.path).toLowerCase();
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

  return { ok: true };
}

function parseSize(value) {
  const m = value.match(/^\s*(\d+)\s*[×x]\s*(\d+)\s*$/);
  if (!m) return null;
  return { width: Number(m[1]), height: Number(m[2]) };
}
