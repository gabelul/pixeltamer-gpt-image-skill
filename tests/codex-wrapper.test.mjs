/**
 * tests/codex-wrapper.test.mjs
 *
 * Functional tests for scripts/pixeltamer_codex.sh's GIF support, run against
 * a stub codex binary (CODEX_BIN) so nothing here touches the network or a
 * ChatGPT subscription. The stub answers `login status` and `exec`: it parses
 * the work paths out of the prompt (the same paths the real codex is asked to
 * save to), copies a fixture artifact onto them, and prints them — the same
 * observable behaviour the wrapper's publish path expects from the real tool.
 *
 * HOME is pointed at a sandbox for every test so the wrapper's cache-recovery
 * scan can never see the developer's real ~/.codex/generated_images — a test
 * that expected failure must not "pass" because the real machine's cache had
 * a fresh artifact lying around.
 *
 * Timing note: the recovery scan only considers cache files NEWER than the
 * wrapper's start marker, so cache fixtures must be created DURING the stub's
 * exec run (STUB_CACHE_DST/STUB_CACHE_SRC), not before the wrapper starts.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPTS = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'scripts');
const WRAPPER = join(SCRIPTS, 'pixeltamer_codex.sh');

/**
 * Byte-exact fixtures. Minimal builders — the wrapper's gate checks structure
 * (via lib/gif-inspect.mjs), not encoder quirks.
 * @param {number} [frames]
 * @param {number} [delayCs]
 * @returns {Uint8Array}
 */
function animatedGifBytes(frames = 3, delayCs = 15) {
  const b = [];
  const push = (...xs) => b.push(...xs);
  const push16 = (n) => push(n & 0xff, (n >> 8) & 0xff);
  push(...'GIF89a'.split('').map((c) => c.charCodeAt(0)));
  push16(4); push16(4); push(0x80); push(0x00, 0x00);
  push(0, 0, 0, 255, 255, 255);
  push(0x21, 0xff, 11, ...'NETSCAPE2.0'.split('').map((c) => c.charCodeAt(0)));
  push(3, 0x01, 0, 0, 0x00);
  for (let i = 0; i < frames; i += 1) {
    push(0x21, 0xf9, 4, 0x00, delayCs & 0xff, (delayCs >> 8) & 0xff, 0x00, 0x00);
    push(0x2c); push16(0); push16(0); push16(4); push16(4); push(0x00);
    push(0x02); push(2, 0x44, 0x01); push(0x00);
  }
  push(0x3b);
  return new Uint8Array(b);
}

/** A single-frame GIF: structurally valid, not animated. */
function staticGifBytes() {
  return animatedGifBytes(1);
}

/** An animated GIF cut off before the trailer byte. */
function truncatedGifBytes() {
  return animatedGifBytes(2).slice(0, -1);
}

/** PNG bytes (what a still image saved at a .gif path actually is). */
const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
]);

/**
 * The stub codex binary.
 * - `login status` answers "Logged in".
 * - `exec` reads the prompt from stdin, copies $STUB_FIXTURE onto every work
 *   path it finds (or none with STUB_WRITE_NOTHING), and prints the paths.
 * - STUB_FIRST_ONLY limits writing to the first path (partial output).
 * - STUB_CACHE_DST (colon-separated) + STUB_CACHE_SRC plant cache artifacts
 *   mid-run, so they are newer than the wrapper's start marker.
 * @param {string} dir
 * @returns {string}
 */
function writeStub(dir) {
  const p = join(dir, 'stub-codex.sh');
  writeFileSync(p, `#!/bin/bash
if [[ "$1" == "login" ]]; then echo "Logged in"; exit 0; fi
input="$(cat)"
if [[ -n "\${STUB_CACHE_DST:-}" && -n "\${STUB_CACHE_SRC:-}" ]]; then
  IFS=':' read -ra cache_dsts <<< "$STUB_CACHE_DST"
  for d in "\${cache_dsts[@]}"; do
    mkdir -p "$(dirname "$d")"
    cp "$STUB_CACHE_SRC" "$d"
  done
fi
if [[ -n "\${STUB_WRITE_NOTHING:-}" ]]; then exit 0; fi
paths="$(printf '%s' "$input" | grep -oE '/[^[:space:]]*\\.(png|gif)' | sort -u)"
i=0
while IFS= read -r p; do
  [[ -z "$p" ]] && continue
  if [[ "\${STUB_FIRST_ONLY:-}" == "1" && "$i" -ge 1 ]]; then break; fi
  cp "$STUB_FIXTURE" "$p"
  echo "$p"
  i=$(( i + 1 ))
done <<< "$paths"
exit 0
`, { mode: 0o755 });
  return p;
}

/**
 * Run the wrapper in a fully sandboxed environment.
 * @param {string} sandbox
 * @param {string} stubPath
 * @param {string[]} args
 * @param {Record<string, string>} [extraEnv]
 * @returns {{status: number, stdout: string, stderr: string}}
 */
function runWrapper(sandbox, stubPath, args, extraEnv = {}) {
  const r = spawnSync('bash', [WRAPPER, ...args], {
    encoding: 'utf8',
    env: {
      ...process.env,
      HOME: sandbox,
      CODEX_BIN: stubPath,
      ...extraEnv,
    },
  });
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

/**
 * Fresh sandbox with the stub in place and a fixture file written.
 * @param {Uint8Array} fixtureBytes
 * @param {string} [fixtureName]
 * @returns {{sandbox: string, stub: string, fixture: string}}
 */
function makeSandbox(fixtureBytes, fixtureName = 'fixture.bin') {
  const sandbox = mkdtempSync(join(tmpdir(), 'pixeltamer-codex-test-'));
  const stub = writeStub(sandbox);
  const fixture = join(sandbox, fixtureName);
  if (fixtureBytes) writeFileSync(fixture, fixtureBytes);
  return { sandbox, stub, fixture };
}

const PNG_PROMPT = 'A red cube on a white table.';

test('PNG target: stub writes a PNG, wrapper publishes it', () => {
  const { sandbox, stub, fixture } = makeSandbox(PNG_BYTES, 'art.png');
  const target = join(sandbox, 'out.png');
  const r = runWrapper(sandbox, stub, ['-p', PNG_PROMPT, '-o', target], { STUB_FIXTURE: fixture });
  assert.equal(r.status, 0, `stderr: ${r.stderr}`);
  assert.equal(r.stdout.trim(), target);
  assert.deepEqual(Array.from(readFileSync(target)), Array.from(PNG_BYTES));
});

test('GIF target: animated GIF publishes cleanly', () => {
  const bytes = animatedGifBytes();
  const { sandbox, stub, fixture } = makeSandbox(bytes, 'art.gif');
  const target = join(sandbox, 'out.gif');
  const r = runWrapper(sandbox, stub, ['-p', PNG_PROMPT, '-o', target, '--frames', '3', '--frame-ms', '150'], { STUB_FIXTURE: fixture });
  assert.equal(r.status, 0, `stderr: ${r.stderr}`);
  assert.equal(r.stdout.trim(), target);
  assert.deepEqual(Array.from(readFileSync(target)), Array.from(bytes));
});

test('GIF target: a PNG saved at the .gif path is rejected and not published', () => {
  const { sandbox, stub, fixture } = makeSandbox(PNG_BYTES, 'art.png');
  const target = join(sandbox, 'out.gif');
  const r = runWrapper(sandbox, stub, ['-p', PNG_PROMPT, '-o', target], { STUB_FIXTURE: fixture });
  assert.notEqual(r.status, 0);
  assert.equal(existsSync(target), false, 'a disguised PNG must not be published as .gif');
  assert.match(r.stderr, /not a usable animated GIF/);
});

test('GIF target: single-frame (static) GIF is rejected', () => {
  const { sandbox, stub, fixture } = makeSandbox(staticGifBytes(), 'art.gif');
  const target = join(sandbox, 'out.gif');
  const r = runWrapper(sandbox, stub, ['-p', PNG_PROMPT, '-o', target], { STUB_FIXTURE: fixture });
  assert.notEqual(r.status, 0);
  assert.equal(existsSync(target), false);
  assert.match(r.stderr, /not animated/);
});

test('GIF target: truncated GIF is rejected', () => {
  const { sandbox, stub, fixture } = makeSandbox(truncatedGifBytes(), 'art.gif');
  const target = join(sandbox, 'out.gif');
  const r = runWrapper(sandbox, stub, ['-p', PNG_PROMPT, '-o', target], { STUB_FIXTURE: fixture });
  assert.notEqual(r.status, 0);
  assert.equal(existsSync(target), false);
  assert.match(r.stderr, /not a usable animated GIF/);
});

test('GIF target: frame-count drift is a warning, not a failure', () => {
  const bytes = animatedGifBytes(5);
  const { sandbox, stub, fixture } = makeSandbox(bytes, 'art.gif');
  const target = join(sandbox, 'out.gif');
  const r = runWrapper(sandbox, stub, ['-p', PNG_PROMPT, '-o', target, '--frames', '6'], { STUB_FIXTURE: fixture });
  assert.equal(r.status, 0, `stderr: ${r.stderr}`);
  assert.match(r.stderr, /requested 6 frames, got 5/);
});

test('pre-flight: --frames with a PNG target fails before codex runs', () => {
  const { sandbox, stub, fixture } = makeSandbox(PNG_BYTES, 'art.png');
  const target = join(sandbox, 'out.png');
  const r = runWrapper(sandbox, stub, ['-p', PNG_PROMPT, '-o', target, '--frames', '6'], { STUB_FIXTURE: fixture });
  assert.notEqual(r.status, 0);
  assert.equal(existsSync(target), false);
  assert.match(r.stderr, /require a \.gif output path/);
});

test('pre-flight: --background transparent with a GIF target fails before codex runs', () => {
  const { sandbox, stub, fixture } = makeSandbox(animatedGifBytes(), 'art.gif');
  const target = join(sandbox, 'out.gif');
  const r = runWrapper(sandbox, stub, ['-p', PNG_PROMPT, '-o', target, '--background', 'transparent'], { STUB_FIXTURE: fixture });
  assert.notEqual(r.status, 0);
  assert.equal(existsSync(target), false);
  assert.match(r.stderr, /not verified for GIF output/);
});

test('pre-flight rejections report structured JSON in --json mode', () => {
  const { sandbox, stub, fixture } = makeSandbox(PNG_BYTES, 'art.png');
  const target = join(sandbox, 'out.png');
  const r = runWrapper(sandbox, stub, ['--json', '-p', PNG_PROMPT, '-o', target, '--frames', '6'], { STUB_FIXTURE: fixture });
  assert.notEqual(r.status, 0);
  const parsed = JSON.parse(r.stdout);
  assert.equal(parsed.ok, false);
  assert.equal(parsed.backend, 'codex');
  assert.match(parsed.error.message, /require a \.gif output path/);
});

test('cache recovery: fills a missing PNG from a cache artifact planted mid-run', () => {
  const { sandbox, stub, fixture } = makeSandbox(PNG_BYTES, 'cache-art.png');
  const target = join(sandbox, 'out.png');
  // Cache layout matches codex-cli 0.161: UUID dir, exec-<uuid>.<ext> inside.
  // The stub plants it DURING the run so it passes the -newer start-marker filter.
  const cacheFile = join(sandbox, '.codex', 'generated_images', '01adead-beef-0000-0000-000000000000', 'exec-11111111-1111-1111-1111-111111111111.png');
  const r = runWrapper(sandbox, stub, ['-p', PNG_PROMPT, '-o', target],
    { STUB_WRITE_NOTHING: '1', STUB_CACHE_DST: cacheFile, STUB_CACHE_SRC: fixture, PIXELTAMER_CODEX_RECOVER: '1' });
  assert.equal(r.status, 0, `stderr: ${r.stderr}`);
  assert.deepEqual(Array.from(readFileSync(target)), Array.from(PNG_BYTES));
});

test('cache recovery is opt-in: without PIXELTAMER_CODEX_RECOVER it never fires', () => {
  const { sandbox, stub, fixture } = makeSandbox(PNG_BYTES, 'cache-art.png');
  const target = join(sandbox, 'out.png');
  const cacheFile = join(sandbox, '.codex', 'generated_images', '01adead-beef-0000-0000-000000000003', 'exec-44444444-4444-4444-4444-444444444444.png');
  const r = runWrapper(sandbox, stub, ['-p', PNG_PROMPT, '-o', target],
    { STUB_WRITE_NOTHING: '1', STUB_CACHE_DST: cacheFile, STUB_CACHE_SRC: fixture });
  assert.notEqual(r.status, 0);
  assert.equal(existsSync(target), false);
  assert.match(r.stderr, /expected image file/);
});

test('cache recovery: a PNG cache artifact never lands in a .gif slot', () => {
  const { sandbox, stub } = makeSandbox(null, 'unused');
  const target = join(sandbox, 'out.gif');
  const cacheFile = join(sandbox, '.codex', 'generated_images', '01adead-beef-0000-0000-000000000001', 'exec-22222222-2222-2222-2222-222222222222.png');
  const pngFixture = join(sandbox, 'cache-art.png');
  writeFileSync(pngFixture, PNG_BYTES);
  const r = runWrapper(sandbox, stub, ['-p', PNG_PROMPT, '-o', target],
    { STUB_WRITE_NOTHING: '1', STUB_CACHE_DST: cacheFile, STUB_CACHE_SRC: pngFixture, PIXELTAMER_CODEX_RECOVER: '1' });
  assert.notEqual(r.status, 0);
  assert.equal(existsSync(target), false);
});

test('cache recovery: never clobbers a work file codex already wrote', () => {
  const bytes = animatedGifBytes(2);
  const otherBytes = animatedGifBytes(9);
  const { sandbox, stub, fixture } = makeSandbox(bytes, 'art.gif');
  // -n 2 suffixes -01/-02 onto the given stem, so -o out.gif publishes
  // out-01.gif and out-02.gif.
  const target1 = join(sandbox, 'out-01.gif');
  const target2 = join(sandbox, 'out-02.gif');
  // Cache holds a DIFFERENT artifact; if recovery overwrote slot 1 the bytes
  // would change. Slot 2 (missing) is filled from it.
  const cacheFile = join(sandbox, '.codex', 'generated_images', '01adead-beef-0000-0000-000000000002', 'exec-33333333-3333-3333-3333-333333333333.gif');
  const cacheSrc = join(sandbox, 'cache-art.gif');
  writeFileSync(cacheSrc, otherBytes);
  const r = runWrapper(sandbox, stub, ['-p', PNG_PROMPT, '-o', join(sandbox, 'out.gif'), '-n', '2'],
    { STUB_FIXTURE: fixture, STUB_FIRST_ONLY: '1', STUB_CACHE_DST: cacheFile, STUB_CACHE_SRC: cacheSrc, PIXELTAMER_CODEX_RECOVER: '1' });
  assert.equal(r.status, 0, `stderr: ${r.stderr}`);
  assert.deepEqual(Array.from(readFileSync(target1)), Array.from(bytes), 'slot 1 must keep the codex-written artifact');
  assert.deepEqual(Array.from(readFileSync(target2)), Array.from(otherBytes), 'slot 2 must be filled from the cache');
});
