import { mkdtempSync, rmSync, writeFileSync as wfs } from "node:fs";
import { tmpdir } from "node:os";
import { join as jpath } from "node:path";
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifyEntry } from '../scripts/lib/verify-entry.mjs';

const PNG_ENTRY = {
  index: 1,
  path: 'assets/icons/search.png',
  format: 'PNG (transparent background)',
  nativeSize: '1024×1024',
  reference: null,
  status: 'pending',
  prompt: '...',
};

const JPG_ENTRY = {
  ...PNG_ENTRY,
  index: 2,
  path: 'assets/hero.jpg',
  format: 'JPG',
  nativeSize: '1792×1024',
};

function makeFs({ exists = true, size = 100_000 } = {}) {
  return {
    existsSync: () => exists,
    statSync: () => ({ size }),
  };
}

function makeDims(width, height) {
  return () => ({ width, height });
}

test('passes when all checks succeed (PNG)', () => {
  const result = verifyEntry(PNG_ENTRY, '/proj', {
    fs: makeFs(),
    getDimensions: makeDims(1024, 1024),
  });
  assert.deepEqual(result, { ok: true });
});

test('passes when all checks succeed (JPG)', () => {
  const result = verifyEntry(JPG_ENTRY, '/proj', {
    fs: makeFs(),
    getDimensions: makeDims(1792, 1024),
  });
  assert.deepEqual(result, { ok: true });
});

test('fails when file does not exist', () => {
  const result = verifyEntry(PNG_ENTRY, '/proj', {
    fs: makeFs({ exists: false }),
    getDimensions: makeDims(1024, 1024),
  });
  assert.equal(result.ok, false);
  assert.match(result.reason, /file not found/);
});

test('fails when file too small', () => {
  const result = verifyEntry(PNG_ENTRY, '/proj', {
    fs: makeFs({ size: 1000 }),
    getDimensions: makeDims(1024, 1024),
  });
  assert.equal(result.ok, false);
  assert.match(result.reason, /too small/);
});

test('fails when file too large', () => {
  const result = verifyEntry(PNG_ENTRY, '/proj', {
    fs: makeFs({ size: 20_000_000 }),
    getDimensions: makeDims(1024, 1024),
  });
  assert.equal(result.ok, false);
  assert.match(result.reason, /too large/);
});

test('fails when extension does not match PNG format', () => {
  const entry = { ...PNG_ENTRY, path: 'assets/icons/search.webp' };
  const result = verifyEntry(entry, '/proj', {
    fs: makeFs(),
    getDimensions: makeDims(1024, 1024),
  });
  assert.equal(result.ok, false);
  assert.match(result.reason, /extension/i);
  assert.match(result.reason, /\.webp/);
});

test('fails when extension does not match JPG format', () => {
  const entry = { ...JPG_ENTRY, path: 'assets/hero.png' };
  const result = verifyEntry(entry, '/proj', {
    fs: makeFs(),
    getDimensions: makeDims(1792, 1024),
  });
  assert.equal(result.ok, false);
  assert.match(result.reason, /extension/i);
});

test('accepts .jpeg extension for JPG format', () => {
  const entry = { ...JPG_ENTRY, path: 'assets/hero.jpeg' };
  const result = verifyEntry(entry, '/proj', {
    fs: makeFs(),
    getDimensions: makeDims(1792, 1024),
  });
  assert.deepEqual(result, { ok: true });
});

test('fails when dimensions mismatch', () => {
  const result = verifyEntry(PNG_ENTRY, '/proj', {
    fs: makeFs(),
    getDimensions: makeDims(1024, 768),
  });
  assert.equal(result.ok, false);
  assert.match(result.reason, /1024×768/);
  assert.match(result.reason, /1024×1024/);
});

test('fails when getDimensions returns null', () => {
  const result = verifyEntry(PNG_ENTRY, '/proj', {
    fs: makeFs(),
    getDimensions: () => null,
  });
  assert.equal(result.ok, false);
  assert.match(result.reason, /dimensions/i);
});

test('fails on unrecognized format field', () => {
  const entry = { ...PNG_ENTRY, format: 'TIFF' };
  const result = verifyEntry(entry, '/proj', {
    fs: makeFs(),
    getDimensions: makeDims(1024, 1024),
  });
  assert.equal(result.ok, false);
  assert.match(result.reason, /format/i);
});

test('fails on unparseable native size', () => {
  const entry = { ...PNG_ENTRY, nativeSize: 'not-a-size' };
  const result = verifyEntry(entry, '/proj', {
    fs: makeFs(),
    getDimensions: makeDims(1024, 1024),
  });
  assert.equal(result.ok, false);
  assert.match(result.reason, /native size/i);
});

test('fails on native size with trailing garbage', () => {
  const entry = { ...PNG_ENTRY, nativeSize: '1024×1024 px' };
  const result = verifyEntry(entry, '/proj', {
    fs: makeFs(),
    getDimensions: makeDims(1024, 1024),
  });
  assert.equal(result.ok, false);
  assert.match(result.reason, /native size/i);
});

test('accepts native size with surrounding whitespace', () => {
  const entry = { ...PNG_ENTRY, nativeSize: '  1024×1024  ' };
  const result = verifyEntry(entry, '/proj', {
    fs: makeFs(),
    getDimensions: makeDims(1024, 1024),
  });
  assert.deepEqual(result, { ok: true });
});

// --- transparency gate ---

const TRANSPARENT_ENTRY = {
  ...PNG_ENTRY,
  index: 9,
  format: 'PNG transparent',
};

const OPAQUE_ENTRY = {
  ...PNG_ENTRY,
  index: 10,
  format: 'PNG',
};

test('passes a transparent entry whose PNG declares an alpha channel', () => {
  const result = verifyEntry(TRANSPARENT_ENTRY, '/proj', {
    fs: makeFs(),
    getDimensions: makeDims(1024, 1024),
    getHasAlpha: () => true,
  });
  assert.deepEqual(result, { ok: true });
});

test('fails a transparent entry whose PNG has no alpha channel', () => {
  const result = verifyEntry(TRANSPARENT_ENTRY, '/proj', {
    fs: makeFs(),
    getDimensions: makeDims(1024, 1024),
    getHasAlpha: () => false,
  });
  assert.equal(result.ok, false);
  assert.match(result.reason, /no alpha channel/);
});

test('fails a transparent entry when the alpha channel cannot be read', () => {
  const result = verifyEntry(TRANSPARENT_ENTRY, '/proj', {
    fs: makeFs(),
    getDimensions: makeDims(1024, 1024),
    getHasAlpha: () => null,
  });
  assert.equal(result.ok, false);
  assert.match(result.reason, /unable to read alpha channel/);
});

test('skips the alpha gate for an entry that never asked for transparency', () => {
  const result = verifyEntry(OPAQUE_ENTRY, '/proj', {
    fs: makeFs(),
    getDimensions: makeDims(1024, 1024),
    getHasAlpha: () => { throw new Error('should not be called'); },
  });
  assert.deepEqual(result, { ok: true });
});

test('tolerates a caller that does not inject getHasAlpha at all', () => {
  const result = verifyEntry(TRANSPARENT_ENTRY, '/proj', {
    fs: makeFs(),
    getDimensions: makeDims(1024, 1024),
  });
  assert.deepEqual(result, { ok: true });
});

// --- coverage gate: alpha present but unused ---

test('fails a transparent entry whose alpha channel is present but unused', () => {
  const result = verifyEntry(TRANSPARENT_ENTRY, '/proj', {
    fs: makeFs(),
    getDimensions: makeDims(1024, 1024),
    getHasAlpha: () => true,
    getAlphaCoverage: () => ({ transparentPct: 0, partialPct: 0, opaquePct: 100, maxAlpha: 255 }),
  });
  assert.equal(result.ok, false);
  assert.match(result.reason, /only 0% transparent/);
});

test('passes a transparent entry with real coverage', () => {
  const result = verifyEntry(TRANSPARENT_ENTRY, '/proj', {
    fs: makeFs(),
    getDimensions: makeDims(1024, 1024),
    getHasAlpha: () => true,
    getAlphaCoverage: () => ({ transparentPct: 62.9, partialPct: 1.4, opaquePct: 35.7, maxAlpha: 255 }),
  });
  assert.deepEqual(result, { ok: true });
});

test('tolerates an unmeasurable alpha channel rather than failing the entry', () => {
  const result = verifyEntry(TRANSPARENT_ENTRY, '/proj', {
    fs: makeFs(),
    getDimensions: makeDims(1024, 1024),
    getHasAlpha: () => true,
    getAlphaCoverage: () => null,
  });
  assert.deepEqual(result, { ok: true });
});

// ---- GIF entries -----------------------------------------------------------

const GIF_ENTRY = {
  ...PNG_ENTRY,
  index: 3,
  path: 'assets/gifs/dance.gif',
  format: 'GIF animated',
  nativeSize: '512×512',
};

/** Minimal structural GIF result, shaped like inspectGifFile's return. */
function gifResult(overrides = {}) {
  return {
    ok: true,
    width: 512,
    height: 512,
    frames: 6,
    delaysMs: [150, 150, 150, 150, 150, 150],
    loopCount: 0,
    ...overrides,
  };
}

function gifDeps(gif = gifResult()) {
  return {
    fs: makeFs(),
    getDimensions: () => { throw new Error('GIF path must not use the PNG reader'); },
    inspectGifFile: () => gif,
  };
}

test('passes when the GIF parses and matches (GIF animated)', () => {
  const result = verifyEntry(GIF_ENTRY, '/proj', gifDeps());
  assert.deepEqual(result, { ok: true, frames: 6 });
});

test('plain GIF format passes a single-frame file', () => {
  const result = verifyEntry({ ...GIF_ENTRY, format: 'GIF' }, '/proj',
    gifDeps(gifResult({ frames: 1 })));
  assert.deepEqual(result, { ok: true, frames: 1 });
});

test('GIF animated rejects a single-frame file', () => {
  const result = verifyEntry(GIF_ENTRY, '/proj', gifDeps(gifResult({ frames: 1 })));
  assert.equal(result.ok, false);
  assert.match(result.reason, /says animated but the GIF has 1 frame/);
});

test('GIF rejects a PNG extension', () => {
  const result = verifyEntry({ ...GIF_ENTRY, path: 'assets/gifs/dance.png' }, '/proj', gifDeps());
  assert.equal(result.ok, false);
  assert.match(result.reason, /extension .png does not match format/);
});

test('GIF rejects corrupt structure', () => {
  const result = verifyEntry(GIF_ENTRY, '/proj',
    gifDeps(gifResult({ ok: false, reason: 'corrupt', frames: 0 })));
  assert.equal(result.ok, false);
  assert.match(result.reason, /invalid GIF \(corrupt\)/);
});

test('GIF rejects truncated structure', () => {
  const result = verifyEntry(GIF_ENTRY, '/proj',
    gifDeps(gifResult({ ok: false, reason: 'truncated' })));
  assert.equal(result.ok, false);
  assert.match(result.reason, /invalid GIF \(truncated\)/);
});

test('GIF rejects dimension mismatch', () => {
  const result = verifyEntry(GIF_ENTRY, '/proj', gifDeps(gifResult({ width: 480, height: 480 })));
  assert.equal(result.ok, false);
  assert.match(result.reason, /dimensions 480×480 expected 512×512/);
});

test('GIF rejects a transparent token', () => {
  const result = verifyEntry({ ...GIF_ENTRY, format: 'GIF transparent' }, '/proj', gifDeps());
  assert.equal(result.ok, false);
  assert.match(result.reason, /transparent is not offered with GIF/);
});

test('GIF rejects an unparseable native size', () => {
  const result = verifyEntry({ ...GIF_ENTRY, nativeSize: 'big' }, '/proj', gifDeps());
  assert.equal(result.ok, false);
  assert.match(result.reason, /unparseable native size/);
});

test('GIF reports unreadable structure honestly', () => {
  const result = verifyEntry(GIF_ENTRY, '/proj', gifDeps(null));
  assert.equal(result.ok, false);
  assert.match(result.reason, /unable to read GIF structure/);
});

// ---- SVG entries -----------------------------------------------------------

const SVG_ENTRY = {
  ...PNG_ENTRY,
  index: 4,
  path: 'assets/icons/logo.svg',
  format: 'SVG',
  nativeSize: '512×512',
};

const SVG_BODY = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><rect width="512" height="512" fill="red"/></svg>
`;

function withSvgFile(body, action) {
  const dir = mkdtempSync(jpath(tmpdir(), 'pixeltamer-svg-test-'));
  try {
    const p = jpath(dir, 'logo.svg');
    wfs(p, body);
    return action(p);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function svgCheck(body, entry = SVG_ENTRY) {
  return withSvgFile(body, (p) =>
    verifyEntry({ ...entry, path: p }, jpath(p, '..'), { fs: makeFs() }));
}

test('passes when SVG width/height match (SVG)', () => {
  const result = svgCheck(SVG_BODY);
  assert.equal(result.ok, true, result.reason);
  assert.equal(result.width, 512);
});

test('SVG falls back to viewBox when width/height absent', () => {
  const body = `<svg xmlns="x" viewBox="0 0 512 512"><rect/></svg>`;
  const result = svgCheck(body);
  assert.equal(result.ok, true, result.reason);
});

test('SVG rejects non-SVG content', () => {
  const result = svgCheck('<html><body>not a svg</body></html>');
  assert.equal(result.ok, false);
  assert.match(result.reason, /root element is <html>, not <svg>/);
});

test('SVG rejects dimension mismatch', () => {
  const result = svgCheck('<svg width="256" height="256"></svg>');
  assert.equal(result.ok, false);
  assert.match(result.reason, /dimensions 256×256 expected 512×512/);
});

test('SVG rejects missing dimensions entirely', () => {
  const result = svgCheck('<svg xmlns="x"><rect/></svg>');
  assert.equal(result.ok, false);
  assert.match(result.reason, /no verifiable width\/height or viewBox/);
});

test('SVG rejects a transparent token', () => {
  const result = svgCheck(SVG_BODY, { ...SVG_ENTRY, format: 'SVG transparent' });
  assert.equal(result.ok, false);
  assert.match(result.reason, /not verifiable on SVG/);
});

test('SVG rejects a non-.svg extension', () => {
  return withSvgFile(SVG_BODY, (p) => {
    const pngPath = p.replace(/\.svg$/, '.png');
    wfs(pngPath, SVG_BODY);
    const result = verifyEntry({ ...SVG_ENTRY, path: pngPath }, jpath(pngPath, '..'), { fs: makeFs() });
    assert.equal(result.ok, false);
    assert.match(result.reason, /extension .png does not match format/);
  });
});

// ---- SVG adversarial cases (advisor round) ---------------------------------

test('SVG smaller than the raster floor still verifies', () => {
  // Real ~200-byte file, stubbed stat matches: SVG entries use a 64-byte floor.
  const body = '<svg xmlns="x" width="512" height="512"><rect/></svg>';
  const result = svgCheck(body);
  assert.equal(result.ok, true, result.reason);
});

test('SVG rejects an HTML document containing an svg string', () => {
  const result = svgCheck('<!DOCTYPE html><html><body><svg width="512" height="512"></svg></body></html>');
  assert.equal(result.ok, false);
  assert.match(result.reason, /root element is <html>/);
});

test('SVG rejects a commented-out fake svg', () => {
  const result = svgCheck('<!-- <svg width="512" height="512"></svg> -->\n<svg width="256" height="256"></svg>');
  assert.equal(result.ok, false);
  assert.match(result.reason, /dimensions 256×256 expected 512×512/);
});

test('SVG rejects a truncated prolog', () => {
  const result = svgCheck('<?xml version="1.0"?>\n<!-- unterminated comment');
  assert.equal(result.ok, false);
  assert.match(result.reason, /no SVG root element/);
});

test('SVG ignores data-width impostor attributes', () => {
  const result = svgCheck('<svg xmlns="x" data-width="512" data-height="512" viewBox="0 0 512 512"><rect/></svg>');
  assert.equal(result.ok, true, result.reason); // falls through to viewBox
  const bad = svgCheck('<svg xmlns="x" data-width="512" data-height="512"><rect/></svg>');
  assert.equal(bad.ok, false);
  assert.match(bad.reason, /no verifiable width\/height or viewBox/);
});

test('SVG viewBox with negative origin and comma separators parses', () => {
  const result = svgCheck('<svg xmlns="x" viewBox="-10,-10 512,512"><rect/></svg>');
  assert.equal(result.ok, true, result.reason);
});

test('SVG fractional width fails exact compare', () => {
  const result = svgCheck('<svg width="511.6" height="512"></svg>');
  assert.equal(result.ok, false);
  assert.match(result.reason, /dimensions 511\.6×512 expected/);
});

test('SVG rejects non-positive viewBox dimensions', () => {
  const result = svgCheck('<svg viewBox="0 0 0 512"></svg>');
  assert.equal(result.ok, false);
  assert.match(result.reason, /no verifiable width\/height/);
});
