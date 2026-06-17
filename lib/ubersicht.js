import { execSync } from 'child_process';
import { join } from 'path';
import { homedir } from 'os';

const DEFAULT_WIDGETS_DIR = join(
  homedir(),
  'Library',
  'Application Support',
  'Übersicht',
  'widgets'
);

// Try reading the actual configured path from Übersicht preferences.
// Falls back to the default if Übersicht isn't installed or plist is unreadable.
export function getWidgetsDir() {
  try {
    const plist = join(homedir(), 'Library/Preferences/com.felixhageloh.uebersicht.plist');
    const json = execSync(`plutil -convert json -o - "${plist}"`, { stdio: ['pipe', 'pipe', 'pipe'] }).toString();
    const prefs = JSON.parse(json);
    if (prefs.widgetPath) return prefs.widgetPath;
  } catch {
    // Übersicht not installed or plist unreadable — use default
  }
  return DEFAULT_WIDGETS_DIR;
}
