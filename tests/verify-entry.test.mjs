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
