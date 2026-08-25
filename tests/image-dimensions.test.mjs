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
  parseAlphaCoverage,
  readAlphaCoverage,
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

// --- alpha coverage (decodes pixels, not just the header) ---

import { deflateSync } from 'node:zlib';

/** Build a real PNG so the decoder is exercised end to end, not mocked. */
function buildPng({ width, height, colorType, pixel, trns = null }) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = colorType;
  const channels = { 6: 4, 4: 2, 3: 1, 2: 3 }[colorType];
  const rows = [];
  for (let y = 0; y < height; y++) {
    const row = Buffer.alloc(width * channels + 1);       // filter byte 0 + data
    for (let x = 0; x < width; x++) {
      const px = pixel(x, y);
      for (let c = 0; c < channels; c++) row[1 + x * channels + c] = px[c];
    }
    rows.push(row);
  }
  const parts = [
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
  ];
  if (colorType === 3) parts.push(chunk('PLTE', Buffer.alloc(3 * 256, 0x80)));
  if (trns) parts.push(chunk('tRNS', Buffer.from(trns)));
  parts.push(chunk('IDAT', deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0)));
  return Buffer.concat(parts);
}

function crc32(buf) {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (~c) >>> 0;
}

test('parseAlphaCoverage measures a half-transparent RGBA image', () => {
  const png = buildPng({
    width: 10, height: 10, colorType: 6,
    pixel: (x) => [200, 180, 120, x < 5 ? 0 : 255],
  });
  const r = parseAlphaCoverage(png);
  assert.equal(r.transparentPct, 50);
  assert.equal(r.opaquePct, 50);
  assert.equal(r.maxAlpha, 255);
});

test('parseAlphaCoverage catches the silent failure: RGBA but fully opaque', () => {
  const png = buildPng({
    width: 8, height: 8, colorType: 6, pixel: () => [10, 20, 30, 255],
  });
  const r = parseAlphaCoverage(png);
  assert.equal(r.transparentPct, 0);
  assert.equal(r.opaquePct, 100);
});

test('parseAlphaCoverage reports partial alpha separately from opaque', () => {
  const png = buildPng({
    width: 10, height: 10, colorType: 6,
    pixel: (x) => [0, 0, 0, x < 5 ? 128 : 255],
  });
  const r = parseAlphaCoverage(png);
  assert.equal(r.partialPct, 50);
  assert.equal(r.opaquePct, 50);
  assert.equal(r.transparentPct, 0);
});

test('parseAlphaCoverage handles grayscale+alpha (colour type 4)', () => {
  const png = buildPng({
    width: 10, height: 10, colorType: 4, pixel: (x) => [128, x < 2 ? 0 : 255],
  });
  assert.equal(parseAlphaCoverage(png).transparentPct, 20);
});

test('parseAlphaCoverage reads palette transparency via tRNS — what pngquant emits', () => {
  // index 0 fully transparent, index 1 fully opaque
  const png = buildPng({
    width: 10, height: 10, colorType: 3,
    pixel: (x) => [x < 3 ? 0 : 1],
    trns: [0, 255],
  });
  const r = parseAlphaCoverage(png);
  assert.equal(r.transparentPct, 30);
  assert.equal(r.opaquePct, 70);
});

test('parseAlphaCoverage returns null for an image with no alpha at all', () => {
  const png = buildPng({ width: 4, height: 4, colorType: 2, pixel: () => [1, 2, 3] });
  assert.equal(parseAlphaCoverage(png), null);
});

test('parseAlphaCoverage returns null on a non-PNG', () => {
  assert.equal(parseAlphaCoverage(Buffer.from('not a png at all, padding padding')), null);
});

test('readAlphaCoverage returns null when the reader throws', () => {
  assert.equal(readAlphaCoverage('/nowhere.png', () => { throw new Error('nope'); }), null);
});

test('parseHasAlphaChannel accepts palette + tRNS (pngquant output)', () => {
  const png = buildPng({
    width: 4, height: 4, colorType: 3, pixel: () => [0], trns: [0, 255],
  });
  assert.equal(parseHasAlphaChannel(png), true);
});

test('parseHasAlphaChannel rejects palette without tRNS', () => {
  const png = buildPng({ width: 4, height: 4, colorType: 3, pixel: () => [0] });
  assert.equal(parseHasAlphaChannel(png), false);
});
