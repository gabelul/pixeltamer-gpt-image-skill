import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDimensions, readImageDimensions } from '../scripts/lib/image-dimensions.mjs';

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
