import https from 'https';
import { mkdirSync } from 'fs';
import { spawn } from 'child_process';

// Parse "owner/repo" or full GitHub URL into { owner, repo }
export function parseRepo(input) {
  if (!input) throw new Error('No repository specified');

  // strip trailing .git and leading https://github.com/
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

// Download GitHub tarball and extract into destDir (streaming, no temp file).
export function downloadAndExtract(owner, repo, destDir) {
  mkdirSync(destDir, { recursive: true });

  const url = `https://api.github.com/repos/${owner}/${repo}/tarball/HEAD`;

  return new Promise((resolve, reject) => {
    const get = (url) => {
      https.get(url, { headers: { 'User-Agent': 'usight-cli' } }, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307) {
          get(res.headers.location);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`GitHub returned HTTP ${res.statusCode} for ${owner}/${repo}`));
          return;
        }

        // pipe into tar — strips the top-level GitHub-generated directory
        const tar = spawn('tar', ['-xzf', '-', '-C', destDir, '--strip-components=1'], {
          stdio: ['pipe', 'inherit', 'inherit'],
        });

        res.pipe(tar.stdin);
        res.on('error', reject);
        tar.on('error', reject);
        tar.on('close', (code) => {
          if (code === 0) resolve();
          else reject(new Error(`tar exited with code ${code}`));
        });
      }).on('error', reject);
    };

    get(url);
  });
}
