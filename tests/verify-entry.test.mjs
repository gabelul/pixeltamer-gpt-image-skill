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
