import assert from 'assert';
import { existsSync, mkdtempSync, rmSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir, homedir } from 'os';
import { gzipSync, gunzipSync, deflateRawSync } from 'zlib';

import { parseRepo, extractTar } from '../lib/github.js';
import { extractZip } from '../lib/zip.js';
import { getConfig, saveConfig, resolvePath } from '../lib/config.js';
import { detectRuntime } from '../lib/runtime.js';
import { detectInputType, nameFromUrl } from '../lib/widgets.js';

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

// ── detectInputType ────────────────────────────────────────────────────────
console.log('\ndetectInputType');

test('owner/repo → github', () => {
  assert.strictEqual(detectInputType('hw2007/ubersicht-neofetch'), 'github');
});

test('github.com URL → github', () => {
  assert.strictEqual(detectInputType('https://github.com/foo/bar'), 'github');
});

test('github.com .zip URL → direct-url', () => {
  assert.strictEqual(detectInputType('https://github.com/foo/bar/releases/download/1.0/foo.zip'), 'direct-url');
});

test('raw.githubusercontent URL → direct-url', () => {
  assert.strictEqual(detectInputType('https://raw.githubusercontent.com/foo/bar/master/foo.widget.zip'), 'direct-url');
});

test('bare name → registry', () => {
  assert.strictEqual(detectInputType('AnalogClock'), 'registry');
});

test('slug with hyphen → registry', () => {
  assert.strictEqual(detectInputType('scrolling-clock_widget'), 'registry');
});

// ── nameFromUrl ────────────────────────────────────────────────────────────
console.log('\nnameFromUrl');

test('strips .widget.zip', () => {
  assert.strictEqual(nameFromUrl('https://raw.githubusercontent.com/foo/bar/master/scrolling-clock.widget.zip'), 'scrolling-clock');
});

test('strips .zip', () => {
  assert.strictEqual(nameFromUrl('https://example.com/my-widget.zip'), 'my-widget');
});

test('handles query string', () => {
  assert.strictEqual(nameFromUrl('https://example.com/foo.widget.zip?v=1'), 'foo');
});

// ── extractTar ─────────────────────────────────────────────────────────────
console.log('\nextractTar');

function makeTar(entries) {
  const blocks = [];
  for (const { name, content = '' } of entries) {
    const contentBuf = Buffer.from(content);
    const header = Buffer.alloc(512);
    Buffer.from(name).copy(header, 0);
    Buffer.from('0000644\0').copy(header, 100);
    Buffer.from(contentBuf.length.toString(8).padStart(11, '0') + '\0').copy(header, 124);
    header[156] = name.endsWith('/') ? 53 : 48;
    blocks.push(header);
    if (contentBuf.length > 0) {
      const padded = Buffer.alloc(Math.ceil(contentBuf.length / 512) * 512);
      contentBuf.copy(padded);
      blocks.push(padded);
    }
  }
  blocks.push(Buffer.alloc(1024));
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
  try { extractTar(Buffer.alloc(1024), tmp); }
  finally { rmSync(tmp, { recursive: true, force: true }); }
});

// ── extractZip ─────────────────────────────────────────────────────────────
console.log('\nextractZip');

// Build a minimal STORED zip (no compression) — valid, no CRC check in our extractor
function makeZip(entries) {
  const localParts = [];
  const cdParts = [];
  let offset = 0;

  for (const { name, content = '' } of entries) {
    const nameBuf = Buffer.from(name);
    const dataBuf = typeof content === 'string' ? Buffer.from(content) : content;

    const lh = Buffer.alloc(30 + nameBuf.length + dataBuf.length);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(0, 8);                      // stored
    lh.writeUInt32LE(dataBuf.length, 18);
    lh.writeUInt32LE(dataBuf.length, 22);
    lh.writeUInt16LE(nameBuf.length, 26);
    nameBuf.copy(lh, 30);
    dataBuf.copy(lh, 30 + nameBuf.length);
    localParts.push(lh);

    const cd = Buffer.alloc(46 + nameBuf.length);
    cd.writeUInt32LE(0x02014b50, 0);
    lh.copy(cd, 10, 8, 26);                      // copy compression + sizes
    cd.writeUInt16LE(nameBuf.length, 28);
    cd.writeUInt32LE(name.endsWith('/') ? 0x10000000 : 0, 38);
    cd.writeUInt32LE(offset, 42);
    nameBuf.copy(cd, 46);
    cdParts.push(cd);

    offset += lh.length;
  }

  const cdBuf = Buffer.concat(cdParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cdBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);

  return Buffer.concat([...localParts, cdBuf, eocd]);
}

test('extracts stored files at root (no strip)', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'usight-'));
  try {
    const zip = makeZip([{ name: 'widget.coffee', content: 'command: "uptime"' }]);
    extractZip(zip, tmp);
    assert.ok(existsSync(join(tmp, 'widget.coffee')));
    assert.strictEqual(readFileSync(join(tmp, 'widget.coffee'), 'utf8'), 'command: "uptime"');
  } finally {
    rmSync(tmp, { recursive: true, force: true }); }
});

test('strips single common top-level dir', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'usight-'));
  try {
    const zip = makeZip([
      { name: 'topdir/' },
      { name: 'topdir/widget.jsx', content: 'hi' },
    ]);
    extractZip(zip, tmp);
    assert.ok(existsSync(join(tmp, 'widget.jsx')));
    assert.ok(!existsSync(join(tmp, 'topdir')));
  } finally {
    rmSync(tmp, { recursive: true, force: true }); }
});

test('extracts deflate-compressed file', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'usight-'));
  try {
    const content = 'command: "date"';
    const nameBuf = Buffer.from('widget.coffee');
    const dataBuf = deflateRawSync(Buffer.from(content));

    // Build deflate entry manually
    const lh = Buffer.alloc(30 + nameBuf.length + dataBuf.length);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(8, 8);                          // deflate
    lh.writeUInt32LE(dataBuf.length, 18);
    lh.writeUInt32LE(content.length, 22);
    lh.writeUInt16LE(nameBuf.length, 26);
    nameBuf.copy(lh, 30);
    dataBuf.copy(lh, 30 + nameBuf.length);

    const cd = Buffer.alloc(46 + nameBuf.length);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(8, 10);
    cd.writeUInt32LE(dataBuf.length, 20);
    cd.writeUInt32LE(content.length, 24);
    cd.writeUInt16LE(nameBuf.length, 28);
    nameBuf.copy(cd, 46);

    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(1, 8);
    eocd.writeUInt16LE(1, 10);
    eocd.writeUInt32LE(cd.length, 12);
    eocd.writeUInt32LE(lh.length, 16);

    extractZip(Buffer.concat([lh, cd, eocd]), tmp);
    assert.strictEqual(readFileSync(join(tmp, 'widget.coffee'), 'utf8'), content);
  } finally {
    rmSync(tmp, { recursive: true, force: true }); }
});

test('throws on non-zip data', () => {
  assert.throws(() => extractZip(Buffer.from('not a zip'), '/tmp'), /Not a valid ZIP/);
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

// ── runtime ────────────────────────────────────────────────────────────────
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
