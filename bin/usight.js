#!/usr/bin/env node

import { install, uninstall, list, setPath } from '../lib/widgets.js';
import { getConfig } from '../lib/config.js';
import { getWidgetsDir } from '../lib/ubersicht.js';
import { detectRuntime } from '../lib/runtime.js';
import { searchRegistry } from '../lib/registry.js';

const [,, cmd, ...args] = process.argv;

const commands = {
  install: () => install(args[0]),
  add:     () => install(args[0]),
  uninstall: () => uninstall(args[0]),
  remove:    () => uninstall(args[0]),
  list: () => list(),
  search: async () => {
    const query = args[0];
    if (!query) { console.error('Usage: usight search <query>'); process.exit(1); }
    const results = await searchRegistry(query);
    if (!results.length) { console.log(`No widgets matching "${query}"`); return; }
    console.log(`\nFound ${results.length} widget(s):\n`);
    for (const w of results) {
      console.log(`  ${w.id}`);
      console.log(`    ${w.name} by ${w.author}`);
      console.log(`    usight install ${w.id}\n`);
    }
  },
  set: () => {
    const i = args.indexOf('--path');
    if (i === -1 || !args[i + 1]) {
      console.error('Usage: usight set --path <path>');
      process.exit(1);
    }
    setPath(args[i + 1]);
  },
  config: () => {
    const cfg = getConfig();
    const runtime = detectRuntime();
    console.log(`Cache path:   ${cfg.cachePath}`);
    console.log(`Widgets dir:  ${getWidgetsDir()}`);
    console.log(`Installed:    ${Object.keys(cfg.widgets).length} widget(s)`);
    if (runtime) console.log(`Runtime hint: ${runtime} (informational only)`);
  },
  help: () => help(),
};

if (!cmd || !commands[cmd]) {
  help();
  process.exit(cmd ? 1 : 0);
}

Promise.resolve(commands[cmd]()).catch((err) => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});

function help() {
  console.log(`
usight — Übersicht widget manager

  usight install <owner/repo>    Install a widget from GitHub (checks releases first)
  usight install <widget-id>     Install from the official widget registry
  usight install <url>           Install from a direct .zip URL
  usight add <...>               Alias for install
  usight uninstall <name>        Remove a widget
  usight remove <name>           Alias for uninstall
  usight list                    List installed widgets
  usight search <query>          Search the official widget registry
  usight set --path <path>       Change widget cache directory
  usight config                  Show current configuration
  usight help                    Show this help

Examples:
  usight install hw2007/ubersicht-neofetch
  usight install AnalogClock
  usight install https://raw.githubusercontent.com/foo/bar/master/foo.widget.zip
  usight search clock
`.trim());
}
