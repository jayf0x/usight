import assert from 'assert';
import { existsSync, mkdtempSync, rmSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir, homedir } from 'os';
import { gzipSync, gunzipSync } from 'zlib';

import { parseRepo, extractTar } from '../lib/github.js';
import { getConfig, saveConfig, resolvePath } from '../lib/config.js';
import { detectRuntime } from '../lib/runtime.js';

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

// ── extractTar ─────────────────────────────────────────────────────────────
console.log('\nextractTar');

// Build a minimal tar buffer that mirrors GitHub's archive layout:
// topdir/file.txt and topdir/sub/nested.txt
function makeTar(entries) {
  const blocks = [];

  for (const { name, content = '' } of entries) {
    const contentBuf = Buffer.from(content);
    const header = Buffer.alloc(512);

    Buffer.from(name).copy(header, 0);
    Buffer.from('0000644\0').copy(header, 100);
    Buffer.from(contentBuf.length.toString(8).padStart(11, '0') + '\0').copy(header, 124);
    header[156] = name.endsWith('/') ? 53 : 48; // '5' dir, '0' file

    blocks.push(header);

    if (contentBuf.length > 0) {
      const padded = Buffer.alloc(Math.ceil(contentBuf.length / 512) * 512);
      contentBuf.copy(padded);
      blocks.push(padded);
    }
  }

  blocks.push(Buffer.alloc(1024)); // end-of-archive
  return Buffer.concat(blocks);
}

test('extracts files and strips top-level dir', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'usight-'));
  try {
    const tar = makeTar([
      { name: 'topdir/' },
      { name: 'topdir/widget.coffee', content: 'command: "uptime"' },
    ]);
    extractTar(tar, tmp);
    assert.ok(existsSync(join(tmp, 'widget.coffee')));
    assert.strictEqual(readFileSync(join(tmp, 'widget.coffee'), 'utf8'), 'command: "uptime"');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('extracts nested directories', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'usight-'));
  try {
    const tar = makeTar([
      { name: 'topdir/' },
      { name: 'topdir/sub/' },
      { name: 'topdir/sub/nested.jsx', content: 'export default () => <div />' },
    ]);
    extractTar(tar, tmp);
    assert.ok(existsSync(join(tmp, 'sub', 'nested.jsx')));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('handles empty archive gracefully', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'usight-'));
  try {
    extractTar(Buffer.alloc(1024), tmp); // two zero blocks = end-of-archive
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

// ── resolvePath ────────────────────────────────────────────────────────────
console.log('\nresolvePath');

test('expands ~', () => {
  assert.strictEqual(resolvePath('~/foo/bar'), join(homedir(), 'foo/bar'));
});

test('leaves absolute path unchanged', () => {
  assert.strictEqual(resolvePath('/tmp/foo'), '/tmp/foo');
});

// ── config ─────────────────────────────────────────────────────────────────
console.log('\nconfig');

test('getConfig returns defaults when no file exists', () => {
  const cfg = getConfig();
  assert.ok(typeof cfg.cachePath === 'string');
  assert.ok(typeof cfg.widgets === 'object');
});

test('saveConfig + getConfig round-trip', () => {
  const cfg = getConfig();
  const before = JSON.stringify(cfg);
  saveConfig(cfg);
  assert.strictEqual(JSON.stringify(getConfig()), before);
});

// ── runtime detection ──────────────────────────────────────────────────────
console.log('\nruntime');

test('detectRuntime returns string or null', () => {
  const r = detectRuntime();
  assert.ok(r === null || typeof r === 'string');
});

test('detected runtime is a known tool', () => {
  const r = detectRuntime();
  if (r !== null) assert.ok(['bun', 'pnpm', 'npm'].includes(r));
});

// ── bin ────────────────────────────────────────────────────────────────────
console.log('\nbin');

test('bin/usight.js exists', () => {
  assert.ok(existsSync(new URL('../bin/usight.js', import.meta.url).pathname));
});

// ── summary ────────────────────────────────────────────────────────────────
console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
