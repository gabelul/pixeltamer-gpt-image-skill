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
