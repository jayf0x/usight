import { existsSync, lstatSync, mkdirSync, rmSync, symlinkSync, unlinkSync, renameSync } from 'fs';
import { join } from 'path';
import { getConfig, saveConfig, resolvePath } from './config.js';
import { parseRepo, downloadAndExtract } from './github.js';
import { getWidgetsDir } from './ubersicht.js';

export async function install(repoArg) {
  const { owner, repo } = parseRepo(repoArg);
  const name = repo;

  const cfg = getConfig();
  if (cfg.widgets[name]) {
    console.error(`"${name}" is already installed. Run: usight uninstall ${name}`);
    process.exit(1);
  }

  const cacheDir = join(cfg.cachePath, name);
  const widgetsDir = getWidgetsDir();
  const symlinkPath = join(widgetsDir, name);

  mkdirSync(widgetsDir, { recursive: true });

  console.log(`Downloading ${owner}/${repo}...`);
  await downloadAndExtract(owner, repo, cacheDir);

  // Remove stale symlink if present
  if (existsSync(symlinkPath) || isSymlink(symlinkPath)) {
    unlinkSync(symlinkPath);
  }
  symlinkSync(cacheDir, symlinkPath);

  cfg.widgets[name] = { repo: `${owner}/${repo}`, installedAt: new Date().toISOString() };
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
  const widgetsDir = getWidgetsDir();
  const symlinkPath = join(widgetsDir, name);

  if (existsSync(symlinkPath) || isSymlink(symlinkPath)) {
    unlinkSync(symlinkPath);
  }
  if (existsSync(cacheDir)) {
    rmSync(cacheDir, { recursive: true, force: true });
  }

  delete cfg.widgets[name];
  saveConfig(cfg);

  console.log(`✓ Removed "${name}"`);
}

export function list() {
  const cfg = getConfig();
  const entries = Object.entries(cfg.widgets);

  if (entries.length === 0) {
    console.log('No widgets installed. Try: usight install <owner/repo>');
    return;
  }

  for (const [name, info] of entries) {
    const date = info.installedAt ? new Date(info.installedAt).toLocaleDateString() : '?';
    console.log(`  ${name}  (${info.repo})  installed ${date}`);
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

  // Move each managed widget dir and update its symlink
  for (const name of Object.keys(cfg.widgets)) {
    const src = join(oldPath, name);
    const dst = join(newPath, name);
    const symlinkPath = join(widgetsDir, name);

    if (existsSync(src)) {
      renameSync(src, dst);
    }

    // Re-point symlink to new location
    if (existsSync(symlinkPath) || isSymlink(symlinkPath)) {
      unlinkSync(symlinkPath);
    }
    if (existsSync(dst)) {
      symlinkSync(dst, symlinkPath);
    }
  }

  cfg.cachePath = newPath;
  saveConfig(cfg);

  console.log(`✓ Cache path set to ${newPath}`);
}

// lstatSync doesn't throw on broken symlinks, existsSync does — need both
function isSymlink(p) {
  try {
    return lstatSync(p).isSymbolicLink();
  } catch {
    return false;
  }
}
