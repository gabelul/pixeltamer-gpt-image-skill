// Zero-dependency image dimension reader for PNG and JPEG — the two formats
// pixeltamer produces (gpt-image-2 emits PNG; JPEG shows up after post-process).
// Replaces the `image-size` npm dep so `batch` mode has nothing to `npm install`
// — the Skills CLI copies files without running npm install, so a real dependency
// here meant batch crashed on every fresh install. Width/height live in the
// header bytes of both formats, so reading them is a few lines, not a package.
//
// Anything that isn't a recognizable PNG/JPEG returns null, which the verifier
// already treats as "unable to read image dimensions" — a clean fail, not a crash.

import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

// PNG: 8-byte signature, then the IHDR chunk. Width and height are big-endian
// uint32s at fixed offsets 16 and 20 (chunk-length + "IHDR" occupy 8–15).
function pngDimensions(buf) {
  if (buf.length < 24) return null;
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  for (let i = 0; i < 8; i++) {
    if (buf[i] !== sig[i]) return null;
  }
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

// JPEG: starts with SOI (FF D8), then a chain of segments. We walk markers until
// we hit a Start-of-Frame (SOFn) segment, which carries height then width as
// big-endian uint16s. Skips standalone markers (no length) and APPn/quant/etc.
function jpegDimensions(buf) {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let off = 2;
  while (off + 1 < buf.length) {
    // Markers begin with 0xFF; tolerate fill bytes between segments.
    if (buf[off] !== 0xff) { off++; continue; }
    const marker = buf[off + 1];
    off += 2;
    // Standalone markers carry no length payload: SOI/EOI/TEM and the restart
    // markers RST0–RST7.
    if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 ||
        (marker >= 0xd0 && marker <= 0xd7)) {
      continue;
    }
    if (off + 2 > buf.length) return null;
    const segLen = buf.readUInt16BE(off);
    // SOF markers are C0–CF except C4 (Huffman table), C8 (JPEG ext), CC (arith
    // coding) — those aren't frame headers.
    if (marker >= 0xc0 && marker <= 0xcf &&
        marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      if (off + 7 > buf.length) return null;
      // segment: length(2) precision(1) height(2) width(2)
      return { height: buf.readUInt16BE(off + 3), width: buf.readUInt16BE(off + 5) };
    }
    off += segLen; // jump past this segment to the next marker
  }
  return null;
}

// PNG IHDR carries a colour-type byte at offset 25 (right after the 1-byte bit
// depth at 24). Bit 2 of that byte is the alpha flag, so type 4 (grayscale+alpha)
// and 6 (RGBA) are the two that carry a real alpha channel. Types 0/2/3 don't.
//
// Type 3 (palette) deserves a note: a PLTE image CAN fake transparency via a
// tRNS chunk, but gpt-image-2 never emits palette PNGs, so treating type 3 as
// "no alpha" costs us nothing and keeps this a fixed-offset read.
const PNG_COLOR_TYPE_OFFSET = 25;

/**
 * Collect the PNG chunks we care about. One walk, reused by both readers.
 * @param {Buffer} buf - raw PNG bytes
 * @returns {{idat:Buffer[], trns:Buffer|null}}
 */
function pngChunks(buf) {
  const idat = [];
  let trns = null;
  let pos = 8;
  while (pos + 8 <= buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    if (type === 'IDAT') idat.push(buf.subarray(pos + 8, pos + 8 + len));
    else if (type === 'tRNS') trns = buf.subarray(pos + 8, pos + 8 + len);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  return { idat, trns };
}
const PNG_ALPHA_BIT = 0b100;

/**
 * Does this image buffer declare an alpha channel?
 *
 * Header-only check — it reads the format's own declaration, it does NOT decode
 * pixels. So a PNG whose alpha channel exists but is fully opaque (the classic
 * "model painted a backdrop anyway" failure) still returns true here. Proving
 * pixels are actually transparent needs an IDAT inflate; this is the cheap gate
 * that catches the common case of getting RGB back when you asked for RGBA.
 *
 * @param {Buffer} buf - raw image bytes
 * @returns {boolean|null} true/false for a readable PNG, null if not a PNG we can parse
 */
export function parseHasAlphaChannel(buf) {
  if (!buf || buf.length <= PNG_COLOR_TYPE_OFFSET) return null;
  if (!pngDimensions(buf)) return null; // not a PNG (JPEG never has alpha anyway)
  if ((buf[PNG_COLOR_TYPE_OFFSET] & PNG_ALPHA_BIT) !== 0) return true;
  // Palette PNGs carry transparency in a tRNS chunk instead of an alpha
  // channel, and it is just as real. gpt-image-2 doesn't emit these, but
  // pngquant does — and post-process.md recommends pngquant — so a file that
  // went through our own documented optimisation step must not read as opaque.
  if (buf[PNG_COLOR_TYPE_OFFSET] === 3) return pngChunks(buf).trns !== null;
  return false;
}

/**
 * Read an image file from disk and report whether it declares an alpha channel.
 * @param {string} path - image file path
 * @param {(p:string)=>Buffer} [readFile] - injectable reader (defaults to fs); handy for tests
 * @returns {boolean|null} true/false, or null on read/parse failure
 */
export function readHasAlphaChannel(path, readFile = readFileSync) {
  let buf;
  try {
    buf = readFile(path);
  } catch {
    return null;
  }
  return parseHasAlphaChannel(buf);
}

// Reading the alpha CHANNEL is a header lookup. Reading whether that channel is
// actually USED means decoding pixels, and the difference is the whole point:
// a PNG can declare RGBA and have every single pixel opaque. That is what you
// get when you ask for a transparent background and the prompt talks the model
// into painting a backdrop, and it is invisible to every cheaper check.
//
// Only what gpt-image-2 emits is supported: 8-bit, non-interlaced, colour type
// 4 or 6. Anything else returns null, which callers already treat as "couldn't
// read" rather than "no transparency".
const PNG_BIT_DEPTH_OFFSET = 24;
const PNG_INTERLACE_OFFSET = 28;

/** Undo one PNG scanline filter in place. Spec §9.2. */
function unfilterScanline(type, line, prev, bpp) {
  switch (type) {
    case 0: break;
    case 1:
      for (let i = bpp; i < line.length; i++) line[i] = (line[i] + line[i - bpp]) & 0xff;
      break;
    case 2:
      for (let i = 0; i < line.length; i++) line[i] = (line[i] + prev[i]) & 0xff;
      break;
    case 3:
      for (let i = 0; i < line.length; i++) {
        const a = i >= bpp ? line[i - bpp] : 0;
        line[i] = (line[i] + ((a + prev[i]) >> 1)) & 0xff;
      }
      break;
    case 4:
      for (let i = 0; i < line.length; i++) {
        const a = i >= bpp ? line[i - bpp] : 0;
        const b = prev[i];
        const c = i >= bpp ? prev[i - bpp] : 0;
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        const pred = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
        line[i] = (line[i] + pred) & 0xff;
      }
      break;
    default: return false;
  }
  return true;
}

/**
 * Measure how much of a PNG's alpha channel is actually transparent.
 *
 * @param {Buffer} buf - raw PNG bytes
 * @returns {{transparentPct:number, partialPct:number, opaquePct:number, maxAlpha:number}|null}
 *   percentages of fully-transparent (a=0), partial (1-249) and near-opaque
 *   (>=250) pixels, or null if this isn't a PNG we can decode.
 */
export function parseAlphaCoverage(buf) {
  const header = buf && pngDimensions(buf);
  if (!header) return null;
  if (buf[PNG_BIT_DEPTH_OFFSET] !== 8) return null;
  if (buf[PNG_INTERLACE_OFFSET] !== 0) return null;

  const colorType = buf[PNG_COLOR_TYPE_OFFSET];
  const { idat, trns } = pngChunks(buf);

  // Two shapes carry alpha: a real channel (types 4/6), or a palette whose
  // tRNS chunk gives an alpha per palette index (type 3, what pngquant emits).
  let channels;
  if ((colorType & PNG_ALPHA_BIT) !== 0) channels = colorType === 6 ? 4 : 2;
  else if (colorType === 3 && trns) channels = 1;
  else return null;

  if (!idat.length) return null;

  let raw;
  try {
    raw = inflateSync(Buffer.concat(idat));
  } catch {
    return null;
  }

  const { width, height } = header;
  const stride = width * channels;
  if (raw.length < (stride + 1) * height) return null;

  let transparent = 0, partial = 0, opaque = 0, maxAlpha = 0;
  let prev = Buffer.alloc(stride);
  let offset = 0;

  for (let y = 0; y < height; y++) {
    const filter = raw[offset++];
    const line = Buffer.from(raw.subarray(offset, offset + stride));
    offset += stride;
    if (!unfilterScanline(filter, line, prev, channels)) return null;
    for (let i = channels - 1; i < stride; i += channels) {
      // Palette: the byte is an index; its alpha lives in tRNS. Indices past
      // the end of tRNS are fully opaque, per spec.
      const a = channels === 1 ? (i < line.length && line[i] < trns.length ? trns[line[i]] : 255)
                               : line[i];
      if (a > maxAlpha) maxAlpha = a;
      if (a === 0) transparent++;
      else if (a >= 250) opaque++;
      else partial++;
    }
    prev = line;
  }

  const total = width * height;
  const pct = (n) => Math.round((1000 * n) / total) / 10;
  return {
    transparentPct: pct(transparent),
    partialPct: pct(partial),
    opaquePct: pct(opaque),
    maxAlpha,
  };
}

/**
 * Read a PNG from disk and measure its alpha coverage.
 * @param {string} path - image file path
 * @param {(p:string)=>Buffer} [readFile] - injectable reader; handy for tests
 * @returns {{transparentPct:number,partialPct:number,opaquePct:number,maxAlpha:number}|null}
 */
export function readAlphaCoverage(path, readFile = readFileSync) {
  let buf;
  try {
    buf = readFile(path);
  } catch {
    return null;
  }
  return parseAlphaCoverage(buf);
}

/**
 * Parse width/height out of an in-memory image buffer.
 * @param {Buffer} buf - raw image bytes
 * @returns {{width:number,height:number}|null} dimensions, or null if unrecognized
 */
export function parseDimensions(buf) {
  if (!buf || buf.length < 4) return null;
  if (buf[0] === 0x89 && buf[1] === 0x50) return pngDimensions(buf);
  if (buf[0] === 0xff && buf[1] === 0xd8) return jpegDimensions(buf);
  return null;
}

/**
 * Read an image file from disk and return its dimensions.
 * @param {string} path - image file path
 * @param {(p:string)=>Buffer} [readFile] - injectable reader (defaults to fs); handy for tests
 * @returns {{width:number,height:number}|null} dimensions, or null on read/parse failure
 */
export function readImageDimensions(path, readFile = readFileSync) {
  let buf;
  try {
    buf = readFile(path);
  } catch {
    return null;
  }
  return parseDimensions(buf);
}
