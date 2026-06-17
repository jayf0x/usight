#!/usr/bin/env node

import { install, uninstall, list, setPath } from '../lib/widgets.js';
import { getConfig } from '../lib/config.js';
import { getWidgetsDir } from '../lib/ubersicht.js';
import { detectRuntime } from '../lib/runtime.js';

const [,, cmd, ...args] = process.argv;

const commands = {
  install: () => install(args[0]),
  add:     () => install(args[0]),
  uninstall: () => uninstall(args[0]),
  remove:    () => uninstall(args[0]),
  list: () => list(),
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

  usight install <owner/repo>    Install a widget from GitHub
  usight add <owner/repo>        Alias for install
  usight uninstall <name>        Remove a widget
  usight remove <name>           Alias for uninstall
  usight list                    List installed widgets
  usight set --path <path>       Change widget cache directory
  usight config                  Show current configuration
  usight help                    Show this help

Examples:
  usight install hw2007/ubersicht-neofetch
  usight install https://github.com/hw2007/ubersicht-neofetch
  usight uninstall ubersicht-neofetch
`.trim());
}
