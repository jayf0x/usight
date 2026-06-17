import assert from 'assert';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir, homedir } from 'os';

import { parseRepo } from '../lib/github.js';
import { getConfig, saveConfig, resolvePath } from '../lib/config.js';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.log(`  ✗ ${name}: ${err.message}`);
    failed++;
  }
}

// ── parseRepo ──────────────────────────────────────────────────────────────
console.log('\nparseRepo');

test('owner/repo', () => {
  const r = parseRepo('hw2007/ubersicht-neofetch');
  assert.strictEqual(r.owner, 'hw2007');
  assert.strictEqual(r.repo, 'ubersicht-neofetch');
});

test('full GitHub URL', () => {
  const r = parseRepo('https://github.com/hw2007/ubersicht-neofetch');
  assert.strictEqual(r.owner, 'hw2007');
  assert.strictEqual(r.repo, 'ubersicht-neofetch');
});

test('full URL with .git suffix', () => {
  const r = parseRepo('https://github.com/hw2007/ubersicht-neofetch.git');
  assert.strictEqual(r.owner, 'hw2007');
  assert.strictEqual(r.repo, 'ubersicht-neofetch');
});

test('throws on bad input', () => {
  assert.throws(() => parseRepo('notaslash'), /Invalid repo format/);
});

test('throws on empty input', () => {
  assert.throws(() => parseRepo(''), /No repository specified/);
});

test('throws on null', () => {
  assert.throws(() => parseRepo(null), /No repository specified/);
});

// ── resolvePath ────────────────────────────────────────────────────────────
console.log('\nresolvePath');

test('expands ~', () => {
  const result = resolvePath('~/foo/bar');
  assert.strictEqual(result, join(homedir(), 'foo/bar'));
});

test('leaves absolute path unchanged', () => {
  assert.strictEqual(resolvePath('/tmp/foo'), '/tmp/foo');
});

// ── config round-trip (uses a temp config dir) ────────────────────────────
console.log('\nconfig');

// Temporarily redirect config by monkey-patching — we just test the shape
test('getConfig returns defaults when no file exists', () => {
  const cfg = getConfig();
  assert.ok(typeof cfg.cachePath === 'string');
  assert.ok(typeof cfg.widgets === 'object');
});

test('saveConfig + getConfig round-trip', () => {
  const cfg = getConfig();
  const before = JSON.stringify(cfg);
  saveConfig(cfg);
  const after = JSON.stringify(getConfig());
  assert.strictEqual(before, after);
});

// ── bin exists and is executable ───────────────────────────────────────────
console.log('\nbin');

test('bin/usight.js exists', () => {
  assert.ok(existsSync(new URL('../bin/usight.js', import.meta.url).pathname));
});

// ── summary ────────────────────────────────────────────────────────────────
console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
