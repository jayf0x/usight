# usight

Install and manage [Übersicht](https://tracesof.net/uebersicht/) widgets directly from GitHub or the official widget registry — no git required.

## Installation

```bash
npm install -g usight
```

## Usage

```bash
# Install from GitHub (uses tagged release if one exists, otherwise HEAD)
usight install hw2007/ubersicht-neofetch
usight install https://github.com/hw2007/ubersicht-neofetch

# Install from the official Übersicht widget registry
usight install AnalogClock

# Install from a direct .zip URL
usight install https://raw.githubusercontent.com/foo/bar/master/foo.widget.zip

# Search the official registry
usight search clock

# List installed widgets
usight list

# Remove a widget
usight uninstall ubersicht-neofetch

# Show current config (cache path, widgets dir)
usight config

# Change where widgets are cached (moves existing widgets automatically)
usight set --path ~/my-widgets-cache
```

## How it works

Downloads a GitHub repository or `.widget.zip` archive, extracts it into a local cache (`~/.cache/usight` by default), and creates a symlink in your Übersicht widgets directory. Prefers tagged releases when available, falls back to the HEAD tarball. No git, no background processes, no telemetry.

## Requirements

- macOS
- Node.js ≥ 18

## License

MIT
