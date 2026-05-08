/**
 * tests/index-staleness.test.mjs
 *
 * Asserts that references/index.md is in sync with the actual filesystem:
 *  - every .md file under recipes/, playbook/, references/ appears in the index by relative path
 *  - every relative path mentioned in the index resolves to a real file
 *
 * This test catches drift the moment a new recipe / playbook / reference lands
 * without the contributor adding an index entry. Run as part of `npm test`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const INDEX_PATH = join(REPO_ROOT, 'references', 'index.md');
const TRACKED_DIRS = ['recipes', 'playbook', 'references'];

function listMarkdownFiles(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      out.push(...listMarkdownFiles(full));
    } else if (entry.endsWith('.md')) {
      out.push(full);
    }
  }
  return out;
}

test('every tracked .md file appears in references/index.md', () => {
  assert.ok(existsSync(INDEX_PATH), `references/index.md must exist at ${INDEX_PATH}`);
  const indexContent = readFileSync(INDEX_PATH, 'utf8');

  const missing = [];
  for (const dirName of TRACKED_DIRS) {
    const dir = join(REPO_ROOT, dirName);
    const files = listMarkdownFiles(dir);
    for (const file of files) {
      const rel = relative(REPO_ROOT, file);
      // The index itself doesn't need to reference itself
      if (rel === 'references/index.md') continue;
      if (!indexContent.includes(rel)) {
        missing.push(rel);
      }
    }
  }

  assert.deepEqual(
    missing,
    [],
    `These files are not referenced in references/index.md:\n  - ${missing.join('\n  - ')}\n\nAdd a row to the routing map for each missing file.`
  );
});

test('every path referenced in index.md resolves to a real file', () => {
  const indexContent = readFileSync(INDEX_PATH, 'utf8');

  // Match relative paths in backticks like `recipes/mascot.md` or `playbook/character-sheets.md`
  // Only check paths in tracked dirs (not external URLs, not /tmp paths, not abstract examples)
  const trackedPattern = new RegExp(
    `\\\`(${TRACKED_DIRS.join('|')})/[a-zA-Z0-9_\\-/]+\\.md\\\``,
    'g'
  );
  const matches = [...indexContent.matchAll(trackedPattern)];
  const referenced = new Set(matches.map((m) => m[0].replace(/`/g, '')));

  const broken = [];
  for (const rel of referenced) {
    const full = join(REPO_ROOT, rel);
    if (!existsSync(full)) {
      broken.push(rel);
    }
  }

  assert.deepEqual(
    broken,
    [],
    `These paths in references/index.md don't resolve to real files:\n  - ${broken.join('\n  - ')}`
  );
});
