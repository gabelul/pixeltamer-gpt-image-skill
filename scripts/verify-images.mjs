#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { imageSize } from 'image-size';
import { parsePromptsFile } from './lib/parse-prompts.mjs';
import { verifyEntry } from './lib/verify-entry.mjs';
import { writeStatusUpdates } from './lib/write-status.mjs';

const NEEDS_VERIFICATION = (status) => status === 'pending' || status?.startsWith('failed');

function main() {
  const promptsPath = process.argv[2];
  if (!promptsPath) {
    console.error('Usage: node scripts/verify-images.mjs <path-to-prompts.md>');
    process.exit(2);
  }

  if (!existsSync(promptsPath)) {
    console.error(`prompts file not found: ${promptsPath}`);
    process.exit(2);
  }

  const content = readFileSync(promptsPath, 'utf8');
  let entries;
  try {
    entries = parsePromptsFile(content);
  } catch (err) {
    console.error(`Failed to parse ${promptsPath}: ${err.message}`);
    process.exit(2);
  }

  // Project root = parent of the directory containing prompts.md.
  // Convention: prompts.md lives at <projectRoot>/.pixeltamer/prompts.md
  const projectRoot = resolve(dirname(promptsPath), '..');

  const fs = {
    existsSync,
    statSync,
  };
  const getDimensions = (path) => {
    try {
      const result = imageSize(path);
      return result ? { width: result.width, height: result.height } : null;
    } catch {
      return null;
    }
  };

  const updates = new Map();
  let toVerify = 0;
  let passed = 0;
  let failed = 0;
  let skipped = 0;

  for (const entry of entries) {
    if (!NEEDS_VERIFICATION(entry.status)) {
      skipped++;
      continue;
    }
    toVerify++;
    const result = verifyEntry(entry, projectRoot, { fs, getDimensions });
    if (result.ok) {
      updates.set(entry.index, 'verified');
      passed++;
      console.log(`  [PASS] ${entry.index}. ${entry.path}`);
    } else {
      updates.set(entry.index, `failed: ${result.reason}`);
      failed++;
      console.log(`  [FAIL] ${entry.index}. ${entry.path} — ${result.reason}`);
    }
  }

  if (updates.size > 0) {
    const updated = writeStatusUpdates(content, updates);
    writeFileSync(promptsPath, updated, 'utf8');
  }

  console.log('');
  console.log(`Verified: ${passed}/${toVerify} passed, ${failed} failed, ${skipped} already verified.`);

  process.exit(failed === 0 ? 0 : 1);
}

main();
