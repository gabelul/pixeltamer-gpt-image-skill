import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePromptsFile } from '../scripts/lib/parse-prompts.mjs';

const SAMPLE = `# GPT image prompts

Generated 2026-04-27 — generate each image in ChatGPT (GPT Image 2),
save to the listed path, then say "continue" to verify.

## 1. assets/icons/search.png
- **Format:** PNG (transparent background)
- **Native size:** 1024×1024
- **Reference to attach:** assets/icons/home.png
- **Status:** pending
- **Prompt:**
  > A minimal search icon: magnifying glass with handle at lower-right,
  > 2px uniform stroke weight, monochrome teal on transparent background.

## 2. assets/hero.jpg
- **Format:** JPG
- **Native size:** 1792×1024
- **Status:** verified
- **Prompt:**
  > Wide hero illustration of an open notebook on a wooden desk,
  > soft morning light from the left, muted earth tones.

## 3. assets/icons/menu.png
- **Format:** PNG (transparent background)
- **Native size:** 1024×1024
- **Reference to attach:** assets/icons/home.png
- **Status:** failed: dimensions 1024×768 expected 1024×1024
- **Prompt:**
  > A minimal hamburger menu icon, 2px stroke, monochrome teal.
`;

test('parses three entries with all fields', () => {
  const entries = parsePromptsFile(SAMPLE);
  assert.equal(entries.length, 3);
});

test('first entry has all fields populated correctly', () => {
  const [e1] = parsePromptsFile(SAMPLE);
  assert.equal(e1.index, 1);
  assert.equal(e1.path, 'assets/icons/search.png');
  assert.equal(e1.format, 'PNG (transparent background)');
  assert.equal(e1.nativeSize, '1024×1024');
  assert.equal(e1.reference, 'assets/icons/home.png');
  assert.equal(e1.status, 'pending');
  assert.match(e1.prompt, /minimal search icon/);
  assert.match(e1.prompt, /monochrome teal on transparent background\.$/);
});

test('second entry has no reference (field absent)', () => {
  const [, e2] = parsePromptsFile(SAMPLE);
  assert.equal(e2.reference, null);
  assert.equal(e2.format, 'JPG');
  assert.equal(e2.status, 'verified');
});

test('failed status preserves the reason', () => {
  const [, , e3] = parsePromptsFile(SAMPLE);
  assert.equal(e3.status, 'failed: dimensions 1024×768 expected 1024×1024');
});

test('prompt joins multi-line block quote with newlines preserved', () => {
  const [e1] = parsePromptsFile(SAMPLE);
  const lines = e1.prompt.split('\n');
  assert.equal(lines.length, 2);
  assert.match(lines[0], /minimal search icon/);
  assert.match(lines[1], /2px uniform stroke/);
});

test('returns empty array when no entries', () => {
  const entries = parsePromptsFile('# GPT image prompts\n\nNothing here.\n');
  assert.deepEqual(entries, []);
});

test('throws on invalid heading format', () => {
  const bad = '## not-a-numbered-heading\n- **Format:** PNG\n';
  assert.throws(() => parsePromptsFile(bad), /heading/i);
});

test('parses CRLF-terminated content the same as LF-terminated', () => {
  const crlf = SAMPLE.replace(/\n/g, '\r\n');
  const lfEntries = parsePromptsFile(SAMPLE);
  const crlfEntries = parsePromptsFile(crlf);
  assert.deepEqual(crlfEntries, lfEntries);
});
