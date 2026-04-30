import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeStatusUpdates } from '../scripts/lib/write-status.mjs';

const SAMPLE = `# GPT image prompts

## 1. assets/icons/search.png
- **Format:** PNG (transparent background)
- **Native size:** 1024×1024
- **Status:** pending
- **Prompt:**
  > Search icon prompt.

## 2. assets/hero.jpg
- **Format:** JPG
- **Native size:** 1792×1024
- **Status:** pending
- **Prompt:**
  > Hero prompt.
`;

test('updates a single entry status', () => {
  const updates = new Map([[1, 'verified']]);
  const result = writeStatusUpdates(SAMPLE, updates);
  assert.match(result, /## 1\. assets\/icons\/search\.png[\s\S]*\*\*Status:\*\* verified/);
  assert.match(result, /## 2\. assets\/hero\.jpg[\s\S]*\*\*Status:\*\* pending/);
});

test('updates multiple entries independently', () => {
  const updates = new Map([
    [1, 'verified'],
    [2, 'failed: file not found'],
  ]);
  const result = writeStatusUpdates(SAMPLE, updates);
  assert.match(result, /## 1\.[\s\S]*\*\*Status:\*\* verified/);
  assert.match(result, /## 2\.[\s\S]*\*\*Status:\*\* failed: file not found/);
});

test('preserves prompt content unchanged', () => {
  const updates = new Map([[1, 'verified']]);
  const result = writeStatusUpdates(SAMPLE, updates);
  assert.match(result, /> Search icon prompt\./);
  assert.match(result, /> Hero prompt\./);
});

test('preserves heading and surrounding structure', () => {
  const updates = new Map([[1, 'verified']]);
  const result = writeStatusUpdates(SAMPLE, updates);
  assert.match(result, /^# GPT image prompts/);
});

test('no-op when index not present', () => {
  const updates = new Map([[99, 'verified']]);
  const result = writeStatusUpdates(SAMPLE, updates);
  assert.equal(result, SAMPLE);
});

test('overwrites a previous failed status', () => {
  const withFailed = SAMPLE.replace('**Status:** pending', '**Status:** failed: file not found');
  const updates = new Map([[1, 'verified']]);
  const result = writeStatusUpdates(withFailed, updates);
  assert.match(result, /## 1\.[\s\S]*\*\*Status:\*\* verified/);
  assert.doesNotMatch(result, /failed: file not found/);
});

test('handles CRLF input without producing mixed line endings', () => {
  const crlfSample = SAMPLE.replace(/\n/g, '\r\n');
  const result = writeStatusUpdates(crlfSample, new Map([[1, 'verified']]));
  // No bare CR characters should remain — all line endings should be LF after normalization
  assert.equal(result.includes('\r'), false, 'output must not contain any \\r characters');
  assert.match(result, /\*\*Status:\*\* verified/);
});
