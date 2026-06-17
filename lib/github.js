import { gunzipSync } from 'zlib';
import { mkdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';

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

// Download GitHub tarball and extract into destDir.
// Uses native fetch (Node ≥18) + built-in zlib — no external tools, no git.
export async function downloadAndExtract(owner, repo, destDir) {
  mkdirSync(destDir, { recursive: true });

  const url = `https://api.github.com/repos/${owner}/${repo}/tarball/HEAD`;
  const res = await fetch(url, {
    redirect: 'follow',
    headers: { 'User-Agent': 'usight-cli' },
  });

  if (!res.ok) {
    throw new Error(`GitHub returned HTTP ${res.status} for ${owner}/${repo}`);
  }

  const compressed = Buffer.from(await res.arrayBuffer());
  extractTar(gunzipSync(compressed), destDir);
}

// Minimal tar extractor — enough for GitHub repo archives.
// ponytail: skips symlinks/hardlinks (rare in widget repos); add if you hit a case
export function extractTar(data, destDir) {
  let offset = 0;

  while (offset + 512 <= data.length) {
    const header = data.subarray(offset, offset + 512);
    offset += 512;

    if (header.every(b => b === 0)) break; // end-of-archive sentinel

    const name = nullStr(header.subarray(0, 100));
    const size = parseInt(nullStr(header.subarray(124, 136)).trim(), 8) || 0;
    const type = String.fromCharCode(header[156]);

    // GitHub archives wrap everything in a top-level "owner-repo-sha/" dir — strip it
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
