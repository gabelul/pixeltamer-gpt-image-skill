#!/usr/bin/env node
/**
 * emit-json.mjs — build the `--json` envelope for the bash backends.
 *
 * The codex path is a shell script, and shell has no business hand-assembling
 * JSON around arbitrary file paths: one apostrophe in a directory name and the
 * caller gets a parse error instead of a result. So bash collects facts and
 * this turns them into the envelope, using the same PNG reader as everything
 * else. One implementation of what "transparent" means, shared by every path.
 *
 * Usage:
 *   emit-json.mjs ok    <command> <backend> <duration_ms> [--transparent-requested] <path>...
 *   emit-json.mjs error <command> <backend> <duration_ms> <code> <retryable> <message> [path]...
 *
 * Always writes exactly one JSON object to stdout, including when its own
 * inspection fails — a broken emitter must not become prose on stdout.
 */

import { readImageDimensions, readAlphaCoverage, readHasAlphaChannel } from './image-dimensions.mjs';
import { statSync } from 'node:fs';
import { extname } from 'node:path';

const SCHEMA_VERSION = 1;

/**
 * Describe one produced file: size, dimensions, and honest alpha reporting.
 * @param {string} path - absolute path to the output file
 * @returns {object} output entry for the envelope
 */
function describe(path) {
  const entry = { path };
  try {
    entry.bytes = statSync(path).size;
  } catch {
    // Missing file is itself information; leave bytes off rather than guessing.
  }
  entry.format = extname(path).replace('.', '').toLowerCase() || null;

  const dims = readImageDimensions(path);
  if (dims) {
    entry.width = dims.width;
    entry.height = dims.height;
  }

  const coverage = readAlphaCoverage(path);
  if (coverage) {
    entry.alpha = {
      present: true,
      measured: true,
      transparent_pct: coverage.transparentPct,
      partial_pct: coverage.partialPct,
    };
  } else {
    // measured:false with nulls, never 0. Zero would read as "definitely
    // opaque" when the truth is "we could not tell".
    entry.alpha = {
      present: readHasAlphaChannel(path),
      measured: false,
      transparent_pct: null,
      partial_pct: null,
    };
  }
  return entry;
}

function main() {
  const [mode, command, backend, durationMs, ...rest] = process.argv.slice(2);

  if (mode === 'ok') {
    const transparentRequested = rest[0] === '--transparent-requested';
    const paths = transparentRequested ? rest.slice(1) : rest;
    const outputs = paths.map(describe);

    // Same postcondition the API path enforces: asking for transparency and
    // receiving an opaque image is a failed contract, not a successful write.
    const opaque = outputs.filter(
      (o) => o.alpha?.measured && (o.alpha.transparent_pct ?? 0) < 1,
    );
    if (transparentRequested && opaque.length) {
      return {
        schema_version: SCHEMA_VERSION,
        ok: false,
        command,
        backend,
        duration_ms: Number(durationMs) || 0,
        outputs,
        error: {
          code: 'alpha_not_observed',
          message:
            `--background transparent was requested but ${opaque.length} of ` +
            `${outputs.length} output(s) came back effectively opaque. The prompt ` +
            `most likely described a backdrop, surface or cast shadow, which ` +
            `overrides the request.`,
          retryable: 'no',
          opaque_outputs: opaque.map((o) => o.path),
        },
      };
    }

    return {
      schema_version: SCHEMA_VERSION,
      ok: true,
      command,
      backend,
      duration_ms: Number(durationMs) || 0,
      outputs,
    };
  }

  const [code, retryable, message, ...paths] = rest;
  return {
    schema_version: SCHEMA_VERSION,
    ok: false,
    command,
    backend,
    duration_ms: Number(durationMs) || 0,
    outputs: paths.map(describe),
    error: { code, message, retryable },
  };
}

try {
  process.stdout.write(JSON.stringify(main()) + '\n');
} catch (e) {
  // Last resort. The contract is one JSON object on stdout; an emitter that
  // throws must still honour it.
  process.stdout.write(JSON.stringify({
    schema_version: SCHEMA_VERSION,
    ok: false,
    error: {
      code: 'internal_error',
      message: `envelope construction failed: ${e?.message ?? e}`,
      retryable: 'unknown',
    },
  }) + '\n');
  process.exitCode = 1;
}
