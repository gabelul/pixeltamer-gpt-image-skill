import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { copyFileSync, cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const API_SCRIPT = join(ROOT, 'scripts', 'pixeltamer_api.py');
const CODEX_SCRIPT = join(ROOT, 'scripts', 'pixeltamer_codex.sh');
const OAUTH_SCRIPT = join(ROOT, 'scripts', 'pixeltamer_codex_oauth.py');

// Valid 1x1 PNG. Request tests care about payload wiring, not rendered content.
const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nAAAAABJRU5ErkJggg==';

/**
 * Run pixeltamer's API client against an isolated environment.
 * @param {string[]} args - CLI arguments after the Python script path.
 * @param {NodeJS.ProcessEnv} env - Environment overrides for this invocation.
 * @param {string} cwd - Working directory, kept free of project .env files.
 * @returns {Promise<{code: number|null, stdout: string, stderr: string}>} Process result.
 */
function runApi(args, env, cwd) {
  const isolatedScripts = join(cwd, 'runtime', 'scripts');
  mkdirSync(isolatedScripts, { recursive: true });
  const isolatedApi = join(isolatedScripts, 'pixeltamer_api.py');
  copyFileSync(API_SCRIPT, isolatedApi);
  cpSync(join(ROOT, 'scripts', 'lib'), join(isolatedScripts, 'lib'), { recursive: true });

  return new Promise((resolveRun, reject) => {
    const child = spawn('python3', [isolatedApi, ...args], {
      cwd,
      env: {
        PATH: process.env.PATH,
        HOME: cwd,
        LANG: 'C',
        ...env,
      },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => resolveRun({ code, stdout, stderr }));
  });
}

/**
 * Capture one API request and return a valid image response.
 * @param {(baseUrl: string) => Promise<void>} invoke - Test action using server base URL.
 * @returns {Promise<{contentType: string, body: Buffer}>} Captured request.
 */
async function captureRequest(invoke) {
  let captured;
  const server = createServer((req, res) => {
    const chunks = [];
    req.on('data', (chunk) => { chunks.push(chunk); });
    req.on('end', () => {
      captured = {
        contentType: String(req.headers['content-type'] || ''),
        body: Buffer.concat(chunks),
      };
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ data: [{ b64_json: PNG_BASE64 }] }));
    });
  });

  await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
  const address = server.address();
  assert.ok(address && typeof address === 'object');

  try {
    await invoke(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolveClose, reject) => {
      server.close((error) => error ? reject(error) : resolveClose());
    });
  }

  assert.ok(captured, 'expected one API request');
  return captured;
}

/**
 * Capture one JSON generation request.
 * @param {(baseUrl: string) => Promise<void>} invoke - Test action using server base URL.
 * @returns {Promise<object>} Parsed request payload.
 */
async function captureGeneration(invoke) {
  const request = await captureRequest(invoke);
  assert.match(request.contentType, /^application\/json/);
  return JSON.parse(request.body.toString('utf8'));
}

/**
 * Extract a UTF-8 multipart field from a captured request body.
 * @param {Buffer} body - Raw multipart request body.
 * @param {string} name - Form field name.
 * @returns {string|null} Field value, or null when absent.
 */
function multipartField(body, name) {
  const text = body.toString('latin1');
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = text.match(new RegExp(`name="${escaped}"\\r\\n\\r\\n([^\\r]*)\\r\\n`));
  return match?.[1] ?? null;
}

/**
 * Create an isolated directory and remove it after the test action.
 * @param {(dir: string) => Promise<void>} action - Test body.
 * @returns {Promise<void>}
 */
async function withTempDir(action) {
  const dir = mkdtempSync(join(tmpdir(), 'pixeltamer-model-test-'));
  try {
    await action(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('API generation defaults to GPT Image 2.5 Flare', async () => {
  await withTempDir(async (dir) => {
    const payload = await captureGeneration(async (baseUrl) => {
      const result = await runApi([
        'generate', '-p', 'test image', '-o', join(dir, 'out.png'),
      ], {
        OPENAI_IMAGE_API_KEY: 'test-key',
        OPENAI_IMAGE_BASE_URL: baseUrl,
      }, dir);
      assert.equal(result.code, 0, result.stderr);
    });
    assert.equal(payload.model, 'gpt-image-2.5-flare');
  });
});

test('OPENAI_IMAGE_MODEL overrides API default', async () => {
  await withTempDir(async (dir) => {
    const payload = await captureGeneration(async (baseUrl) => {
      const result = await runApi([
        'generate', '-p', 'test image', '-o', join(dir, 'out.png'),
      ], {
        OPENAI_IMAGE_API_KEY: 'test-key',
        OPENAI_IMAGE_BASE_URL: baseUrl,
        OPENAI_IMAGE_MODEL: 'gpt-image-2.5-sunburst',
      }, dir);
      assert.equal(result.code, 0, result.stderr);
    });
    assert.equal(payload.model, 'gpt-image-2.5-sunburst');
  });
});

for (const quality of ['xhigh', 'max']) {
  test(`--model wins over env and ${quality} reaches GPT Image 2.5 request`, async () => {
    await withTempDir(async (dir) => {
      const payload = await captureGeneration(async (baseUrl) => {
        const result = await runApi([
          'generate', '--model', 'gpt-image-2.5-flare', '--quality', quality,
          '-p', 'test image', '-o', join(dir, 'out.png'),
        ], {
          OPENAI_IMAGE_API_KEY: 'test-key',
          OPENAI_IMAGE_BASE_URL: baseUrl,
          OPENAI_IMAGE_MODEL: 'gpt-image-2.5-sunburst',
        }, dir);
        assert.equal(result.code, 0, result.stderr);
      });
      assert.equal(payload.model, 'gpt-image-2.5-flare');
      assert.equal(payload.quality, quality);
    });
  });
}

for (const command of ['edit', 'compose']) {
  test(`${command} defaults to GPT Image 2.5 Flare`, async () => {
    await withTempDir(async (dir) => {
      const first = join(dir, 'first.png');
      const second = join(dir, 'second.png');
      writeFileSync(first, Buffer.from(PNG_BASE64, 'base64'));
      writeFileSync(second, Buffer.from(PNG_BASE64, 'base64'));

      const request = await captureRequest(async (baseUrl) => {
        const args = command === 'edit'
          ? [command, '-i', first, '-p', 'change only color', '-o', join(dir, 'out.png')]
          : [command, '-i', first, '-i', second, '-p', 'combine references', '-o', join(dir, 'out.png')];
        const result = await runApi(args, {
          OPENAI_IMAGE_API_KEY: 'test-key',
          OPENAI_IMAGE_BASE_URL: baseUrl,
        }, dir);
        assert.equal(result.code, 0, result.stderr);
      });

      assert.match(request.contentType, /^multipart\/form-data/);
      assert.equal(multipartField(request.body, 'model'), 'gpt-image-2.5-flare');
    });
  });
}

test('GPT Image 2.5 accepts exact minimum pixel boundary', async () => {
  await withTempDir(async (dir) => {
    const payload = await captureGeneration(async (baseUrl) => {
      const result = await runApi([
        'generate', '--size', '1024x640', '-p', 'test image', '-o', join(dir, 'out.png'),
      ], {
        OPENAI_IMAGE_API_KEY: 'test-key',
        OPENAI_IMAGE_BASE_URL: baseUrl,
      }, dir);
      assert.equal(result.code, 0, result.stderr);
    });
    assert.equal(payload.size, '1024x640');
  });
});

test('GPT Image 2.5 minimum pixel count fails before network access', async () => {
  await withTempDir(async (dir) => {
    const result = await runApi([
      'generate', '--size', '512x512', '-p', 'test image', '-o', join(dir, 'out.png'),
    ], {
      OPENAI_IMAGE_API_KEY: 'test-key',
      OPENAI_IMAGE_BASE_URL: 'http://127.0.0.1:1',
    }, dir);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /total pixels must be ≥ 655,360/);
    assert.doesNotMatch(result.stderr, /network error/);
  });
});

test('custom provider model keeps pre-2.5 small-size behavior', async () => {
  await withTempDir(async (dir) => {
    const payload = await captureGeneration(async (baseUrl) => {
      const result = await runApi([
        'generate', '--model', 'provider/image-preview', '--size', '512x512',
        '-p', 'test image', '-o', join(dir, 'out.png'),
      ], {
        OPENAI_IMAGE_API_KEY: 'test-key',
        OPENAI_IMAGE_BASE_URL: baseUrl,
      }, dir);
      assert.equal(result.code, 0, result.stderr);
    });
    assert.equal(payload.model, 'provider/image-preview');
    assert.equal(payload.size, '512x512');
  });
});

test('Codex transports do not claim or pin an image model', () => {
  const shellSource = readFileSync(CODEX_SCRIPT, 'utf8');
  const oauthSource = readFileSync(OAUTH_SCRIPT, 'utf8');

  assert.doesNotMatch(shellSource, /image_generation tool \(gpt-image-/);
  assert.match(shellSource, /Use your image_generation tool to create/);
  assert.match(oauthSource, /tool_spec: dict = \{"type": "image_generation", "output_format": OUTPUT_FORMAT\}/);
  assert.doesNotMatch(oauthSource, /tool_spec\["model"\]/);
});
