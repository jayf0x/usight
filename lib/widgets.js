import { existsSync, lstatSync, mkdirSync, rmSync, symlinkSync, unlinkSync, renameSync } from 'fs';
import { join } from 'path';
import { getConfig, saveConfig, resolvePath } from './config.js';
import { parseRepo, downloadAndExtract, downloadZip } from './github.js';
import { findWidget } from './registry.js';
import { getWidgetsDir } from './ubersicht.js';

// ── input routing ──────────────────────────────────────────────────────────

export function detectInputType(arg) {
  if (!arg) return null;
  if (/^https?:\/\//.test(arg)) {
    if (/github\.com\/[^/]+\/[^/]+/.test(arg) && !arg.endsWith('.zip')) return 'github';
    return 'direct-url';
  }
  if (arg.includes('/')) return 'github'; // owner/repo
  return 'registry';
}

export function nameFromUrl(url) {
  const filename = url.split('/').pop().split('?')[0];
  return filename.replace(/\.widget\.zip$/i, '').replace(/\.zip$/i, '') || filename;
}

// ── commands ───────────────────────────────────────────────────────────────

export async function install(input) {
  if (!input) {
    console.error('Usage: usight install <owner/repo | widget-id | url>');
    process.exit(1);
  }

  const cfg = getConfig();
  const widgetsDir = getWidgetsDir();
  const type = detectInputType(input);

  let name, source, download;

  if (type === 'github') {
    const { owner, repo } = parseRepo(input);
    name = repo;
    source = `${owner}/${repo}`;
    download = (dest) => downloadAndExtract(owner, repo, dest);

  } else if (type === 'registry') {
    process.stdout.write(`Looking up "${input}" in registry...\n`);
    const widget = await findWidget(input);
    if (!widget) {
      console.error(`Widget "${input}" not found. Try: usight search ${input}`);
      process.exit(1);
    }
    name = widget.id;
    source = `registry:${widget.id}`;
    download = (dest) => downloadZip(widget.downloadUrl, dest);

  } else {
    // direct URL
    name = nameFromUrl(input);
    source = input;
    download = (dest) => downloadZip(input, dest);
  }

  if (cfg.widgets[name]) {
    console.error(`"${name}" is already installed. Run: usight uninstall ${name}`);
    process.exit(1);
  }

  const cacheDir = join(cfg.cachePath, name);
  const symlinkPath = join(widgetsDir, name);

  mkdirSync(widgetsDir, { recursive: true });

  console.log(`Installing ${source}...`);
  await download(cacheDir);

  if (isSymlink(symlinkPath)) unlinkSync(symlinkPath);
  symlinkSync(cacheDir, symlinkPath);

  cfg.widgets[name] = { source, installedAt: new Date().toISOString() };
  saveConfig(cfg);

  console.log(`✓ Installed "${name}" → ${symlinkPath}`);
}

export function uninstall(name) {
  if (!name) {
    console.error('Usage: usight uninstall <name>');
    process.exit(1);
  }

  const cfg = getConfig();
  if (!cfg.widgets[name]) {
    console.error(`"${name}" is not managed by usight`);
    process.exit(1);
  }

  const cacheDir = join(cfg.cachePath, name);
  const symlinkPath = join(getWidgetsDir(), name);

  if (isSymlink(symlinkPath)) unlinkSync(symlinkPath);
  if (existsSync(cacheDir)) rmSync(cacheDir, { recursive: true, force: true });

  delete cfg.widgets[name];
  saveConfig(cfg);

  console.log(`✓ Removed "${name}"`);
}

export function list() {
  const cfg = getConfig();
  const entries = Object.entries(cfg.widgets);

  if (entries.length === 0) {
    console.log('No widgets installed. Try: usight install <owner/repo | widget-id>');
    return;
  }

  for (const [name, info] of entries) {
    const date = info.installedAt ? new Date(info.installedAt).toLocaleDateString() : '?';
    console.log(`  ${name}  (${info.source})  installed ${date}`);
  }
}

export function setPath(rawPath) {
  if (!rawPath) {
    console.error('Usage: usight set --path <path>');
    process.exit(1);
  }

  const newPath = resolvePath(rawPath);
  const cfg = getConfig();
  const oldPath = cfg.cachePath;

  if (newPath === oldPath) {
    console.log(`Cache path is already ${oldPath}`);
    return;
  }

  mkdirSync(newPath, { recursive: true });
  const widgetsDir = getWidgetsDir();

  for (const name of Object.keys(cfg.widgets)) {
    const src = join(oldPath, name);
    const dst = join(newPath, name);
    const link = join(widgetsDir, name);

    if (existsSync(src)) renameSync(src, dst);

    // Re-point symlink to new location
    if (isSymlink(link)) unlinkSync(link);
    if (existsSync(dst)) symlinkSync(dst, link);
  }

  cfg.cachePath = newPath;
  saveConfig(cfg);

  console.log(`✓ Cache path set to ${newPath}`);
}

function isSymlink(p) {
  try { return lstatSync(p).isSymbolicLink(); } catch { return false; }
}
