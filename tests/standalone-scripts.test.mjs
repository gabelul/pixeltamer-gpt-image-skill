/**
 * tests/standalone-scripts.test.mjs
 *
 * `scripts/pixeltamer_codex.sh` runs two ways: through the dispatcher, and
 * directly. Only one of those provides the dispatcher's helpers and variables,
 * and `set -u` turns a borrowed name into a hard failure — after the image has
 * been generated and paid for, while publishing it.
 *
 * That happened three times in one day: `_have`, then `script_dir`, then
 * `script_dir` again in a second place. Each time it survived review because
 * `bash -n` only checks syntax, and each time the manual test harness defined
 * the missing name itself, so the test was more capable than the script.
 *
 * This walks the shell scripts and asserts every variable they read and every
 * project function they call is defined in the same file.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPTS = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'scripts');

// Set by the shell, the environment, or bash itself — never by us.
const AMBIENT = new Set([
  'HOME', 'PATH', 'PWD', 'TMPDIR', 'SHELL', 'USER', 'LANG', 'TERM',
  'BASH_SOURCE', 'BASH_VERSION', 'FUNCNAME', 'PIPESTATUS', 'RANDOM',
  'OPENAI_API_KEY', 'OPENAI_IMAGE_API_KEY', 'OPENAI_BASE_URL',
  'OPENAI_IMAGE_BASE_URL', 'OPENAI_IMAGE_MODEL', 'XDG_CONFIG_HOME',
  'XDG_CACHE_HOME', 'CODEX_HOME', 'CODEX_BIN', 'PIXELTAMER_BACKEND',
  'PIXELTAMER_BACKEND_PREF', 'PIXELTAMER_CODEX_TIMEOUT',
  'PIXELTAMER_CODEX_KILL_GRACE', 'BACKEND_OVERRIDE', 'IFS', 'REPLY',
]);

/**
 * Variable names a script reads via $name or ${name...}.
 * @param {string} src - shell source
 * @returns {Set<string>}
 */
function readsVariables(src) {
  const found = new Set();
  // Comments are documentation, not code — and this file's comments quote shell
  // idioms like `${arr[@]+"${arr[@]}"}` to explain them. Scanning those would
  // report variables that are only ever discussed, never read.
  const code = src
    .split('\n')
    .filter((line) => !/^[ \t]*#/.test(line))
    .join('\n');
  // $name and ${name}, ${name%...}, ${name:-default} etc.
  for (const m of code.matchAll(/\$\{?([A-Za-z_][A-Za-z0-9_]*)/g)) {
    found.add(m[1]);
  }
  return found;
}

/**
 * Variable names a script assigns: plain, `local`, `export`, and loop vars.
 * @param {string} src - shell source
 * @returns {Set<string>}
 */
function assignsVariables(src) {
  const found = new Set();
  for (const m of src.matchAll(/^[ \t]*(?:export[ \t]+|declare[ \t]+-\w+[ \t]+)?([A-Za-z_][A-Za-z0-9_]*)=/gm)) {
    found.add(m[1]);
  }
  // `local a="$1" b="$2" c=""` declares three names on one line, and `readonly
  // X=1` is an assignment too. Scan the whole declaration rather than the first
  // token, or the checker invents failures and stops being believed.
  for (const m of src.matchAll(/^[ \t]*(?:local|declare|readonly|typeset)[ \t]+(.*)$/gm)) {
    for (const tok of m[1].matchAll(/(?:^|[ \t])(-\w+[ \t]+)?([A-Za-z_][A-Za-z0-9_]*)/g)) {
      if (tok[2]) found.add(tok[2]);
    }
  }
  for (const m of src.matchAll(/\bfor[ \t]+([A-Za-z_][A-Za-z0-9_]*)[ \t]+in\b/g)) found.add(m[1]);
  for (const m of src.matchAll(/\bread[ \t]+(?:-\w+[ \t]+)*([A-Za-z_][A-Za-z0-9_]*)/g)) found.add(m[1]);
  // Positional and special params are always available.
  for (const p of ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '@', '*', '#', '?', '$', '!', '_']) found.add(p);
  return found;
}

/** Project functions the script defines. */
function definesFunctions(src) {
  const found = new Set();
  for (const m of src.matchAll(/^[ \t]*([A-Za-z_][A-Za-z0-9_]*)[ \t]*\(\)/gm)) found.add(m[1]);
  return found;
}

/** Project functions the script calls — `_foo` or `cmd_foo` at command position. */
function callsProjectFunctions(src) {
  const found = new Set();
  for (const m of src.matchAll(/(?:^|[;&|(]|\bthen\b|\belse\b|\bdo\b|&&|\|\|)[ \t]*(_[A-Za-z0-9_]+|cmd_[A-Za-z0-9_]+)\b/gm)) {
    found.add(m[1]);
  }
  return found;
}

const shellScripts = readdirSync(SCRIPTS).filter((f) => f.endsWith('.sh'));

for (const file of shellScripts) {
  const src = readFileSync(join(SCRIPTS, file), 'utf8');

  test(`${file} defines every variable it reads`, () => {
    const assigned = assignsVariables(src);
    const missing = [...readsVariables(src)]
      .filter((n) => !assigned.has(n) && !AMBIENT.has(n));
    assert.deepEqual(
      missing, [],
      `${file} reads variables it never assigns: ${missing.join(', ')}. ` +
      `Under \`set -u\` these are runtime failures, and this script also runs ` +
      `standalone — it cannot borrow them from the dispatcher.`,
    );
  });

  test(`${file} defines every project function it calls`, () => {
    const defined = definesFunctions(src);
    const missing = [...callsProjectFunctions(src)].filter((n) => !defined.has(n));
    assert.deepEqual(
      missing, [],
      `${file} calls project functions it never defines: ${missing.join(', ')}. ` +
      `A missing function is "command not found" at runtime, and any \`|| return\` ` +
      `around it silently swallows the failure.`,
    );
  });
}
