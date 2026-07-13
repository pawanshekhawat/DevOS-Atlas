# DevOS Atlas

DevOS Atlas is a visual, canvas-based Markdown workspace application designed for organizing, viewing, and editing multiple Markdown documents side-by-side on an infinite zoomable screen.

![DevOS Atlas Screenshot](index.html) <!-- Placeholder indicator or screenshot target -->

## Features

- **Infinite Canvas Workspace**: Drag the background to pan, and scroll your mouse wheel to zoom in and out (10% to 300%).
- **Interactive Markdown Windows**: Drag window headers or selected bodies to position documents. Drag custom borders to resize proportionally with sharp text rendering.
- **Excalidraw/Figma-Style Navigation & Selection**:
  - **Multi-select & Group Dragging**: Select multiple notes using marquee selection or Shift-click. Dragging anywhere on the body of a selected card (in preview mode) moves all selected cards together.
  - **Temporary Pan Override**: Hold the `Space` key to temporarily switch to pan mode with `grab` and `grabbing` cursors. Releasing it instantly restores the active tool.
  - **Escape to Deselect**: Clear card selections instantly by pressing the `Escape` key.
  - **Toolbox Shortcuts**: Tap `v` for the Select (arrow) tool and `h` for the Pan (hand) tool.
- **Mouse Wheel Priorities**:
  - `Alt + Wheel`: Smooth canvas zoom centered on your cursor.
  - `Ctrl + Wheel`: Horizontal scroll panning.
  - `Wheel`: Vertical scroll panning.
- **Rich Rendering & Editing**: Live Markdown editing with real-time preview rendering and Prism.js syntax highlighting.
- **Staging Inbox Integration**: Connects with a local Express server to sync layouts, features, and change node artifacts dynamically on the canvas.
- **File Explorer Sidebar**: Collapsible file explorer with search functionality to quickly find and focus documents.
- **State Persistence**: Your workspace is automatically saved to local storage so you never lose your layout.
- **Import/Export**: Drag & drop `.md` files onto the workspace or upload them via the header to populate the canvas.
- **Shareable Canvas Link**: Share your current visual workspace layout with anyone by generating a unique link. When opened, it imports the notes, pan/zoom levels, and expanded/hidden change node states.
- **Empty State Paste Text Option**: Paste raw Markdown text directly when the canvas is empty to create a note card instantly.
- **Toast Notifications**: Interactive status alerts that slide up in the bottom-right corner for action feedback (copying links, successful sharing, etc.).

## Getting Started

### Prerequisites

You need [Node.js](https://nodejs.org/) installed to run the local development server.

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/pawanshekhawat/DevOS-Atlas.git
   cd DevOS-Atlas
   ```

2. Install the dependencies:
   ```bash
   npm install
   ```

3. Start the Vite development server:
   ```bash
   npm run dev
   ```

4. Build the application for production:
   ```bash
   npm run build
   ```

## Contributing

DevOS Atlas is open-source! We welcome anyone to contribute, add new features, and fix bugs. Feel free to open issues or submit pull requests to help improve the workspace.

## License

MIT License. See LICENSE for details.

