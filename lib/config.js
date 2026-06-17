// Config lives at a fixed path so it survives cachePath changes.
// Widget metadata is embedded in config — one file, no sync issues.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const CONFIG_DIR = join(homedir(), '.config', 'usight');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');
const DEFAULT_CACHE = join(homedir(), '.cache', 'usight');

export function getConfig() {
  if (!existsSync(CONFIG_FILE)) {
    return { cachePath: DEFAULT_CACHE, widgets: {} };
  }
  try {
    return JSON.parse(readFileSync(CONFIG_FILE, 'utf8'));
  } catch {
    return { cachePath: DEFAULT_CACHE, widgets: {} };
  }
}

export function saveConfig(cfg) {
  mkdirSync(CONFIG_DIR, { recursive: true });
  mkdirSync(cfg.cachePath, { recursive: true });
  writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2) + '\n');
}

export function resolvePath(p) {
  return p.startsWith('~') ? join(homedir(), p.slice(1)) : p;
}
