#!/usr/bin/env node
/**
 * run-trigger-eval.mjs — does pixeltamer actually fire, and does it read its own doctrine?
 *
 * The uncomfortable question this exists to answer: we ship ~1700 lines of
 * prompting doctrine across references/ and recipes/, and none of it matters if
 * (a) the skill never triggers, or (b) it triggers and the agent writes a prompt
 * from memory without loading the recipe. Both are measurable. Neither was
 * measured before this file.
 *
 * How it works: drives `claude -p` per query, parses the stream-json event log
 * for tool calls, and scores two things independently —
 *
 *   TRIGGER — a `Skill` tool call naming pixeltamer
 *   ROUTING — a `Read` of a references/ or recipes/ file afterwards
 *
 * A case can pass trigger and fail routing. That combination is the interesting
 * one: the skill loaded and the agent ignored the doctrine inside it.
 *
 * Costs real money — roughly $0.30-0.60 per query at time of writing, so a full
 * 20-query sweep runs about $8-12. It prints a running total and honours
 * --max-cost so you can't sleepwalk into a big bill.
 *
 * Usage:
 *   node evals/run-trigger-eval.mjs                     # full suite
 *   node evals/run-trigger-eval.mjs --limit 4           # first 4 cases (smoke test)
 *   node evals/run-trigger-eval.mjs --only-trigger      # skip the should-not cases
 *   node evals/run-trigger-eval.mjs --max-cost 3        # abort past $3
 *   node evals/run-trigger-eval.mjs --turns 4           # give the agent more rope
 */

import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SUITE = resolve(here, 'trigger-eval.json');

/** Paths that count as "the agent consulted our doctrine". */
const DOCTRINE = /\/(references|recipes|playbook)\/[^/]+\.md$/;

/**
 * Parse CLI flags into a plain options object.
 * @param {string[]} argv - raw process args (after node + script)
 * @returns {{limit:number, onlyTrigger:boolean, maxCost:number, turns:number}}
 */
function parseArgs(argv) {
  const get = (name, fallback) => {
    const i = argv.indexOf(name);
    return i === -1 ? fallback : Number(argv[i + 1]);
  };
  return {
    limit: get('--limit', Infinity),
    onlyTrigger: argv.includes('--only-trigger'),
    maxCost: get('--max-cost', Infinity),
    turns: get('--turns', 3),
    // plan mode keeps the eval from spending real generation calls, but it
    // biases the agent toward exploring instead of acting — which suppresses
    // exactly the Skill call we're measuring. Treat plan-mode numbers as a
    // lower bound and re-run with --permission-mode default to confirm a miss.
    permissionMode: argv.includes('--permission-mode')
      ? String(argv[argv.indexOf('--permission-mode') + 1])
      : 'plan',
  };
}

/**
 * Run one query through `claude -p` and extract what tools it reached for.
 *
 * We deliberately use --permission-mode plan so the agent reasons and reads but
 * can't actually spend a generation call on top of the eval cost.
 *
 * @param {string} query - the user-style prompt to test
 * @param {number} turns - max agent turns before we cut it off
 * @returns {Promise<{tools:Array<{name:string,input:object}>, cost:number, error:string|null}>}
 */
function runQuery(query, turns, permissionMode) {
  return new Promise((done) => {
    const proc = spawn('claude', [
      '-p', query,
      '--output-format', 'stream-json',
      '--verbose',
      '--max-turns', String(turns),
      '--permission-mode', permissionMode,
    ], { cwd: '/tmp' });

    const tools = [];
    let cost = 0;
    let error = null;
    let buf = '';

    proc.stdout.on('data', (chunk) => {
      buf += chunk;
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        let ev;
        try { ev = JSON.parse(line); } catch { continue; }
        if (ev.type === 'assistant') {
          for (const c of ev.message?.content ?? []) {
            if (c.type === 'tool_use') tools.push({ name: c.name, input: c.input ?? {} });
          }
        }
        if (ev.type === 'result') cost = ev.total_cost_usd ?? 0;
      }
    });

    proc.on('error', (e) => { error = e.message; });
    proc.on('close', () => done({ tools, cost, error }));
  });
}

/**
 * Score one run against the two things we care about.
 * @param {Array<{name:string,input:object}>} tools - tool calls the agent made
 * @returns {{triggered:boolean, readDoctrine:string|null}}
 */
function score(tools) {
  const triggered = tools.some(
    (t) => t.name === 'Skill' && JSON.stringify(t.input).includes('pixeltamer'),
  );
  const read = tools.find(
    (t) => t.name === 'Read' && DOCTRINE.test(String(t.input.file_path ?? '')),
  );
  return { triggered, readDoctrine: read ? String(read.input.file_path) : null };
}

const opts = parseArgs(process.argv.slice(2));
const suite = JSON.parse(readFileSync(SUITE, 'utf8'));
let cases = suite.cases;
if (opts.onlyTrigger) cases = cases.filter((c) => c.should_trigger);
cases = cases.slice(0, opts.limit);

console.log(`pixeltamer trigger eval — ${cases.length} case(s), max ${opts.turns} turns, ${opts.permissionMode} mode`);
if (opts.permissionMode === 'plan') {
  console.log('NOTE: plan mode biases toward exploration over action, which suppresses Skill calls.');
  console.log('      Misses here are a lower bound — confirm with --permission-mode default.');
}
console.log('Costs real money. Ctrl-C is right there.\n');

const results = [];
let spent = 0;

for (const [i, c] of cases.entries()) {
  if (spent >= opts.maxCost) {
    console.log(`\nStopping: spent $${spent.toFixed(2)}, ceiling was $${opts.maxCost}.`);
    break;
  }
  process.stdout.write(`[${i + 1}/${cases.length}] ${c.query.slice(0, 62)}… `);
  const { tools, cost, error } = await runQuery(c.query, opts.turns, opts.permissionMode);
  spent += cost;

  const { triggered, readDoctrine } = score(tools);
  const triggerOk = triggered === c.should_trigger;
  // Routing is only meaningful when the skill was supposed to fire AND did.
  const routingOk = !c.should_trigger || !triggered ? null
    : (c.expect_routing ? readDoctrine !== null : true);

  // Keep a truncated trace, not just names. "Bash, Bash, Bash" tells you the
  // skill didn't fire; it doesn't tell you what the agent did instead — which is
  // the whole diagnosis when a trigger misses.
  const trace = tools.map((t) => ({
    tool: t.name,
    arg: String(t.input.command ?? t.input.file_path ?? t.input.skill ?? JSON.stringify(t.input)).slice(0, 120),
  }));
  results.push({ ...c, triggered, triggerOk, readDoctrine, routingOk, cost, error, trace });

  const mark = triggerOk ? 'PASS' : 'FAIL';
  const routeNote = routingOk === null ? ''
    : routingOk ? ` +doctrine(${readDoctrine?.split('/').slice(-2).join('/')})`
    : ' -NO-DOCTRINE';
  console.log(`${mark}${routeNote}  ($${cost.toFixed(2)})`);
  if (error) console.log(`    error: ${error}`);
}

const triggerPass = results.filter((r) => r.triggerOk).length;
const fired = results.filter((r) => r.should_trigger && r.triggered);
const routedWell = fired.filter((r) => r.routingOk).length;

console.log('\n--- summary ---');
console.log(`Trigger accuracy : ${triggerPass}/${results.length}`);
console.log(`Doctrine loaded  : ${routedWell}/${fired.length} of the runs where the skill fired`);
console.log(`Spent            : $${spent.toFixed(2)}`);

const misses = results.filter((r) => !r.triggerOk);
if (misses.length) {
  console.log('\nTrigger misses (these are description problems):');
  for (const m of misses) {
    console.log(`  ${m.should_trigger ? 'missed' : 'false-fired'}: ${m.query.slice(0, 70)}`);
  }
}
const skipped = fired.filter((r) => r.routingOk === false);
if (skipped.length) {
  console.log('\nFired but skipped the doctrine (these are SKILL.md Step 0 problems):');
  for (const s of skipped) {
    console.log(`  expected ${s.expect_routing}: ${s.query.slice(0, 60)}`);
  }
}

mkdirSync(resolve(here, 'results'), { recursive: true });
const out = resolve(here, 'results', `trigger-${Date.now()}.json`);
writeFileSync(out, JSON.stringify({ results, spent }, null, 2));
console.log(`\nFull results: ${out}`);
