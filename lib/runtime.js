import { execSync } from 'child_process';

// Detect available JS runtimes in preference order.
// Informational only — usight's install logic never delegates to any of these.
export function detectRuntime() {
  for (const tool of ['bun', 'pnpm', 'npm']) {
    try {
      execSync(`${tool} --version`, { stdio: 'pipe' });
      return tool;
    } catch {}
  }
  return null;
}
