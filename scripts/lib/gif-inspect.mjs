/**
 * scripts/lib/gif-inspect.mjs
 *
 * Structural GIF inspector: what the bytes claim to be, with zero
 * dependencies and no pixel decoding. Companion to image-dimensions.mjs,
 * which does the same job for PNG/JPEG.
 *
 * Answers, from the block structure alone:
 *   - is it a GIF at all (full GIF87a/GIF89a signature)
 *   - is it complete (ends with the 0x3B trailer — truncated files don't)
 *   - how many frames (image descriptors)
 *   - per-frame delays in ms (graphic control extensions)
 *   - loop count from NETSCAPE2.0 (0 = loop forever, null = extension absent)
 *
 * What it does NOT answer: whether the compressed pixel data decodes, or
 * whether any frame actually differs from another. Structural parsing cannot
 * prove animation quality — a "6-frame" file may be six identical frames.
 * Use ImageMagick (`compare -metric RMSE`) or eyes for that.
 *
 * The block walk is bounded: every read checks bounds, and block iteration is
 * capped, so a hostile or corrupt file fails fast instead of looping forever.
 */

import { readFileSync } from 'node:fs';

/** Sanity cap on block iterations — a legal GIF never approaches this. */
const MAX_BLOCKS = 100_000;

/**
 * Read a two-byte little-endian unsigned integer.
 * @param {Uint8Array} b
 * @param {number} pos
 * @returns {number}
 */
function le16(b, pos) {
  return b[pos] | (b[pos + 1] << 8);
}

/**
 * Skip a run of data sub-blocks (each: 1 length byte, then that many bytes),
 * stopping at the zero-length terminator.
 * @param {Uint8Array} b
 * @param {number} pos - position of the first sub-block length byte
 * @param {number[]} [out] - optional collector for sub-block contents (label blocks only)
 * @returns {number} position after the terminator, or -1 if out of bounds
 */
function skipSubBlocks(b, pos, out) {
  while (pos < b.length) {
    const len = b[pos];
    pos += 1;
    if (len === 0) return pos;
    if (pos + len > b.length) return -1;
    if (out) for (let i = 0; i < len; i += 1) out.push(b[pos + i]);
    pos += len;
  }
  return -1;
}

/**
 * Inspect a GIF byte buffer.
 * @param {Uint8Array|Buffer} bytes
 * @returns {{ok: true, width: number, height: number, frames: number,
 *            delaysMs: number[], loopCount: number|null, truncated: false}
 *          |{ok: false, reason: string, frames: number, truncated: boolean}}
 *   `reason`: 'not_a_gif' | 'truncated' | 'corrupt'
 */
export function inspectGif(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const sig = String.fromCharCode(...b.slice(0, 6));
  if (sig !== 'GIF87a' && sig !== 'GIF89a') {
    return { ok: false, reason: 'not_a_gif', frames: 0, truncated: false };
  }
  if (b.length < 13) {
    return { ok: false, reason: 'truncated', frames: 0, truncated: true };
  }

  const width = le16(b, 6);
  const height = le16(b, 8);
  const packed = b[10];

  let pos = 13;
  if (packed & 0x80) {
    pos += 3 * 2 ** ((packed & 0x07) + 1);
    if (pos > b.length) {
      return { ok: false, reason: 'truncated', frames: 0, truncated: true };
    }
  }

  let frames = 0;
  const delaysMs = [];
  let loopCount = null;
  let truncated = true;

  for (let blocks = 0; blocks < MAX_BLOCKS; blocks += 1) {
    if (pos >= b.length) break;
    const marker = b[pos];
    pos += 1;

    if (marker === 0x3b) {
      // Trailer: a complete file.
      truncated = false;
      break;
    }

    if (marker === 0x21) {
      // Extension: label byte, then sub-blocks.
      if (pos >= b.length) break;
      const label = b[pos];
      pos += 1;
      if (label === 0xf9) {
        // Graphic control extension: one 4-byte block then terminator.
        // Block layout: packed(1), delay centiseconds LE(2), transparent idx(1).
        const collected = [];
        pos = skipSubBlocks(b, pos, collected);
        if (pos === -1) break;
        if (collected.length >= 3) {
          delaysMs.push(le16(collected, 1) * 10);
        }
      } else {
        // Collect app-extension sub-blocks; other extensions just skip.
        const collected = label === 0xff ? [] : undefined;
        pos = skipSubBlocks(b, pos, collected);
        if (pos === -1) break;
        if (collected) {
          // NETSCAPE2.0's sub-blocks are: the 11-byte identifier, then the
          // 3-byte loop block (0x01, count LE16, 0 = loop forever). Find the
          // 0x01 marker rather than assuming a fixed offset.
          const idx = collected.indexOf(0x01);
          if (idx !== -1 && collected.length >= idx + 3) {
            loopCount = collected[idx + 1] | (collected[idx + 2] << 8);
          }
        }
      }
      continue;
    }

    if (marker === 0x2c) {
      // Image descriptor: one more frame.
      frames += 1;
      if (pos + 9 > b.length) break;
      const lp = b[pos + 8];
      pos += 9;
      if (lp & 0x80) {
        pos += 3 * 2 ** ((lp & 0x07) + 1);
        if (pos > b.length) break;
      }
      if (pos >= b.length) break;
      pos += 1; // LZW minimum code size byte
      pos = skipSubBlocks(b, pos);
      if (pos === -1) break;
      continue;
    }

    // Unknown block marker: the structure is broken.
    return {
      ok: false, reason: 'corrupt', frames, truncated: true,
    };
  }

  if (truncated) {
    return { ok: false, reason: 'truncated', frames, truncated: true };
  }
  return { ok: true, width, height, frames, delaysMs, loopCount, truncated: false };
}

/**
 * Inspect a GIF on disk.
 * @param {string} path
 * @param {(p: string) => Buffer} [readFn] - injectable reader (defaults to readFileSync)
 * @returns {object|null} inspectGif result, or null when the file can't be read
 */
export function inspectGifFile(path, readFn = readFileSync) {
  let bytes;
  try {
    bytes = readFn(path);
  } catch {
    return null;
  }
  return inspectGif(bytes);
}
