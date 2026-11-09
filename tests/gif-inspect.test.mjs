/**
 * tests/gif-inspect.test.mjs
 *
 * lib/gif-inspect.mjs is a structural GIF parser — signature, frame count,
 * per-frame delays, loop extension, truncation. These tests feed it hand-built
 * byte fixtures, not files written by ImageMagick or any other encoder: the
 * parser must accept structure, not encoder quirks. Fixtures are built in
 * byte-space so every block boundary is explicit and every test documents the
 * exact layout it exercises.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inspectGif, inspectGifFile } from '../scripts/lib/gif-inspect.mjs';

/**
 * Emit a minimal-but-legal GIF byte array.
 * @param {object} opts
 * @param {number} [opts.frames=2] image descriptors to emit
 * @param {number} [opts.delayCs=10] per-frame delay in centiseconds
 * @param {number|null} [opts.loop=0] NETSCAPE loop count; null omits the extension
 * @param {boolean} [opts.gct=true] include a global color table
 * @param {boolean} [opts.lct=false] include a local color table per frame
 * @param {boolean} [opts.trailer=true] end with the 0x3B trailer
 * @param {boolean} [opts.corrupt=false] inject an unknown block marker before the trailer
 * @param {boolean} [opts.withGce=true] emit a graphic control extension per frame
 * @param {number} [opts.width=4] logical width
 * @param {number} [opts.height=4] logical height
 * @returns {Uint8Array}
 */
function buildGif({
  frames = 2, delayCs = 10, loop = 0, gct = true, lct = false,
  trailer = true, corrupt = false, withGce = true, width = 4, height = 4,
} = {}) {
  const b = [];
  const push = (...xs) => b.push(...xs);
  const push16 = (n) => push(n & 0xff, (n >> 8) & 0xff);

  push(...'GIF89a'.split('').map((c) => c.charCodeAt(0)));
  push16(width);
  push16(height);
  push(gct ? 0x80 : 0x00); // packed: GCT present, size field 0 → 2 entries
  push(0x00, 0x00);        // background color index, pixel aspect ratio
  if (gct) push(0, 0, 0, 255, 255, 255); // two 3-byte entries

  if (loop !== null) {
    // Application extension carrying the NETSCAPE2.0 looping block:
    // [0B "NETSCAPE2.0"][03 01 count_lo count_hi][00 terminator]
    push(0x21, 0xff, 11, ...'NETSCAPE2.0'.split('').map((c) => c.charCodeAt(0)));
    push(3, 0x01, loop & 0xff, (loop >> 8) & 0xff, 0x00);
  }

  for (let i = 0; i < frames; i += 1) {
    if (withGce) {
      push(0x21, 0xf9, 4, 0x00, delayCs & 0xff, (delayCs >> 8) & 0xff, 0x00, 0x00);
    }
    push(0x2c);          // image descriptor
    push16(0); push16(0); // x, y
    push16(width); push16(height); // w, h
    push(lct ? 0x80 : 0x00); // packed: optional LCT, size field 0 → 2 entries
    if (lct) push(0, 0, 0, 255, 255, 255);
    push(0x02);          // LZW minimum code size
    push(2, 0x44, 0x01); // one data sub-block (two LZW bytes)
    push(0x00);          // block terminator
  }

  if (corrupt) push(0x99); // unknown block marker
  if (trailer) push(0x3b);

  return new Uint8Array(b);
}

test('parses a legal two-frame looping GIF', () => {
  const r = inspectGif(buildGif({ frames: 2, delayCs: 10, loop: 0 }));
  assert.equal(r.ok, true);
  assert.equal(r.width, 4);
  assert.equal(r.height, 4);
  assert.equal(r.frames, 2);
  assert.deepEqual(r.delaysMs, [100, 100]);
  assert.equal(r.loopCount, 0); // 0 = loop forever
  assert.equal(r.truncated, false);
});

test('parses delays larger than one byte as little-endian centiseconds', () => {
  const r = inspectGif(buildGif({ frames: 1, delayCs: 150 })); // 1.5s
  assert.equal(r.delaysMs[0], 1500);
});

test('single-frame GIF parses ok — animation policy belongs to the caller', () => {
  const r = inspectGif(buildGif({ frames: 1 }));
  assert.equal(r.ok, true);
  assert.equal(r.frames, 1);
});

test('finite loop count is reported', () => {
  const r = inspectGif(buildGif({ frames: 2, loop: 3 }));
  assert.equal(r.loopCount, 3);
});

test('absent NETSCAPE extension reports loopCount null', () => {
  const r = inspectGif(buildGif({ frames: 2, loop: null }));
  assert.equal(r.loopCount, null);
});

test('frames without GCE report no delays', () => {
  const r = inspectGif(buildGif({ frames: 3, withGce: false, loop: null }));
  assert.equal(r.ok, true);
  assert.equal(r.frames, 3);
  assert.deepEqual(r.delaysMs, []);
});

test('local color tables are skipped without corrupting the walk', () => {
  const r = inspectGif(buildGif({ frames: 2, lct: true, gct: false }));
  assert.equal(r.ok, true);
  assert.equal(r.frames, 2);
});

test('PNG bytes are rejected as not_a_gif', () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  const r = inspectGif(png);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'not_a_gif');
});

test('a file whose body is only the signature is truncated', () => {
  const r = inspectGif(new Uint8Array([...buildGif({}).slice(0, 6)]));
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'truncated');
  assert.equal(r.truncated, true);
});

test('a GIF cut off before the trailer is truncated, with frames seen so far', () => {
  const full = buildGif({ frames: 3 });
  const cut = full.slice(0, full.length - 1); // drop the 0x3B trailer byte
  const r = inspectGif(cut);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'truncated');
  assert.equal(r.frames, 3);
});

test('a truncated mid-frame file reports truncation', () => {
  const full = buildGif({ frames: 2 });
  // Cut inside the first frame's data sub-block.
  const r = inspectGif(full.slice(0, full.length - 20));
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'truncated');
});

test('an unknown block marker is corrupt, not truncated', () => {
  const r = inspectGif(buildGif({ frames: 2, corrupt: true }));
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'corrupt');
});

test('a global color table is skipped by its declared size', () => {
  // packed 0x80 => 2 GCT entries (6 bytes). A wrong skip lands the walk inside
  // the table and misreads the next block as corrupt.
  const r = inspectGif(buildGif({ frames: 2, gct: true }));
  assert.equal(r.ok, true);
  assert.equal(r.frames, 2);
});

test('inspectGifFile returns null for an unreadable path', () => {
  assert.equal(inspectGifFile('/nonexistent/path/x.gif'), null);
});

test('inspectGifFile accepts an injected reader', () => {
  const bytes = buildGif({ frames: 2 });
  const r = inspectGifFile('memory://fixture', () => Buffer.from(bytes));
  assert.equal(r.ok, true);
  assert.equal(r.frames, 2);
});

test('inspectGifFile returns null when the injected reader throws', () => {
  const r = inspectGifFile('memory://fixture', () => {
    throw new Error('boom');
  });
  assert.equal(r, null);
});
