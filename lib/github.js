import { gunzipSync } from 'zlib';
import { mkdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { extractZip } from './zip.js';

// Parse "owner/repo" or full GitHub URL into { owner, repo }
export function parseRepo(input) {
  if (!input) throw new Error('No repository specified');

  const clean = input
    .replace(/^https?:\/\/github\.com\//, '')
    .replace(/\.git$/, '')
    .trim();

  const parts = clean.split('/');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error(`Invalid repo format: "${input}" — use owner/repo or https://github.com/owner/repo`);
  }

  return { owner: parts[0], repo: parts[1] };
}

// Check if a repo has a latest release with a .zip asset.
// Returns { tag, url, name } or null (no release / no zip asset).
// Throws if the API is reachable but returns an unexpected error.
export async function fetchLatestRelease(owner, repo) {
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases/latest`, {
    headers: { 'User-Agent': 'usight-cli' },
  });
  if (res.status === 404) return null; // repo exists but has no releases
  if (!res.ok) throw new Error(`GitHub API error ${res.status} checking releases for ${owner}/${repo}`);

  const release = await res.json();
  const asset = release.assets?.find(a => a.name.endsWith('.zip'));
  if (!asset) return null;

  return { tag: release.tag_name, url: asset.browser_download_url, name: asset.name };
}

// Download a zip from any URL and extract into destDir.
export async function downloadZip(url, destDir) {
  mkdirSync(destDir, { recursive: true });
  const data = await download(url);
  extractZip(data, destDir);
}

// Download GitHub repo: prefers a tagged release zip, falls back to HEAD tarball.
export async function downloadAndExtract(owner, repo, destDir) {
  mkdirSync(destDir, { recursive: true });

  let release = null;
  try {
    release = await fetchLatestRelease(owner, repo);
  } catch (err) {
    // Rate-limited or API hiccup — warn and fall back rather than blocking the install
    process.stderr.write(`  Warning: ${err.message} — falling back to HEAD tarball\n`);
  }

  if (release) {
    process.stdout.write(`  release ${release.tag} (${release.name})\n`);
    const data = await download(release.url);
    extractZip(data, destDir);
    return;
  }

  // No release (or rate-limited) — pull HEAD tarball
  const data = await download(`https://api.github.com/repos/${owner}/${repo}/tarball/HEAD`);
  extractTar(gunzipSync(data), destDir);
}

// ── internals ──────────────────────────────────────────────────────────────

async function download(url) {
  const res = await fetch(url, { redirect: 'follow', headers: { 'User-Agent': 'usight-cli' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

// Minimal tar extractor — used for HEAD tarball fallback.
// ponytail: skips symlinks/hardlinks (rare in widget repos); add if needed
export function extractTar(data, destDir) {
  let offset = 0;

  while (offset + 512 <= data.length) {
    const header = data.subarray(offset, offset + 512);
    offset += 512;

    if (header.every(b => b === 0)) break;

    const name = nullStr(header.subarray(0, 100));
    const size = parseInt(nullStr(header.subarray(124, 136)).trim(), 8) || 0;
    const type = String.fromCharCode(header[156]);

    // GitHub tarballs wrap everything in "owner-repo-sha/" — strip it
    const stripped = name.split('/').slice(1).join('/');

    if (stripped) {
      const dest = join(destDir, stripped);
      if (type === '5' || stripped.endsWith('/')) {
        mkdirSync(dest, { recursive: true });
      } else if (type === '0' || type === '\0') {
        mkdirSync(dirname(dest), { recursive: true });
        writeFileSync(dest, data.subarray(offset, offset + size));
      }
    }

    offset += Math.ceil(size / 512) * 512;
  }
}

function nullStr(buf) {
  const end = buf.indexOf(0);
  return end === -1 ? buf.toString('utf8') : buf.subarray(0, end).toString('utf8');
}
