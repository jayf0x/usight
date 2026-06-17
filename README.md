# usight

Install and manage [Übersicht](https://tracesof.net/uebersicht/) widgets directly from GitHub — no git required.

## Installation

```bash
npm install -g usight
```

## Usage

```bash
# Install a widget from GitHub
usight install hw2007/ubersicht-neofetch
usight install https://github.com/hw2007/ubersicht-neofetch

# Remove a widget
usight uninstall ubersicht-neofetch

# List installed widgets
usight list

# Change where widgets are cached
usight set --path ~/my-widgets-cache

# Show current config
usight config
```

## How it works

Downloads a GitHub repository as a tarball, extracts it into a local cache (`~/.cache/usight` by default), and creates a symlink in your Übersicht widgets directory. No git, no background processes, no telemetry.

## Requirements

- macOS
- Node.js ≥ 18

## License

MIT
