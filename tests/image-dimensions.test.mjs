import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseDimensions,
  readImageDimensions,
  parseHasAlphaChannel,
  readHasAlphaChannel,
} from '../scripts/lib/image-dimensions.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const examplesDir = resolve(here, '..', 'examples');

// --- PNG ---

test('parseDimensions reads PNG width/height from IHDR', () => {
  const buf = Buffer.alloc(24);
  buf.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0); // signature
  buf.writeUInt32BE(800, 16); // width
  buf.writeUInt32BE(600, 20); // height
  assert.deepEqual(parseDimensions(buf), { width: 800, height: 600 });
});

test('parseDimensions rejects a PNG signature that is too short to hold IHDR', () => {
  const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert.equal(parseDimensions(buf), null);
});

// --- JPEG ---

test('parseDimensions reads JPEG width/height from the SOF0 segment', () => {
  // SOI, APP0 (skipped), SOF0 carrying height=600 then width=800
  const buf = Buffer.from([
    0xff, 0xd8,                   // SOI
    0xff, 0xe0, 0x00, 0x10,       // APP0, length 16
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, // 14 bytes of APP0 payload
    0xff, 0xc0, 0x00, 0x11,       // SOF0, length 17
    0x08,                          // precision
    0x02, 0x58,                    // height = 600
    0x03, 0x20,                    // width  = 800
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0,  // remaining SOF payload
  ]);
  assert.deepEqual(parseDimensions(buf), { width: 800, height: 600 });
});

test('parseDimensions skips restart/standalone markers without mis-reading', () => {
  const buf = Buffer.from([
    0xff, 0xd8,             // SOI
    0xff, 0xd0,             // RST0 (standalone, no length)
    0xff, 0xc0, 0x00, 0x11, // SOF0
    0x08, 0x00, 0x90, 0x01, 0x40, // precision, height=144, width=320
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  ]);
  assert.deepEqual(parseDimensions(buf), { width: 320, height: 144 });
});

// --- unrecognized / failure ---

test('parseDimensions returns null for non-image bytes', () => {
  assert.equal(parseDimensions(Buffer.from('not an image at all')), null);
});

test('parseDimensions returns null for empty/tiny buffers', () => {
  assert.equal(parseDimensions(Buffer.alloc(0)), null);
  assert.equal(parseDimensions(Buffer.from([0x89])), null);
});

// --- real file + injected reader ---

test('readImageDimensions reads a real example PNG', () => {
  // examples/landscape-cinematic.png is 1536x1024
  assert.deepEqual(
    readImageDimensions(resolve(examplesDir, 'landscape-cinematic.png')),
    { width: 1536, height: 1024 },
  );
});

test('readImageDimensions returns null when the file cannot be read', () => {
  const throwingReader = () => { throw new Error('ENOENT'); };
  assert.equal(readImageDimensions('/no/such/file.png', throwingReader), null);
});

// --- alpha channel (PNG colour type) ---

// Build a minimal PNG header with a given IHDR colour type. Offsets: signature
// 0-7, chunk length + "IHDR" 8-15, width 16-19, height 20-23, bit depth 24,
// colour type 25.
function pngWithColorType(colorType) {
  const buf = Buffer.alloc(26);
  buf.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  buf.writeUInt32BE(1024, 16);
  buf.writeUInt32BE(1024, 20);
  buf[24] = 8;
  buf[25] = colorType;
  return buf;
}

test('parseHasAlphaChannel is true for RGBA (colour type 6)', () => {
  assert.equal(parseHasAlphaChannel(pngWithColorType(6)), true);
});

test('parseHasAlphaChannel is true for grayscale+alpha (colour type 4)', () => {
  assert.equal(parseHasAlphaChannel(pngWithColorType(4)), true);
});

test('parseHasAlphaChannel is false for plain RGB (colour type 2)', () => {
  assert.equal(parseHasAlphaChannel(pngWithColorType(2)), false);
});

test('parseHasAlphaChannel is false for grayscale (colour type 0)', () => {
  assert.equal(parseHasAlphaChannel(pngWithColorType(0)), false);
});

test('parseHasAlphaChannel is null for a JPEG', () => {
  assert.equal(parseHasAlphaChannel(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])), null);
});

test('parseHasAlphaChannel is null for a PNG truncated before the colour-type byte', () => {
  assert.equal(parseHasAlphaChannel(pngWithColorType(6).subarray(0, 25)), null);
});

test('parseHasAlphaChannel is null for empty input', () => {
  assert.equal(parseHasAlphaChannel(Buffer.alloc(0)), null);
});

test('readHasAlphaChannel returns null when the reader throws', () => {
  const boom = () => { throw new Error('nope'); };
  assert.equal(readHasAlphaChannel('/nowhere.png', boom), null);
});

test('readHasAlphaChannel reads a real example PNG', () => {
  const png = readdirSync(examplesDir).find((f) => f.endsWith('.png'));
  assert.ok(png, 'expected at least one example PNG');
  // Value depends on the fixture; assert only that it resolves to a boolean,
  // i.e. the file parsed as a PNG rather than falling through to null.
  assert.equal(typeof readHasAlphaChannel(resolve(examplesDir, png)), 'boolean');
});
