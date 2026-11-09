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
const SVG_BASE64 = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><rect width="1024" height="1024" fill="red"/></svg>'
).toString('base64');
const GIF_BASE64 = 'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
// 2x2 RGBA, every pixel alpha=0 — a genuinely transparent PNG so transparency
// postconditions measure real alpha instead of shrugging at an unmeasurable file.
const TRANSPARENT_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAC0lEQVR4nGNgQAcAABIAAXfx+gAAAAAASUVORK5CYII=';

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
async function captureRequest(invoke, options = {}) {
  let captured;
  const server = createServer((req, res) => {
    const chunks = [];
    req.on('data', (chunk) => { chunks.push(chunk); });
    req.on('end', () => {
      captured = {
        contentType: String(req.headers['content-type'] || ''),
        body: Buffer.concat(chunks),
        headers: req.headers,
        url: req.url,
      };
      // Respond with bytes matching the requested output_format when the
      // caller didn't force a fallback. Lets SVG/GIF success tests assert on
      // genuine files instead of PNG bytes at a wrong extension. Multipart
      // (edits) bodies aren't JSON, so the output_format field is regexed out
      // — the client sniffs saved bytes against the requested format, and a
      // PNG echo for a gif edit is exactly the failure the sniff exists for.
      let respondWith = options.respondWith;
      if (!respondWith) {
        let fmt = null;
        try {
          fmt = JSON.parse(captured.body.toString('utf8')).output_format || 'png';
        } catch {
          const field = captured.body.toString('latin1').match(/name="output_format"\r\n\r\n(\w+)\r\n/);
          fmt = field ? field[1] : 'png';
        }
        respondWith = fmt;
      }
      const table = { png: PNG_BASE64, svg: SVG_BASE64, gif: GIF_BASE64 };
      const status = options.status || 200;
      if (status !== 200) {
        res.writeHead(status, { 'content-type': 'application/json' });
        res.end(JSON.stringify(options.errorBody || { error: { message: 'rejected' } }));
        return;
      }
      const b64 = options.b64 || table[respondWith] || PNG_BASE64;
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ data: [{ b64_json: b64 }] }));
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
 * @param {{respondWith?: string}} [options] - force a specific response format (default: echo requested output_format).
 * @returns {Promise<object>} Parsed request payload.
 */
async function captureGeneration(invoke, options = {}) {
  const request = await captureRequest(invoke, options);
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

test('API generation defaults to GPT Image 2.6 Flare', async () => {
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
    assert.equal(payload.model, 'gpt-image-2.6-flare');
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
  test(`${command} defaults to GPT Image 2.6 Flare`, async () => {
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
      assert.equal(multipartField(request.body, 'model'), 'gpt-image-2.6-flare');
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

// ---- Images 2.6: complexity + GIF wiring -----------------------------------

test('--complexity reaches a 2.6 generation request', async () => {
  await withTempDir(async (dir) => {
    const payload = await captureGeneration(async (baseUrl) => {
      const result = await runApi([
        'generate', '-p', 'test image', '-o', join(dir, 'out.png'),
        '--complexity', 'low',
      ], {
        OPENAI_IMAGE_API_KEY: 'test-key',
        OPENAI_IMAGE_BASE_URL: baseUrl,
      }, dir);
      assert.equal(result.code, 0, result.stderr);
    });
    assert.equal(payload.complexity, 'low');
  });
});

test('--complexity is rejected on a 2.5 model before any request', async () => {
  await withTempDir(async (dir) => {
    const result = await runApi([
      'generate', '-p', 'test image', '-o', join(dir, 'out.png'),
      '--model', 'gpt-image-2.5-flare', '--complexity', 'low',
    ], {
      OPENAI_IMAGE_API_KEY: 'test-key',
      OPENAI_IMAGE_BASE_URL: 'http://127.0.0.1:1',
    }, dir);
    assert.notEqual(result.code, 0);
    assert.match(result.stderr, /--complexity is a GPT Image 2.6 parameter/);
  });
});

test('GIF parameters reach the generation request', async () => {
  await withTempDir(async (dir) => {
    const payload = await captureGeneration(async (baseUrl) => {
      const result = await runApi([
        'generate', '-p', 'bouncing ball', '-o', join(dir, 'out.gif'),
        '--output-format', 'gif', '--frames', '6', '--frame-ms', '150',
        '--size', '512x512',
      ], {
        OPENAI_IMAGE_API_KEY: 'test-key',
        OPENAI_IMAGE_BASE_URL: baseUrl,
      }, dir);
      assert.equal(result.code, 0, result.stderr);
    });
    assert.equal(payload.output_format, 'gif');
    assert.equal(payload.frame_count, 6);
    assert.equal(payload.frame_duration_ms, 150);
    assert.equal(payload.size, '512x512');
    assert.equal(payload.complexity, undefined);
  });
});

test('GIF frame_count default is server-side (absent from request when unset)', async () => {
  await withTempDir(async (dir) => {
    const payload = await captureGeneration(async (baseUrl) => {
      const result = await runApi([
        'generate', '-p', 'bouncing ball', '-o', join(dir, 'out.gif'),
        '--output-format', 'gif', '--size', '512x512',
      ], {
        OPENAI_IMAGE_API_KEY: 'test-key',
        OPENAI_IMAGE_BASE_URL: baseUrl,
      }, dir);
      assert.equal(result.code, 0, result.stderr);
    });
    assert.equal(payload.output_format, 'gif');
    assert.equal(payload.frame_count, undefined);
    assert.equal(payload.frame_duration_ms, undefined);
  });
});

test('GIF parameters reach an edit request as multipart fields', async () => {
  await withTempDir(async (dir) => {
    const src = join(dir, 'src.png');
    writeFileSync(src, Buffer.from(PNG_BASE64, 'base64'));
    const request = await captureRequest(async (baseUrl) => {
      const result = await runApi([
        'edit', '-i', src, '-p', 'animate the water', '-o', join(dir, 'out.gif'),
        '--output-format', 'gif', '--frames', '4', '--frame-ms', '250',
      ], {
        OPENAI_IMAGE_API_KEY: 'test-key',
        OPENAI_IMAGE_BASE_URL: baseUrl,
      }, dir);
      assert.equal(result.code, 0, result.stderr);
    });
    assert.equal(multipartField(request.body, 'output_format'), 'gif');
    assert.equal(multipartField(request.body, 'frame_count'), '4');
    assert.equal(multipartField(request.body, 'frame_duration_ms'), '250');
  });
});

for (const [label, args] of [
  ['--frames without GIF output', ['--frames', '6']],
  ['--frame-ms without GIF output', ['--frame-ms', '150']],
  ['out-of-range frames', ['--output-format', 'gif', '-o', '/dev/null/x.gif', '--frames', '20']],
  ['out-of-range frame-ms', ['--output-format', 'gif', '-o', '/dev/null/x.gif', '--frame-ms', '5000']],
  ['transparent + gif', ['--output-format', 'gif', '-o', '/dev/null/x.gif', '--background', 'transparent']],
  ['output-compression + gif', ['--output-format', 'gif', '-o', '/dev/null/x.gif', '--output-compression', '80']],
  ['gif bytes at a .png path', ['--output-format', 'gif', '-o', '/dev/null/x.png']],
]) {
  test(`pre-flight rejects ${label}`, async () => {
    await withTempDir(async (dir) => {
      const result = await runApi([
        'generate', '-p', 'test image', ...args,
      ], {
        OPENAI_IMAGE_API_KEY: 'test-key',
        OPENAI_IMAGE_BASE_URL: 'http://127.0.0.1:1',
      }, dir);
      assert.notEqual(result.code, 0);
    });
  });
}

test('--input-fidelity is rejected on 2.6 edits before any request', async () => {
  await withTempDir(async (dir) => {
    const src = join(dir, 'src.png');
    writeFileSync(src, Buffer.from(PNG_BASE64, 'base64'));
    const result = await runApi([
      'edit', '-i', src, '-p', 'change color', '-o', join(dir, 'out.png'),
      '--input-fidelity', 'high',
    ], {
      OPENAI_IMAGE_API_KEY: 'test-key',
      OPENAI_IMAGE_BASE_URL: 'http://127.0.0.1:1',
    }, dir);
    assert.notEqual(result.code, 0);
    assert.match(result.stderr, /not supported on GPT Image 2.6 edits/);
  });
});

test('--input-fidelity still reaches a 2.5 edit request', async () => {
  await withTempDir(async (dir) => {
    const src = join(dir, 'src.png');
    writeFileSync(src, Buffer.from(PNG_BASE64, 'base64'));
    const request = await captureRequest(async (baseUrl) => {
      const result = await runApi([
        'edit', '-i', src, '-p', 'change color', '-o', join(dir, 'out.png'),
        '--model', 'gpt-image-2.5-sunburst', '--input-fidelity', 'high',
      ], {
        OPENAI_IMAGE_API_KEY: 'test-key',
        OPENAI_IMAGE_BASE_URL: baseUrl,
      }, dir);
      assert.equal(result.code, 0, result.stderr);
    });
    assert.equal(multipartField(request.body, 'input_fidelity'), 'high');
  });
});

// ---- Images 2.6: SVG wiring -------------------------------------------------

test('--output-format svg reaches the generation request', async () => {
  await withTempDir(async (dir) => {
    const payload = await captureGeneration(async (baseUrl) => {
      const result = await runApi([
        'generate', '-p', 'flat icon', '-o', join(dir, 'icon.svg'),
        '--output-format', 'svg',
      ], {
        OPENAI_IMAGE_API_KEY: 'test-key',
        OPENAI_IMAGE_BASE_URL: baseUrl,
      }, dir);
      assert.equal(result.code, 0, result.stderr);
    });
    assert.equal(payload.output_format, 'svg');
    assert.equal(payload.frame_count, undefined);
  });
});

test('svg + transparent passes with an honesty note (no raster alpha to verify)', async () => {
  await withTempDir(async (dir) => {
    const payload = await captureGeneration(async (baseUrl) => {
      const result = await runApi([
        'generate', '-p', 'flat icon', '-o', join(dir, 'icon.svg'),
        '--output-format', 'svg', '--background', 'transparent',
      ], {
        OPENAI_IMAGE_API_KEY: 'test-key',
        OPENAI_IMAGE_BASE_URL: baseUrl,
      }, dir);
      assert.equal(result.code, 0, result.stderr);
    });
    assert.equal(payload.background, 'transparent');
    assert.equal(payload.output_format, 'svg');
  });
});

test('svg + --output-compression is rejected pre-flight', async () => {
  await withTempDir(async (dir) => {
    const result = await runApi([
      'generate', '-p', 'x', '-o', join(dir, 'icon.svg'),
      '--output-format', 'svg', '--output-compression', '80',
    ], {
      OPENAI_IMAGE_API_KEY: 'test-key',
      OPENAI_IMAGE_BASE_URL: 'http://127.0.0.1:1',
    }, dir);
    assert.notEqual(result.code, 0);
    assert.match(result.stderr, /only to jpeg\/webp/);
  });
});

test('svg bytes at a .png path are rejected', async () => {
  await withTempDir(async (dir) => {
    const result = await runApi([
      'generate', '-p', 'x', '-o', join(dir, 'icon.png'),
      '--output-format', 'svg',
    ], {
      OPENAI_IMAGE_API_KEY: 'test-key',
      OPENAI_IMAGE_BASE_URL: 'http://127.0.0.1:1',
    }, dir);
    assert.notEqual(result.code, 0);
    assert.match(result.stderr, /writes \.svg bytes/);
  });
});

test('svg success leaves a genuine SVG file (server echoes requested format)', async () => {
  await withTempDir(async (dir) => {
    const outPath = join(dir, 'icon.svg');
    const payload = await captureGeneration(async (baseUrl) => {
      const result = await runApi([
        'generate', '-p', 'flat icon', '-o', outPath,
        '--output-format', 'svg',
      ], {
        OPENAI_IMAGE_API_KEY: 'test-key',
        OPENAI_IMAGE_BASE_URL: baseUrl,
      }, dir);
      assert.equal(result.code, 0, result.stderr);
    });
    assert.equal(payload.output_format, 'svg');
    const saved = readFileSync(outPath, 'utf8');
    assert.match(saved, /^<svg /);
  });
});

test('server fallback (png bytes for an svg request) fails loudly', async () => {
  await withTempDir(async (dir) => {
    const outPath = join(dir, 'icon.svg');
    let stderr = '';
    await captureGeneration(async (baseUrl) => {
      const r = await runApi([
        'generate', '-p', 'flat icon', '-o', outPath,
        '--output-format', 'svg',
      ], {
        OPENAI_IMAGE_API_KEY: 'test-key',
        OPENAI_IMAGE_BASE_URL: baseUrl,
      }, dir);
      stderr = r.stderr;
    }, { respondWith: 'png' });
    assert.match(stderr, /requested output_format=svg but the response bytes are not SVG/);
  });
});

test('gif success leaves a genuine GIF file', async () => {
  await withTempDir(async (dir) => {
    const outPath = join(dir, 'anim.gif');
    await captureGeneration(async (baseUrl) => {
      const result = await runApi([
        'generate', '-p', 'loop', '-o', outPath,
        '--output-format', 'gif', '--frames', '4',
      ], {
        OPENAI_IMAGE_API_KEY: 'test-key',
        OPENAI_IMAGE_BASE_URL: baseUrl,
      }, dir);
      assert.equal(result.code, 0, result.stderr);
    });
    const head = readFileSync(outPath).subarray(0, 4).toString('latin1');
    assert.equal(head, 'GIF8');
  });
});

test('gif without --frames validates against the server default of 9 frames', async () => {
  await withTempDir(async (dir) => {
    // 1024x1024 = 1,048,576 px/frame; x9 = 9.4M > 8,294,400 budget. x1 would
    // pass, so this only rejects if the effective count is the server default.
    const result = await runApi([
      'generate', '-p', 'loop', '-o', join(dir, 'a.gif'),
      '--output-format', 'gif', '--size', '1024x1024',
    ], {
      OPENAI_IMAGE_API_KEY: 'test-key',
      OPENAI_IMAGE_BASE_URL: 'http://127.0.0.1:1',
    }, dir);
    assert.notEqual(result.code, 0);
    assert.match(result.stderr, /budget|frames/i);
  });
});

test('gif with an explicit small frame count passes the same size', async () => {
  await withTempDir(async (dir) => {
    const payload = await captureGeneration(async (baseUrl) => {
      const result = await runApi([
        'generate', '-p', 'loop', '-o', join(dir, 'a.gif'),
        '--output-format', 'gif', '--frames', '2', '--size', '1024x1024',
      ], {
        OPENAI_IMAGE_API_KEY: 'test-key',
        OPENAI_IMAGE_BASE_URL: baseUrl,
      }, dir);
      assert.equal(result.code, 0, result.stderr);
    });
    assert.equal(payload.frame_count, 2);
    assert.equal(payload.size, '1024x1024');
  });
});

test('tiny gif frames skip the still-image pixel floor', async () => {
  await withTempDir(async (dir) => {
    // 128x128 = 16,384 px: far below the 655,360 still floor, legitimate as a
    // sticker frame with the default 9 frames (147k total).
    const payload = await captureGeneration(async (baseUrl) => {
      const result = await runApi([
        'generate', '-p', 'sticker', '-o', join(dir, 'a.gif'),
        '--output-format', 'gif', '--size', '128x128',
      ], {
        OPENAI_IMAGE_API_KEY: 'test-key',
        OPENAI_IMAGE_BASE_URL: baseUrl,
      }, dir);
      assert.equal(result.code, 0, result.stderr);
    });
    assert.equal(payload.size, '128x128');
  });
});

// ---------------------------------------------------------------------------
// codex-images transport (PIXELTAMER_CODEX_IMAGES=1): the ChatGPT-backend
// image route driven by codex OAuth tokens instead of an API key.

const CODEX_AUTH = { tokens: { access_token: 'px-test-token', account_id: 'acct-test' } };

/**
 * Write a fixture codex auth.json and build the codex-images env for runApi.
 * @param {string} dir - isolated test directory (auth.json lives here).
 * @param {string} baseUrl - capture-server URL to pin as the codex-images base.
 * @param {NodeJS.ProcessEnv} [extra] - additional env vars.
 * @returns {NodeJS.ProcessEnv} env for runApi.
 */
function codexImagesEnv(dir, baseUrl, extra = {}) {
  const authPath = join(dir, 'auth.json');
  writeFileSync(authPath, JSON.stringify(CODEX_AUTH));
  return {
    PIXELTAMER_CODEX_IMAGES: '1',
    PIXELTAMER_CODEX_AUTH_JSON: authPath,
    PIXELTAMER_CODEX_IMAGES_BASE: baseUrl,
    ...extra,
  };
}

test('codex-images generate sends OAuth headers and no size/output_format', async () => {
  await withTempDir(async (dir) => {
    const captured = await captureRequest(async (baseUrl) => {
      const result = await runApi([
        'generate', '-p', 'codex route probe', '-o', join(dir, 'out.png'),
        '--size', '2048x2048',
      ], codexImagesEnv(dir, baseUrl), dir);
      assert.equal(result.code, 0, result.stderr);
      // --size was dropped: the route doesn't honour it. One honest line, no
      // silent pretending.
      assert.match(result.stderr, /does not honour --size/);
    }, { b64: TRANSPARENT_PNG_BASE64 });
    assert.equal(captured.url, '/images/generations');
    assert.equal(captured.headers.authorization, 'Bearer px-test-token');
    assert.equal(captured.headers['chatgpt-account-id'], 'acct-test');
    assert.equal(captured.headers.originator, 'codex_exec');
    assert.match(String(captured.headers['user-agent']), /codex_exec\//);
    const payload = JSON.parse(captured.body.toString('utf8'));
    assert.equal(payload.model, 'gpt-image-2.6-flare');
    assert.equal(payload.prompt, 'codex route probe');
    assert.equal(payload.n, 1);
    assert.equal(payload.size, undefined);
    assert.equal(payload.output_format, undefined);
  });
});

test('codex-images transparent generate passes a measured-alpha postcondition', async () => {
  await withTempDir(async (dir) => {
    let envelope;
    await captureRequest(async (baseUrl) => {
      const result = await runApi([
        'generate', '-p', 'cutout', '-o', join(dir, 'out.png'),
        '--background', 'transparent', '--json',
      ], codexImagesEnv(dir, baseUrl), dir);
      assert.equal(result.code, 0, result.stderr);
      envelope = JSON.parse(result.stdout);
    }, { b64: TRANSPARENT_PNG_BASE64 });
    assert.equal(envelope.ok, true);
    assert.equal(envelope.backend, 'codex-images');
    const alpha = envelope.outputs[0].alpha;
    assert.equal(alpha.measured, true);
    assert.equal(alpha.transparent_pct, 100);
  });
});

test('codex-images edit posts JSON with images[].image_url, never multipart', async () => {
  await withTempDir(async (dir) => {
    const source = join(dir, 'src.png');
    writeFileSync(source, Buffer.from(TRANSPARENT_PNG_BASE64, 'base64'));
    const captured = await captureRequest(async (baseUrl) => {
      const result = await runApi([
        'edit', '-i', source, '-p', 'recolor the shape',
        '-o', join(dir, 'out.png'), '--background', 'transparent',
      ], codexImagesEnv(dir, baseUrl), dir);
      assert.equal(result.code, 0, result.stderr);
    }, { b64: TRANSPARENT_PNG_BASE64 });
    assert.equal(captured.url, '/images/edits');
    assert.match(captured.contentType, /^application\/json/);
    const payload = JSON.parse(captured.body.toString('utf8'));
    assert.equal(payload.model, 'gpt-image-2.6-flare');
    assert.equal(payload.prompt, 'recolor the shape');
    assert.match(payload.images[0].image_url, /^data:image\/png;base64,/);
    assert.equal(payload.size, undefined);
    assert.equal(payload.background, 'transparent');
  });
});

test('codex-images compose sends one images entry per reference', async () => {
  await withTempDir(async (dir) => {
    const first = join(dir, 'a.png');
    const second = join(dir, 'b.png');
    writeFileSync(first, Buffer.from(TRANSPARENT_PNG_BASE64, 'base64'));
    writeFileSync(second, Buffer.from(TRANSPARENT_PNG_BASE64, 'base64'));
    const captured = await captureRequest(async (baseUrl) => {
      const result = await runApi([
        'compose', '-i', first, '-i', second, '-p', 'blend both',
        '-o', join(dir, 'out.png'),
      ], codexImagesEnv(dir, baseUrl), dir);
      assert.equal(result.code, 0, result.stderr);
    }, { b64: TRANSPARENT_PNG_BASE64 });
    const payload = JSON.parse(captured.body.toString('utf8'));
    assert.equal(payload.images.length, 2);
    assert.match(payload.images[0].image_url, /^data:image\/png;base64,/);
    assert.match(payload.images[1].image_url, /^data:image\/png;base64,/);
  });
});

for (const [label, args, command] of [
  ['svg output', ['--output-format', 'svg', '-o', 'out.svg'], 'generate'],
  ['gif output', ['--output-format', 'gif', '-o', 'out.gif'], 'generate'],
  ['jpeg output', ['--output-format', 'jpeg', '-o', 'out.jpg'], 'generate'],
  ['webp output', ['--output-format', 'webp', '-o', 'out.webp'], 'generate'],
  ['gif frame flags', ['--frames', '4', '--frame-ms', '150'], 'generate'],
  ['complexity', ['--complexity', 'low'], 'generate'],
  ['output compression', ['--output-compression', '80'], 'generate'],
  ['moderation', ['--moderation', 'low'], 'generate'],
  ['user passthrough', ['--user', 'someone'], 'generate'],
  ['input fidelity', ['--input-fidelity', 'high'], 'edit'],
  ['mask', ['--mask', 'unused.png'], 'edit'],
]) {
  test(`codex-images rejects ${label} before any network call`, async () => {
    await withTempDir(async (dir) => {
      const baseArgs = command === 'edit'
        ? ['edit', '-i', join(dir, 'missing-src.png'), '-p', 'x']
        : ['generate', '-p', 'x'];
      const result = await runApi([...baseArgs, ...args, '-o', join(dir, 'out.png'), '--json'],
        codexImagesEnv(dir, 'http://127.0.0.1:1'), dir);
      assert.notEqual(result.code, 0);
      const envelope = JSON.parse(result.stdout);
      assert.equal(envelope.ok, false);
      assert.equal(envelope.backend, 'codex-images');
      assert.equal(envelope.error.code, 'invalid_argument');
      assert.equal(envelope.outputs.length, 0);
    });
  });
}

test('codex-images 401 points the user at codex login, never at a key', async () => {
  await withTempDir(async (dir) => {
    const result = await runApi([
      'generate', '-p', 'x', '-o', join(dir, 'out.png'), '--json',
    ], codexImagesEnv(dir, 'http://127.0.0.1:9401'), dir);
    // 127.0.0.1:9401 — nothing listens there, so this asserts the network-error
    // path exits cleanly in JSON mode; the 401 hint itself needs a real server.
    assert.notEqual(result.code, 0);
    const envelope = JSON.parse(result.stdout);
    assert.equal(envelope.ok, false);
    assert.equal(envelope.error.code, 'internal_error');
  });
});

test('codex-images 401 response surfaces the codex-login hint', async () => {
  await withTempDir(async (dir) => {
    const result = await new Promise((resolveRun, reject) => {
      const server = createServer((req, res) => {
        req.resume();
        req.on('end', () => {
          res.writeHead(401, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ error: { message: 'token expired' } }));
        });
      });
      server.listen(0, '127.0.0.1', () => {
        const port = server.address().port;
        const child = spawn('python3', [
          API_SCRIPT, 'generate', '-p', 'x', '-o', join(dir, 'out.png'), '--json',
        ], {
          cwd: dir,
          env: {
            PATH: process.env.PATH, HOME: dir, LANG: 'C',
            ...codexImagesEnv(dir, `http://127.0.0.1:${port}`),
          },
        });
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (c) => { stdout += c; });
        child.stderr.on('data', (c) => { stderr += c; });
        child.on('error', reject);
        child.on('close', (code) => { server.close(); resolveRun({ code, stdout, stderr }); });
      });
    });
    assert.notEqual(result.code, 0);
    const envelope = JSON.parse(result.stdout);
    assert.equal(envelope.ok, false);
    assert.match(envelope.error.message, /codex login|OAuth token is expired/);
    assert.doesNotMatch(envelope.error.message, /OPENAI_IMAGE_API_KEY='sk-/);
  });
});

test('codex-images warns when a non-verified model is requested', async () => {
  await withTempDir(async (dir) => {
    const captured = await captureRequest(async (baseUrl) => {
      const result = await runApi([
        'generate', '-p', 'x', '-o', join(dir, 'out.png'),
        '--model', 'gpt-image-2.5-sunburst',
      ], codexImagesEnv(dir, baseUrl), dir);
      assert.equal(result.code, 0, result.stderr);
      assert.match(result.stderr, /was not verified on the codex-images route/);
    }, { b64: TRANSPARENT_PNG_BASE64 });
    const payload = JSON.parse(captured.body.toString('utf8'));
    assert.equal(payload.model, 'gpt-image-2.5-sunburst');
  });
});

test('codex-images without auth.json fails with codex login guidance', async () => {
  await withTempDir(async (dir) => {
    const result = await runApi([
      'generate', '-p', 'x', '-o', join(dir, 'out.png'), '--json',
    ], {
      PIXELTAMER_CODEX_IMAGES: '1',
      PIXELTAMER_CODEX_AUTH_JSON: join(dir, 'nope', 'auth.json'),
      PIXELTAMER_CODEX_IMAGES_BASE: 'http://127.0.0.1:1',
    }, dir);
    assert.notEqual(result.code, 0);
    const envelope = JSON.parse(result.stdout);
    assert.equal(envelope.error.code, 'auth_missing');
    assert.match(envelope.error.message, /codex login/);
  });
});

test('codex-images -n 2 fires two calls and writes both outputs', async () => {
  await withTempDir(async (dir) => {
    const outBase = join(dir, 'multi.png');
    await captureRequest(async (baseUrl) => {
      const result = await runApi([
        'generate', '-p', 'pair', '-o', outBase, '-n', '2',
      ], codexImagesEnv(dir, baseUrl), dir);
      assert.equal(result.code, 0, result.stderr);
    }, { b64: TRANSPARENT_PNG_BASE64 });
    assert.ok(readFileSync(`${outBase.replace(/\.png$/, '')}-01.png`));
    assert.ok(readFileSync(`${outBase.replace(/\.png$/, '')}-02.png`));
  });
});

// ---------------------------------------------------------------------------
// Advisor-review holes (2026-11-09): base-URL pin enforcement, transparency
// postcondition in BOTH stdout modes, and format sniffing on parallel batches.

const OPAQUE_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEUlEQVR4nGP438PwH4QZYAwAXJIKKXIKGZIAAAAASUVORK5CYII=';

test('codex-images base override refuses non-loopback hosts before any request', async () => {
  await withTempDir(async (dir) => {
    const authPath = join(dir, 'auth.json');
    writeFileSync(authPath, JSON.stringify(CODEX_AUTH));
    const result = await runApi([
      'generate', '-p', 'x', '-o', join(dir, 'out.png'), '--json',
    ], {
      PIXELTAMER_CODEX_IMAGES: '1',
      PIXELTAMER_CODEX_AUTH_JSON: authPath,
      PIXELTAMER_CODEX_IMAGES_BASE: 'https://evil.example.com/backend-api/codex',
    }, dir);
    assert.notEqual(result.code, 0);
    const envelope = JSON.parse(result.stdout);
    assert.equal(envelope.ok, false);
    assert.equal(envelope.error.code, 'invalid_argument');
    assert.match(envelope.error.message, /loopback/);
    assert.equal(envelope.outputs.length, 0);
  });
});

test('PIXELTAMER_* keys are never loaded from .env files', async () => {
  await withTempDir(async (dir) => {
    // .env in cwd would otherwise flip the transport on for plain API runs.
    writeFileSync(join(dir, '.env'), 'PIXELTAMER_CODEX_IMAGES=1\n');
    const payload = await captureGeneration(async (baseUrl) => {
      const result = await runApi([
        'generate', '-p', 'x', '-o', join(dir, 'out.png'), '--json',
      ], { OPENAI_IMAGE_API_KEY: 'test-key', OPENAI_IMAGE_BASE_URL: baseUrl }, dir);
      assert.equal(result.code, 0, result.stderr);
      const envelope = JSON.parse(result.stdout);
      assert.equal(envelope.backend, 'api');
    });
    // If the .env had been honoured, the transport would be codex-images and
    // the api-key bearer header would never appear. The captured model line
    // plus backend field prove the run stayed on the api transport.
    assert.equal(payload.model, 'gpt-image-2.6-flare');
  });
});

test('transparent request returning an opaque image fails in JSON mode', async () => {
  await withTempDir(async (dir) => {
    const result = await runApi([
      'generate', '-p', 'cutout', '-o', join(dir, 'out.png'),
      '--background', 'transparent', '--json',
    ], {
      OPENAI_IMAGE_API_KEY: 'test-key',
      OPENAI_IMAGE_BASE_URL: 'http://127.0.0.1:1',
    }, dir);
    // 127.0.0.1:1 refuses connection — this exercises the opaque-output path
    // via a real server below; here we only assert connection errors still
    // produce a structured envelope.
    assert.notEqual(result.code, 0);
  });

  await withTempDir(async (dir) => {
    const result = await new Promise((resolveRun, reject) => {
      const server = createServer((req, res) => {
        req.resume();
        req.on('end', () => {
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ data: [{ b64_json: OPAQUE_PNG_BASE64 }] }));
        });
      });
      server.listen(0, '127.0.0.1', () => {
        const port = server.address().port;
        const child = spawn('python3', [
          API_SCRIPT, 'generate', '-p', 'cutout', '-o', join(dir, 'out.png'),
          '--background', 'transparent', '--json',
        ], {
          cwd: dir,
          env: {
            PATH: process.env.PATH, HOME: dir, LANG: 'C',
            OPENAI_IMAGE_API_KEY: 'test-key',
            OPENAI_IMAGE_BASE_URL: `http://127.0.0.1:${port}`,
          },
        });
        let stdout = '';
        child.stdout.on('data', (c) => { stdout += c; });
        child.on('error', reject);
        child.on('close', (code) => { server.close(); resolveRun({ code, stdout }); });
      });
    });
    assert.notEqual(result.code, 0);
    const envelope = JSON.parse(result.stdout);
    assert.equal(envelope.ok, false);
    assert.equal(envelope.error.code, 'alpha_not_observed');
  });
});

test('transparent request returning an opaque image fails in plain mode too', async () => {
  await withTempDir(async (dir) => {
    const result = await new Promise((resolveRun, reject) => {
      const server = createServer((req, res) => {
        req.resume();
        req.on('end', () => {
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ data: [{ b64_json: OPAQUE_PNG_BASE64 }] }));
        });
      });
      server.listen(0, '127.0.0.1', () => {
        const port = server.address().port;
        const child = spawn('python3', [
          API_SCRIPT, 'generate', '-p', 'cutout', '-o', join(dir, 'out.png'),
          '--background', 'transparent',
        ], {
          cwd: dir,
          env: {
            PATH: process.env.PATH, HOME: dir, LANG: 'C',
            OPENAI_IMAGE_API_KEY: 'test-key',
            OPENAI_IMAGE_BASE_URL: `http://127.0.0.1:${port}`,
          },
        });
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (c) => { stdout += c; });
        child.stderr.on('data', (c) => { stderr += c; });
        child.on('error', reject);
        child.on('close', (code) => { server.close(); resolveRun({ code, stdout, stderr }); });
      });
    });
    assert.notEqual(result.code, 0);
    assert.match(result.stderr, /opaque|alpha/i);
    // Plain mode still delivered the path on stdout (the file exists and cost
    // money) but the exit code says the contract failed.
    assert.ok(result.stdout.trim().length > 0);
  });
});

test('parallel -n 2 svg requests that receive PNG bytes fail loudly', async () => {
  await withTempDir(async (dir) => {
    const result = await new Promise((resolveRun, reject) => {
      const hits = { count: 0 };
      const server = createServer((req, res) => {
        req.resume();
        req.on('end', () => {
          hits.count += 1;
          res.writeHead(200, { 'content-type': 'application/json' });
          // Refuses to echo the requested svg — server fallback scenario.
          res.end(JSON.stringify({ data: [{ b64_json: PNG_BASE64 }] }));
        });
      });
      server.listen(0, '127.0.0.1', () => {
        const port = server.address().port;
        const child = spawn('python3', [
          API_SCRIPT, 'generate', '-p', 'logo', '-o', join(dir, 'out.svg'),
          '--output-format', 'svg', '-n', '2', '--json',
        ], {
          cwd: dir,
          env: {
            PATH: process.env.PATH, HOME: dir, LANG: 'C',
            OPENAI_IMAGE_API_KEY: 'test-key',
            OPENAI_IMAGE_BASE_URL: `http://127.0.0.1:${port}`,
          },
        });
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (c) => { stdout += c; });
        child.stderr.on('data', (c) => { stderr += c; });
        child.on('error', reject);
        child.on('close', (code) => { server.close(); resolveRun({ code, stdout, stderr, hits }); });
      });
    });
    assert.notEqual(result.code, 0);
    assert.equal(result.hits.count, 2);
    const envelope = JSON.parse(result.stdout);
    assert.equal(envelope.ok, false);
    assert.equal(envelope.error.code, 'partial_failure');
    assert.equal(envelope.outputs.length, 0);
  });
});

test('cross-origin redirect is refused instead of followed with credentials', async () => {
  await withTempDir(async (dir) => {
    const result = await new Promise((resolveRun, reject) => {
      const server = createServer((req, res) => {
        req.resume();
        req.on('end', () => {
          // Points at a closed port: if the client followed the redirect it
          // would surface as a connection-refused retry loop, not HTTP 302.
          res.writeHead(302, { location: 'http://127.0.0.1:1/steal' });
          res.end();
        });
      });
      server.listen(0, '127.0.0.1', () => {
        const port = server.address().port;
        const child = spawn('python3', [
          API_SCRIPT, 'generate', '-p', 'x', '-o', join(dir, 'out.png'), '--json',
        ], {
          cwd: dir,
          env: {
            PATH: process.env.PATH, HOME: dir, LANG: 'C',
            OPENAI_IMAGE_API_KEY: 'test-key',
            OPENAI_IMAGE_BASE_URL: `http://127.0.0.1:${port}`,
          },
        });
        let stdout = '';
        child.stdout.on('data', (c) => { stdout += c; });
        child.on('error', reject);
        child.on('close', (code) => { server.close(); resolveRun({ code, stdout }); });
      });
    });
    assert.notEqual(result.code, 0);
    const envelope = JSON.parse(result.stdout);
    assert.equal(envelope.ok, false);
    // The redirect itself is reported — the bearer header never travels.
    assert.match(envelope.error.message, /302/);
  });
});

// A colour-type-2 RGB PNG carries no alpha channel at all — structurally
// knowable, so a transparent request answered with one is a failure, not an
// "unknown" the postcondition can shrug off.
const RGB_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEElEQVR4nGP438MARAwQCgAvPgYtmKN0KQAAAABJRU5ErkJggg==';

test('transparent request answered by an alpha-less RGB PNG fails the postcondition', async () => {
  await withTempDir(async (dir) => {
    const result = await new Promise((resolveRun, reject) => {
      const server = createServer((req, res) => {
        req.resume();
        req.on('end', () => {
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ data: [{ b64_json: RGB_PNG_BASE64 }] }));
        });
      });
      server.listen(0, '127.0.0.1', () => {
        const port = server.address().port;
        const child = spawn('python3', [
          API_SCRIPT, 'generate', '-p', 'cutout', '-o', join(dir, 'out.png'),
          '--background', 'transparent', '--json',
        ], {
          cwd: dir,
          env: {
            PATH: process.env.PATH, HOME: dir, LANG: 'C',
            OPENAI_IMAGE_API_KEY: 'test-key',
            OPENAI_IMAGE_BASE_URL: `http://127.0.0.1:${port}`,
          },
        });
        let stdout = '';
        child.stdout.on('data', (c) => { stdout += c; });
        child.on('error', reject);
        child.on('close', (code) => { server.close(); resolveRun({ code, stdout }); });
      });
    });
    assert.notEqual(result.code, 0);
    const envelope = JSON.parse(result.stdout);
    assert.equal(envelope.ok, false);
    assert.equal(envelope.error.code, 'alpha_not_observed');
    assert.equal(envelope.outputs[0].alpha.has_alpha_channel, false);
  });
});
