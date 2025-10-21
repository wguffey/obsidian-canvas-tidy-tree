# Canvas Tidy Tree

An Obsidian plugin that provides automatic layout and tidying functionality for tree structures within Canvas files using the ELK (Eclipse Layout Kernel) algorithm.

## Overview

Canvas Tidy Tree enhances Obsidian's Canvas feature by automatically organizing and laying out nodes in a clean, hierarchical tree structure. The plugin uses the powerful ELK layout algorithm to position nodes optimally, making complex mind maps, flowcharts, and hierarchical diagrams easier to read and maintain.

The plugin supports both horizontal (rightward) and vertical (downward) tree layouts. It currently doesn't work too well with groups. Also, I recommend connecting all graphs to a root node.

## 

## Features

- **Automatic Tree Layout**: Uses ELK layered algorithm for optimal node positioning
- **Directional Layouts**: Support for rightward and downward tree orientations
- **Group Handling**: Automatically resizes and positions groups based on their contents
- **Overlap Resolution**: Intelligently resolves overlapping groups within connected components
- **Component Packing**: Separates and organizes disconnected graph components
- **Edge Routing**: Applies orthogonal edge routing for clean connector lines
- **Edge Anchoring**: Automatically sets appropriate connector anchor points based on layout direction
- **Canvas Integration**: Seamlessly integrates with Obsidian's Canvas editor

## Installation

### From Obsidian Community Plugins

1. Open Obsidian Settings
2. Go to Community Plugins and disable Safe Mode
3. Search for "Canvas Tidy Tree"
4. Install and enable the plugin

### Manual Installation

1. Download the latest release from the [GitHub releases page](https://github.com/your-repo/canvas-tidy-tree/releases)
2. Extract the files (`main.js`, `manifest.json`, `styles.css`) into your vault's `.obsidian/plugins/canvas-tidy-tree/` folder
3. Reload Obsidian
4. Enable the plugin in Settings > Community Plugins

### Requirements

- Obsidian v1.5.0 or higher
- Desktop version of Obsidian (plugin is desktop-only)

## Usage

1. Open a Canvas file in Obsidian
2. Use one of the following commands:
   - **Canvas: ELK Tree Layout (Right)** - Arranges nodes in a horizontal tree layout flowing to the right
   - **Canvas: ELK Tree Layout (Down)** - Arranges nodes in a vertical tree layout flowing downward

The plugin will automatically:
- Analyze the canvas structure and connections
- Apply the ELK layout algorithm
- Position nodes optimally
- Resize groups to fit their contents
- Resolve any overlapping groups
- Pack disconnected components
- Update edge anchor points for clean connections

### Command Palette

Access the layout commands through:
- Command Palette: `Ctrl/Cmd + P` then search for "Tidy Tree"

## Configuration

This plugin currently has no user-configurable settings. Default layout parameters work pretty well for most use cases. If you want to play around with params, look in `main.ts`.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

### Development Setup

1. Clone this repository
2. Install dependencies: `npm install`
3. Start development mode: `npm run dev`
4. Make your changes to `main.ts`
5. Test in Obsidian by reloading the plugin
6. Submit a pull request

### Building

- Development build: `npm run dev`
- Production build: `npm run build`

## License

Copyright (C) 2020-2025 by Dynalist Inc.

Permission to use, copy, modify, and/or distribute this software for any purpose with or without fee is hereby granted.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.

## Changelog

### v0.1.0
- Initial release
- Basic ELK tree layout functionality for Canvas files
- Support for rightward and downward layouts
