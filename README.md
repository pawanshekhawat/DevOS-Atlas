# DevOS Atlas

DevOS Atlas is a visual, canvas-based Markdown workspace application designed for organizing, viewing, and editing multiple Markdown documents side-by-side on an infinite zoomable screen.

![DevOS Atlas Screenshot](index.html) <!-- Placeholder indicator or screenshot target -->

## Features

- **Infinite Canvas Workspace**: Drag the background to pan, and scroll your mouse wheel to zoom in and out (10% to 300%).
- **Interactive Markdown Windows**: Drag window headers to position documents. Drag window borders to resize.
- **Rich Rendering & Editing**: Live Markdown editing with real-time preview rendering and Prism.js syntax highlighting.
- **File Explorer Sidebar**: Collapsible file explorer with search functionality to quickly find and focus documents.
- **State Persistence**: Your workspace is automatically saved to local storage so you never lose your layout.
- **Import/Export**: Drag & drop `.md` files onto the workspace or upload them via the header to populate the canvas.

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

## License

MIT License. See LICENSE for details.
