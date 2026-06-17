// Real-network integration tests. Run before publishing to catch regressions
// in download/extraction that unit tests can't catch.
// Not in CI — only invoked from publish-npm.sh.

import assert from 'assert';
import { readdirSync, rmSync, mkdtempSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

import { downloadAndExtract, downloadZip, fetchLatestRelease } from '../lib/github.js';
import { findWidget, searchRegistry } from '../lib/registry.js';

let passed = 0, failed = 0;

async function test(label, fn) {
  process.stdout.write(`  ${label}... `);
  try {
    await fn();
    console.log('✓');
    passed++;
  } catch (err) {
    console.log(`✗\n    ${err.message}`);
    failed++;
  }
}

function withTmp(fn) {
  const tmp = mkdtempSync(join(tmpdir(), 'usight-int-'));
  return fn(tmp).finally(() => rmSync(tmp, { recursive: true, force: true }));
}

// ── GitHub: release zip path ───────────────────────────────────────────────
console.log('\ninstall via GitHub release zip');

await test('fetchLatestRelease — jaredmeakin/ubersicht-time-remaining', async () => {
  const rel = await fetchLatestRelease('jaredmeakin', 'ubersicht-time-remaining');
  assert.ok(rel !== null, 'expected a release with a zip asset');
  assert.ok(rel.url.endsWith('.zip'), `expected .zip download URL, got: ${rel.url}`);
  assert.ok(rel.tag, 'expected a tag name');
});

await test('install + remove — jaredmeakin/ubersicht-time-remaining', () =>
  withTmp(async (tmp) => {
    await downloadAndExtract('jaredmeakin', 'ubersicht-time-remaining', tmp);
    const files = readdirSync(tmp, { recursive: true });
    assert.ok(files.length > 0, `nothing extracted into ${tmp}`);
    process.stdout.write(`(${files.length} files) `);
  })
);

// ── GitHub: tarball fallback (repo with no release zip asset) ─────────────
console.log('\ninstall via GitHub HEAD tarball');

await test('install + remove — hw2007/ubersicht-neofetch', () =>
  withTmp(async (tmp) => {
    // If this repo later gains releases the zip path is used instead — either
    // way the test verifies that extraction produces at least one file.
    await downloadAndExtract('hw2007', 'ubersicht-neofetch', tmp);
    const files = readdirSync(tmp, { recursive: true });
    assert.ok(files.length > 0, `nothing extracted into ${tmp}`);
    process.stdout.write(`(${files.length} files) `);
  })
);

// ── Official registry ──────────────────────────────────────────────────────
console.log('\ninstall via official widget registry');

await test('findWidget — AnalogClock', async () => {
  const w = await findWidget('AnalogClock');
  assert.ok(w !== null, 'AnalogClock not found in registry');
  assert.ok(w.downloadUrl.endsWith('.zip'), `unexpected downloadUrl: ${w.downloadUrl}`);
});

await test('install + remove — AnalogClock (registry zip)', () =>
  withTmp(async (tmp) => {
    const w = await findWidget('AnalogClock');
    await downloadZip(w.downloadUrl, tmp);
    const files = readdirSync(tmp, { recursive: true });
    assert.ok(files.length > 0, `nothing extracted into ${tmp}`);
    process.stdout.write(`(${files.length} files) `);
  })
);

await test('searchRegistry — "clock" returns results', async () => {
  const results = await searchRegistry('clock');
  assert.ok(results.length > 0, 'no results for "clock"');
  assert.ok(
    results.every(w => w.id.toLowerCase().includes('clock') || w.name.toLowerCase().includes('clock')),
    'result does not match query'
  );
});

// ── summary ────────────────────────────────────────────────────────────────
console.log(`\n${passed + failed} integration tests: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
