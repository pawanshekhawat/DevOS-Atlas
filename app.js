// ----------------------------------------------------
// DevOS Atlas - Main Application Logic
// ----------------------------------------------------

// Default Onboarding Markdown Content
const DEFAULT_MD_CONTENT = `# Welcome to DevOS Atlas! 🎨

This is an interactive, visual markdown workspace. You can drag, resize, and zoom markdown files to arrange your thoughts.

## Quick Start Guide

1. **Move Around:** Drag the empty background to pan the workspace.
2. **Zoom In/Out:** Use your mouse scroll wheel (or hold \`Ctrl\` while scrolling) to zoom from 10% to 300%.
3. **Add Documents:**
   - Click **Upload Files** to open local \`.md\` files.
   - Drag and drop \`.md\` files directly onto this screen.
   - Double-click any empty canvas area to create a new note!

---

## Rich Markdown Showcase

### Tables
| Syntax | Description | Example |
| :--- | :--- | :--- |
| Header | Text alignment | Left-aligned |
| Row 2 | Styled cells | Beautiful |

### Task List
- [x] Create infinite zoomable canvas
- [x] Zoom-aware dragging and resizing
- [x] Markdown live preview rendering
- [ ] Upload your own files!

### Code Blocks
\`\`\`javascript
// Zoom-aware drag delta calculations
const dx = (mouseCurrentX - mouseStartX) / zoom;
const dy = (mouseCurrentY - mouseStartY) / zoom;
window.x = windowStartX + dx;
window.y = windowStartY + dy;
\`\`\`

### Blockquote
> "The design of a workspace determines the flow of thoughts. Keep it infinite."

---
*Created with love. Switch to the edit tab (📝) in the header to modify this file!*
`;

// Resolve API Base URL dynamically for local dev and production
const API_BASE = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.hostname === '[::1]') && window.location.port !== '3000'
  ? 'http://localhost:3000'
  : window.location.origin;

// State definition
let state = {
  pan: { x: 100, y: 100 },
  zoom: 1.0,
  theme: 'dark',
  windows: [],
  changes: [],
  features: [],
  artifacts: [],
  activeTool: 'select' // Default to select (arrow) tool
};

// Global variables for tracking canvas/interaction state
let maxZIndex = 10;
let isPanning = false;
let startMouse = { x: 0, y: 0 };
let startPan = { x: 0, y: 0 };
let isSpacePressed = false;

// Selection tracking globals
let isSelecting = false;
let selectionStart = { x: 0, y: 0 };
let selectionBoxEl = null;

// Active drag/resize trackers
let activeDrag = null; // { window, startX, startY, startWinX, startWinY }
let activeResize = null; // { window, handleType, startX, startY, startW, startH, startXPos, startYPos }
let isServerConnected = false;
let currentInboxItemToAccept = null;

// DOM Cache
const canvasContainer = document.getElementById('canvas-container');
const canvasGrid = document.getElementById('canvas-grid');
const canvasWorkspace = document.getElementById('canvas-workspace');
const zoomLevelEl = document.getElementById('zoom-level');
const fileInput = document.getElementById('file-input');
const fileListEl = document.getElementById('file-list');
const fileSidebar = document.getElementById('file-sidebar');
const searchInput = document.getElementById('search-input');
const onboardingOverlay = document.getElementById('onboarding-overlay');
const helpModal = document.getElementById('help-modal');

// Icon helper to return SVG code paths dynamically
const ICONS = {
  file: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>`,
  focus: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg>`,
  edit: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4z"/></svg>`,
  preview: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`,
  collapse: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
  expand: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="9" y1="9" x2="15" y2="15"/><line x1="15" y1="9" x2="9" y2="15"/></svg>`,
  close: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
  delete: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`
};

// ----------------------------------------------------
// State & Persistence
// ----------------------------------------------------
function saveState() {
  localStorage.setItem('devos_atlas_state', JSON.stringify(state));
}

function loadState() {
  const saved = localStorage.getItem('devos_atlas_state') || localStorage.getItem('md_canvas_state');
  if (saved) {
    try {
      state = JSON.parse(saved);
      // Ensure basic structure exists
      if (!state.pan) state.pan = { x: 100, y: 100 };
      if (!state.zoom) state.zoom = 1.0;
      if (!state.windows) state.windows = [];
      if (!state.theme) state.theme = 'dark';
      if (!state.activeTool) state.activeTool = 'select';
      if (!state.deletedChangeIds) state.deletedChangeIds = [];
      
      // Determine max Z Index of loaded windows
      state.windows.forEach(w => {
        w.id = String(w.id);
        if (w.zIndex > maxZIndex) maxZIndex = w.zIndex;
      });
    } catch (e) {
      console.error("Failed to parse saved state, starting fresh", e);
    }
  }
}

// ----------------------------------------------------
// Helper Functions
// ----------------------------------------------------
function generateId() {
  return 'win_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

function applyTheme() {
  if (state.theme === 'light') {
    document.body.classList.add('light-theme');
    document.body.classList.remove('dark-theme');
    document.getElementById('theme-sun').style.display = 'none';
    document.getElementById('theme-moon').style.display = 'block';
  } else {
    document.body.classList.add('dark-theme');
    document.body.classList.remove('light-theme');
    document.getElementById('theme-sun').style.display = 'block';
    document.getElementById('theme-moon').style.display = 'none';
  }
}

function updateTransform() {
  // Apply visual pan & zoom matrix transform
  canvasWorkspace.style.transform = `translate(${state.pan.x}px, ${state.pan.y}px) scale(${state.zoom})`;
  
  // Shift and scale grid background pattern relative to panning and zooming
  canvasGrid.style.backgroundPosition = `${state.pan.x}px ${state.pan.y}px`;
  canvasGrid.style.backgroundSize = `${28 * state.zoom}px ${28 * state.zoom}px`;
  
  // Update zoom indicator HUD
  zoomLevelEl.textContent = `${Math.round(state.zoom * 100)}%`;
}

function toggleOnboarding() {
  if (state.windows.length === 0) {
    onboardingOverlay.style.display = 'flex';
  } else {
    onboardingOverlay.style.display = 'none';
  }
}

// ----------------------------------------------------
// Window Rendering & Actions
// ----------------------------------------------------
function createWindowDOM(win) {
  const winEl = document.createElement('div');
  winEl.className = 'window-container';
  winEl.id = win.id;
  winEl.style.left = `${win.x}px`;
  winEl.style.top = `${win.y}px`;
  winEl.style.width = `${win.width}px`;
  winEl.style.height = `${win.height}px`;
  winEl.style.zIndex = win.zIndex;
  
  if (win.isCollapsed) {
    winEl.classList.add('collapsed');
  }

  // HTML content of the window
  winEl.innerHTML = `
    <div class="window-header" data-id="${win.id}">
      <div class="window-title-area">
        <span class="window-title-icon">${ICONS.file}</span>
        <input type="text" class="window-title-input" value="${escapeHtml(win.name)}" ${win.editMode ? '' : 'disabled'} title="${win.editMode ? 'Edit title' : 'Rename possible in Edit mode'}">
      </div>
      <div class="window-controls">
        <button class="window-btn edit-btn tooltip ${win.editMode ? 'active' : ''}" data-tooltip="Toggle Editor (📝)">
          ${win.editMode ? ICONS.preview : ICONS.edit}
        </button>
        <button class="window-btn collapse-btn tooltip" data-tooltip="Collapse/Expand (➖)">
          ${win.isCollapsed ? ICONS.expand : ICONS.collapse}
        </button>
        <button class="window-btn focus-btn tooltip" data-tooltip="Focus Document (🎯)">
          ${ICONS.focus}
        </button>
        <button class="window-btn close-btn tooltip" data-tooltip="Close File (✕)">
          ${ICONS.close}
        </button>
      </div>
    </div>
    <div class="window-body">
      <div class="window-editor" style="display: ${win.editMode ? 'block' : 'none'};">
        <textarea placeholder="Write your markdown here...">${escapeHtml(win.content)}</textarea>
      </div>
      <div class="markdown-preview" style="display: ${win.editMode ? 'none' : 'block'};"></div>
    </div>
    <!-- Custom Resize Handles -->
    <div class="resize-handle handle-r" data-type="r"></div>
    <div class="resize-handle handle-b" data-type="b"></div>
    <div class="resize-handle handle-se" data-type="se"></div>
  `;

  // Append to workspace
  canvasWorkspace.appendChild(winEl);

  // Render MD preview & color code syntax
  renderMarkdown(win.id);

  // Event handlers inside the window
  setupWindowEventListeners(winEl, win);
}

// ============================================================
// Feature Node System
// ============================================================

// Track which Feature is currently expanded (only one at a time)
let expandedChangeId = null;

// Default sizes for artifact child windows (larger than normal notes)
const ARTIFACT_DEFAULTS = {
  plan: { width: 750, height: 500 },
  tasks: { width: 650, height: 450 },
  walkthrough: { width: 750, height: 500 }
};

// ---- Feature Node DOM ----

function createFeatureNodeDOM(change, artifacts) {
  const existingEl = document.getElementById(`feature_${change.id}`);
  if (existingEl) return; // Already rendered

  const nodeEl = document.createElement('div');
  nodeEl.className = 'feature-node';
  nodeEl.id = `feature_${change.id}`;

  const x = change.x !== null && change.x !== undefined ? Number(change.x) : 100;
  const y = change.y !== null && change.y !== undefined ? Number(change.y) : 100;

  nodeEl.style.left = `${x}px`;
  nodeEl.style.top = `${y}px`;
  nodeEl.style.zIndex = 10;

  if (expandedChangeId === change.id) {
    nodeEl.classList.add('expanded');
  }

  const projectName = change.project_name || change.projectName || '';
  const projectPath = change.project_path || change.projectPath || '';
  const projectBadge = projectName ? `<span class="feature-node-project-badge" title="${escapeHtml(projectPath)}">${escapeHtml(projectName)}</span>` : '';

  const hasPlan = artifacts.some(a => a.type === 'plan');
  const hasTasks = artifacts.some(a => a.type === 'tasks');
  const hasWalkthrough = artifacts.some(a => a.type === 'walkthrough');

  const isExpanded = expandedChangeId === change.id;

  nodeEl.innerHTML = `
    <div class="feature-node-header" data-change-id="${change.id}">
      <div class="feature-node-title">
        ${projectBadge}
        <span class="feature-node-title-text" title="${escapeHtml(change.title)}">${escapeHtml(change.title)}</span>
      </div>
      <div class="feature-node-controls">
        <button class="window-btn info-btn tooltip" data-tooltip="View Metadata">ℹ️</button>
        <button class="window-btn collapse-btn tooltip" data-tooltip="Collapse/Expand">
          ${ICONS.collapse}
        </button>
        <button class="window-btn delete-btn tooltip" data-tooltip="Delete Workflow">
          ${ICONS.close}
        </button>
      </div>
    </div>
    <div class="feature-node-body">
      <div class="feature-node-row" data-type="plan" data-change-id="${change.id}">
        <span class="row-dot ${hasPlan ? 'dot-plan' : 'dot-missing'}"></span>
        <span class="row-label ${hasPlan ? '' : 'missing'}">${hasPlan ? 'Plan' : 'Plan (not available)'}</span>
        <span class="row-toggle ${isExpanded && hasPlan ? 'open' : ''}"></span>
      </div>
      <div class="feature-node-row" data-type="tasks" data-change-id="${change.id}">
        <span class="row-dot ${hasTasks ? 'dot-tasks' : 'dot-missing'}"></span>
        <span class="row-label ${hasTasks ? '' : 'missing'}">${hasTasks ? 'Tasks' : 'Tasks (not available)'}</span>
        <span class="row-toggle ${isExpanded && hasTasks ? 'open' : ''}"></span>
      </div>
      <div class="feature-node-row" data-type="walkthrough" data-change-id="${change.id}">
        <span class="row-dot ${hasWalkthrough ? 'dot-walkthrough' : 'dot-missing'}"></span>
        <span class="row-label ${hasWalkthrough ? '' : 'missing'}">${hasWalkthrough ? 'Walkthrough' : 'Walkthrough (not available)'}</span>
        <span class="row-toggle ${isExpanded && hasWalkthrough ? 'open' : ''}"></span>
      </div>
    </div>

    <div class="card-metadata-overlay" style="display: none;">
      <div class="metadata-header">
        <strong>Feature Details</strong>
        <button class="metadata-close-btn">✕</button>
      </div>
      <div class="metadata-content">
        <div class="metadata-row">
          <span class="metadata-label">Project</span>
          <span class="metadata-val">${escapeHtml(projectName || 'Default')}</span>
        </div>
        <div class="metadata-row">
          <span class="metadata-label">Source Agent</span>
          <span class="metadata-val">${escapeHtml(change.source_agent || 'Antigravity')}</span>
        </div>
        <div class="metadata-row">
          <span class="metadata-label">Created At</span>
          <span class="metadata-val">${escapeHtml(new Date(change.created_at).toLocaleString())}</span>
        </div>
        <div class="metadata-row">
          <span class="metadata-label">Updated At</span>
          <span class="metadata-val">${escapeHtml(change.updated_at ? new Date(change.updated_at).toLocaleString() : 'N/A')}</span>
        </div>
        <div class="metadata-row">
          <span class="metadata-label">Project Path</span>
          <span class="metadata-val font-mono" style="font-size: 10px;">${escapeHtml(projectPath)}</span>
        </div>
      </div>
    </div>
  `;

  canvasWorkspace.appendChild(nodeEl);
  setupFeatureNodeEventListeners(nodeEl, change, artifacts);
}

function setupFeatureNodeEventListeners(nodeEl, change, artifacts) {
  const header = nodeEl.querySelector('.feature-node-header');
  const infoBtn = nodeEl.querySelector('.info-btn');
  const metadataOverlay = nodeEl.querySelector('.card-metadata-overlay');
  const metadataCloseBtn = nodeEl.querySelector('.metadata-close-btn');
  const collapseBtn = nodeEl.querySelector('.collapse-btn');
  const deleteBtn = nodeEl.querySelector('.delete-btn');

  // Info button
  if (infoBtn && metadataOverlay) {
    infoBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isVisible = metadataOverlay.style.display === 'block';
      metadataOverlay.style.display = isVisible ? 'none' : 'block';
    });
  }
  if (metadataCloseBtn && metadataOverlay) {
    metadataCloseBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      metadataOverlay.style.display = 'none';
    });
  }

  // Collapse button — hide/show body
  collapseBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    nodeEl.classList.toggle('collapsed');
    drawConnections();
  });

  // Delete button — remove feature node from canvas (visual only, no disk deletion)
  deleteBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (confirm(`Remove the change workflow "${change.title}" from the canvas?`)) {
      if (expandedChangeId === change.id) {
        collapseFeature(change.id);
      }
      if (!state.deletedChangeIds) {
        state.deletedChangeIds = [];
      }
      if (!state.deletedChangeIds.includes(change.id)) {
        state.deletedChangeIds.push(change.id);
      }
      
      const el = document.getElementById(`feature_${change.id}`);
      if (el) el.remove();
      
      saveState();
      syncWithServer();
    }
  });

  // Row clicks — expand Feature and open artifacts
  nodeEl.querySelectorAll('.feature-node-row').forEach(row => {
    row.addEventListener('click', (e) => {
      e.stopPropagation();
      const type = row.getAttribute('data-type');
      const art = artifacts.find(a => a.type === type);
      if (!art) return; // Artifact doesn't exist

      expandFeature(change.id);
    });
  });

  // Focus on click
  nodeEl.addEventListener('mousedown', (e) => {
    maxZIndex++;
    nodeEl.style.zIndex = maxZIndex;

    // Focus styling
    document.querySelectorAll('.feature-node').forEach(el => el.classList.remove('focused'));
    document.querySelectorAll('.window-container').forEach(el => el.classList.remove('focused'));
    nodeEl.classList.add('focused');

    // Selection
    if (!e.target.closest('.feature-node-controls') && !e.target.closest('.card-metadata-overlay') && !e.target.closest('.feature-node-row')) {
      if (!nodeEl.classList.contains('selected')) {
        if (!e.shiftKey) {
          document.querySelectorAll('.feature-node.selected, .window-container.selected').forEach(el => el.classList.remove('selected'));
        }
        nodeEl.classList.add('selected');
      }
    }
  });

  // Header drag
  header.addEventListener('mousedown', (e) => {
    if (e.target.closest('.feature-node-controls') || e.target.closest('.card-metadata-overlay')) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();

    maxZIndex++;
    nodeEl.style.zIndex = maxZIndex;

    document.querySelectorAll('.feature-node').forEach(el => el.classList.remove('focused'));
    document.querySelectorAll('.window-container').forEach(el => el.classList.remove('focused'));
    nodeEl.classList.add('focused');

    if (!nodeEl.classList.contains('selected')) {
      if (!e.shiftKey) {
        document.querySelectorAll('.feature-node.selected, .window-container.selected').forEach(el => el.classList.remove('selected'));
      }
      nodeEl.classList.add('selected');
    }

    // Build drag group
    const selectedWins = [];
    document.querySelectorAll('.feature-node.selected, .window-container.selected').forEach(el => {
      const wId = el.id;
      if (el.classList.contains('feature-node')) {
        const cId = wId.replace('feature_', '');
        const changeObj = state.changes.find(c => c.id === cId);
        if (changeObj) {
          selectedWins.push({
            window: changeObj,
            startWinX: Number(changeObj.x) || 0,
            startWinY: Number(changeObj.y) || 0,
            isFeatureNode: true,
            elementId: wId
          });
        }
      } else {
        const standardWin = state.windows.find(w => w.id === wId);
        const artifactWin = state.artifacts.find(a => a.id === wId);
        const targetWin = standardWin || artifactWin;
        if (targetWin) {
          selectedWins.push({
            window: targetWin,
            startWinX: targetWin.x,
            startWinY: targetWin.y,
            isArtifact: !!artifactWin,
            isFeatureNode: false
          });
        }
      }
    });

    activeDrag = {
      startX: e.clientX,
      startY: e.clientY,
      selectedWins: selectedWins
    };
  });
}

// ---- Expand / Collapse Feature ----

function expandFeature(changeId) {
  // If already expanded, do nothing
  if (expandedChangeId === changeId) return;

  // Collapse previous Feature
  if (expandedChangeId) {
    collapseFeature(expandedChangeId);
  }

  expandedChangeId = changeId;

  // Update Feature Node visual state
  document.querySelectorAll('.feature-node').forEach(el => el.classList.remove('expanded'));
  const featureEl = document.getElementById(`feature_${changeId}`);
  if (featureEl) {
    featureEl.classList.add('expanded');
    // Update toggle circles
    featureEl.querySelectorAll('.row-toggle').forEach(toggle => {
      const row = toggle.closest('.feature-node-row');
      const type = row.getAttribute('data-type');
      const art = state.artifacts.find(a => a.change_id === changeId && a.type === type);
      if (art) {
        toggle.classList.add('open');
        row.classList.add('active');
      }
    });
  }

  // Get change and its artifacts
  const change = state.changes.find(c => c.id === changeId);
  if (!change) return;
  const artifacts = state.artifacts.filter(a => a.change_id === changeId);
  if (artifacts.length === 0) return;

  // Calculate smart spawn layout (Component 6)
  const featureX = Number(change.x) || 100;
  const featureY = Number(change.y) || 100;
  const featureW = 280; // Feature Node width
  const featureH = featureEl ? featureEl.offsetHeight : 180;

  const childY = featureY + featureH + 120;

  // Calculate total width for center-alignment
  const childWidths = artifacts.map(a => ARTIFACT_DEFAULTS[a.type]?.width || 650);
  const totalChildrenWidth = childWidths.reduce((sum, w) => sum + w, 0) + (artifacts.length - 1) * 50;
  let startX = featureX + (featureW / 2) - (totalChildrenWidth / 2);

  // Create artifact windows with smart positions
  let xOffset = 0;
  artifacts.forEach((art, idx) => {
    const defaults = ARTIFACT_DEFAULTS[art.type] || { width: 650, height: 450 };

    // Use saved position if available and previously placed, otherwise use calculated layout
    const hasCustomPosition = art.x !== null && art.x !== undefined && art.y !== null && art.y !== undefined;
    // Only use saved position if we've expanded before (positions will differ from server defaults)
    const savedX = hasCustomPosition ? Number(art.x) : (startX + xOffset);
    const savedY = hasCustomPosition ? Number(art.y) : childY;

    // Temporarily override art position for DOM creation
    const origX = art.x;
    const origY = art.y;
    art.x = savedX;
    art.y = savedY;

    createArtifactCardDOM(art, change, defaults);

    art.x = origX;
    art.y = origY;

    xOffset += defaults.width + 50;
  });

  drawConnections();
}

function collapseFeature(changeId) {
  // Remove child artifact windows from DOM
  const artifacts = state.artifacts.filter(a => a.change_id === changeId);
  artifacts.forEach(art => {
    const el = document.getElementById(art.id);
    if (el) {
      // Save current position before removing
      const currentX = parseFloat(el.style.left) || 0;
      const currentY = parseFloat(el.style.top) || 0;
      // Persist position for next expand
      fetch(`${API_BASE}/api/artifacts/layout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: art.id, changeId: changeId, type: art.type, x: currentX, y: currentY })
      }).catch(err => console.error("Failed to save artifact layout:", err));

      el.remove();
    }
  });

  // Update Feature Node visual state
  const featureEl = document.getElementById(`feature_${changeId}`);
  if (featureEl) {
    featureEl.classList.remove('expanded');
    featureEl.querySelectorAll('.row-toggle').forEach(t => t.classList.remove('open'));
    featureEl.querySelectorAll('.feature-node-row').forEach(r => r.classList.remove('active'));
  }

  if (expandedChangeId === changeId) {
    expandedChangeId = null;
  }

  drawConnections();
}

function resolveChildCollisions(draggedWinId) {
  if (!expandedChangeId) return;

  const artifacts = state.artifacts.filter(a => a.change_id === expandedChangeId);
  const boxes = [];

  artifacts.forEach(art => {
    const el = document.getElementById(art.id);
    if (el) {
      boxes.push({
        id: art.id,
        artifact: art,
        el: el,
        x: parseFloat(el.style.left) || art.x || 0,
        y: parseFloat(el.style.top) || art.y || 0,
        w: el.offsetWidth || 650,
        h: el.offsetHeight || 450,
        isDragged: art.id === draggedWinId,
        pushed: art.id === draggedWinId
      });
    }
  });

  if (boxes.length <= 1) return;

  const spacing = 20;
  let maxIterations = 10;
  let hasOverlap = true;

  while (hasOverlap && maxIterations > 0) {
    hasOverlap = false;
    maxIterations--;

    for (let i = 0; i < boxes.length; i++) {
      for (let j = 0; j < boxes.length; j++) {
        if (i === j) continue;

        const b1 = boxes[i];
        const b2 = boxes[j];

        const overlapsX = (b1.x < b2.x + b2.w + spacing) && (b1.x + b1.w + spacing > b2.x);
        const overlapsY = (b1.y < b2.y + b2.h + spacing) && (b1.y + b1.h + spacing > b2.y);

        if (overlapsX && overlapsY) {
          hasOverlap = true;

          let source = b1;
          let target = b2;

          if (b2.isDragged || (b2.pushed && !b1.pushed)) {
            source = b2;
            target = b1;
          }

          let overlapX = 0;
          if (source.x < target.x) {
            overlapX = (source.x + source.w + spacing) - target.x;
          } else {
            overlapX = source.x - (target.x + target.w + spacing);
          }

          let overlapY = 0;
          if (source.y < target.y) {
            overlapY = (source.y + source.h + spacing) - target.y;
          } else {
            overlapY = source.y - (target.y + target.h + spacing);
          }

          if (Math.abs(overlapX) < Math.abs(overlapY)) {
            target.x += overlapX;
          } else {
            target.y += overlapY;
          }

          target.pushed = true;
        }
      }
    }
  }

  boxes.forEach(b => {
    if (b.id !== draggedWinId) {
      b.el.style.left = `${Math.round(b.x)}px`;
      b.el.style.top = `${Math.round(b.y)}px`;
      b.artifact.x = Math.round(b.x);
      b.artifact.y = Math.round(b.y);
    }
  });
}

// ---- Artifact Card DOM (Children of Feature Nodes) ----

function createArtifactCardDOM(art, change, defaults) {
  const winEl = document.createElement('div');

  if (!state.artifactUIState) {
    state.artifactUIState = {};
  }
  const defaultSize = defaults || ARTIFACT_DEFAULTS[art.type] || { width: 650, height: 450 };
  const uiState = state.artifactUIState[art.id] || {
    width: defaultSize.width,
    height: defaultSize.height,
    isCollapsed: false,
    editMode: false,
    zIndex: 10
  };
  state.artifactUIState[art.id] = uiState;

  winEl.className = `window-container change-card artifact-${art.type}`;
  winEl.id = art.id;

  const x = art.x !== null && art.x !== undefined ? Number(art.x) : 100;
  const y = art.y !== null && art.y !== undefined ? Number(art.y) : 100;

  winEl.style.left = `${x}px`;
  winEl.style.top = `${y}px`;
  winEl.style.width = `${uiState.width}px`;
  winEl.style.height = `${uiState.height}px`;
  winEl.style.zIndex = uiState.zIndex;

  if (uiState.isCollapsed) {
    winEl.classList.add('collapsed');
  }

  let typeLabel = 'Plan';
  if (art.type === 'tasks') typeLabel = 'Tasks';
  if (art.type === 'walkthrough') typeLabel = 'Walkthrough';

  winEl.innerHTML = `
    <div class="window-header" data-id="${art.id}">
      <div class="window-title-area">
        <span class="window-title-text">${typeLabel}</span>
      </div>
      <div class="window-controls">
        <button class="window-btn edit-btn tooltip ${uiState.editMode ? 'active' : ''}" data-tooltip="Toggle Editor (📝)">
          ${uiState.editMode ? ICONS.preview : ICONS.edit}
        </button>
        <button class="window-btn collapse-btn tooltip" data-tooltip="Collapse/Expand (➖)">
          ${uiState.isCollapsed ? ICONS.expand : ICONS.collapse}
        </button>
        <button class="window-btn focus-btn tooltip" data-tooltip="Focus Document (🎯)">
          ${ICONS.focus}
        </button>
        <button class="window-btn close-artifact-btn tooltip" data-tooltip="Close (✕)">
          ${ICONS.close}
        </button>
      </div>
    </div>
    <div class="window-body">
      <div class="window-editor" style="display: ${uiState.editMode ? 'block' : 'none'};">
        <textarea placeholder="Write your markdown here...">${escapeHtml(art.content || '')}</textarea>
      </div>
      <div class="markdown-preview" style="display: ${uiState.editMode ? 'none' : 'block'};"></div>
    </div>

    <div class="card-metadata-overlay" style="display: none;">
      <div class="metadata-header">
        <strong>Artifact Details</strong>
        <button class="metadata-close-btn">✕</button>
      </div>
      <div class="metadata-content">
        <div class="metadata-row">
          <span class="metadata-label">Type</span>
          <span class="metadata-val">${typeLabel}</span>
        </div>
        <div class="metadata-row">
          <span class="metadata-label">Project</span>
          <span class="metadata-val">${escapeHtml(change.project_name || change.projectName || 'Default')}</span>
        </div>
      </div>
    </div>

    <!-- Custom Resize Handles -->
    <div class="resize-handle handle-r" data-type="r"></div>
    <div class="resize-handle handle-b" data-type="b"></div>
    <div class="resize-handle handle-se" data-type="se"></div>
  `;

  canvasWorkspace.appendChild(winEl);
  renderArtifactMarkdown(art, winEl);
  setupArtifactCardEventListeners(winEl, art, change);
}

function renderArtifactMarkdown(art, winEl) {
  if (!winEl) return;
  const previewEl = winEl.querySelector('.markdown-preview');

  try {
    if (window.marked && typeof window.marked.parse === 'function') {
      previewEl.innerHTML = window.marked.parse(art.content || '');
    } else {
      previewEl.innerHTML = `<p>${(art.content || '').replace(/\n/g, '<br>')}</p>`;
    }
  } catch (err) {
    console.error("Marked parsing error:", err);
    previewEl.innerHTML = `<pre>${escapeHtml(art.content || '')}</pre>`;
  }

  const listItems = previewEl.querySelectorAll('li');
  listItems.forEach(li => {
    const text = li.innerHTML.trim();
    if (text.startsWith('[ ]')) {
      li.innerHTML = `<input type="checkbox" disabled> ${text.substring(3)}`;
    } else if (text.startsWith('[x]') || text.startsWith('[X]')) {
      li.innerHTML = `<input type="checkbox" checked disabled> ${text.substring(3)}`;
    }
  });

  if (window.mermaid) {
    const mermaidCodes = previewEl.querySelectorAll('pre code.language-mermaid');
    mermaidCodes.forEach((codeEl, idx) => {
      const preEl = codeEl.parentElement;
      const rawCode = codeEl.textContent;
      
      const mermaidDiv = document.createElement('div');
      mermaidDiv.className = 'mermaid';
      mermaidDiv.id = `mermaid-${art.id}-${idx}`;
      mermaidDiv.textContent = rawCode;
      
      preEl.replaceWith(mermaidDiv);
    });
    
    try {
      window.mermaid.init(undefined, previewEl.querySelectorAll('.mermaid'));
    } catch (e) {
      console.error("Mermaid rendering failed:", e);
    }
  }

  if (window.Prism) {
    window.Prism.highlightAllUnder(previewEl);
  }

  updateArtifactWindowScale(art, winEl);
}

function updateArtifactWindowScale(art, winEl) {
  if (!winEl) return;
  const previewEl = winEl.querySelector('.markdown-preview');
  const bodyEl = winEl.querySelector('.window-body');
  if (!previewEl || !bodyEl) return;

  const uiState = state.artifactUIState[art.id] || {};

  if (uiState.editMode) {
    previewEl.style.transform = '';
    previewEl.style.zoom = '';
    previewEl.style.width = '';
    previewEl.style.height = '';
    previewEl.style.position = '';
    bodyEl.style.overflow = 'auto';
    return;
  }

  bodyEl.style.overflow = 'hidden';

  const width = uiState.width || 650;

  if (!uiState.baseWidth || !uiState.baseHeight) {
    previewEl.style.transform = '';
    previewEl.style.zoom = '';
    previewEl.style.position = '';
    previewEl.style.width = `${width}px`;

    const naturalHeight = previewEl.scrollHeight;
    uiState.baseWidth = width;
    uiState.baseHeight = Math.max(100, naturalHeight);

    if (uiState.openComplete) {
      uiState.height = uiState.baseHeight + 42;
      winEl.style.height = `${uiState.height}px`;
      delete uiState.openComplete;
      saveState();
    }
  }

  const scale = width / uiState.baseWidth;
  previewEl.style.transform = '';
  previewEl.style.position = 'relative';
  previewEl.style.width = `${uiState.baseWidth}px`;
  previewEl.style.height = `${uiState.baseHeight}px`;
  previewEl.style.zoom = scale;
}

function setupArtifactCardEventListeners(winEl, art, change) {
  const header = winEl.querySelector('.window-header');
  const textarea = winEl.querySelector('.window-editor textarea');
  const uiState = state.artifactUIState[art.id];
  const infoBtn = winEl.querySelector('.info-btn'); // Note: Artifact cards use a different metadata structure
  const metadataOverlay = winEl.querySelector('.card-metadata-overlay');
  const metadataCloseBtn = winEl.querySelector('.metadata-close-btn');

  if (metadataCloseBtn && metadataOverlay) {
    metadataCloseBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      metadataOverlay.style.display = 'none';
    });
  }

  // Close artifact button (doesn't delete, just collapses the Feature)
  const closeBtn = winEl.querySelector('.close-artifact-btn');
  if (closeBtn) {
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      collapseFeature(change.id);
    });
  }

  winEl.addEventListener('mousedown', (e) => {
    maxZIndex++;
    uiState.zIndex = maxZIndex;
    winEl.style.zIndex = maxZIndex;
    saveState();

    document.querySelectorAll('.window-container').forEach(el => el.classList.remove('focused'));
    document.querySelectorAll('.feature-node').forEach(el => el.classList.remove('focused'));
    winEl.classList.add('focused');

    if (!uiState.editMode && winEl.classList.contains('selected')) {
      const isInteractive = e.target.closest('button, a, input, textarea, .resize-handle, .window-header, .card-metadata-overlay');
      if (!isInteractive) {
        e.preventDefault();

        const selectedWins = [];
        document.querySelectorAll('.window-container.selected, .feature-node.selected').forEach(el => {
          const wId = el.id;
          if (el.classList.contains('feature-node')) {
            const cId = wId.replace('feature_', '');
            const changeObj = state.changes.find(c => c.id === cId);
            if (changeObj) {
              selectedWins.push({
                window: changeObj,
                startWinX: Number(changeObj.x) || 0,
                startWinY: Number(changeObj.y) || 0,
                isFeatureNode: true,
                elementId: wId
              });
            }
          } else {
            const standardWin = state.windows.find(w => w.id === wId);
            const artifactWin = state.artifacts.find(a => a.id === wId);
            const targetWin = standardWin || artifactWin;
            if (targetWin) {
              selectedWins.push({
                window: targetWin,
                startWinX: targetWin.x,
                startWinY: targetWin.y,
                isArtifact: !!artifactWin,
                isFeatureNode: false
              });
            }
          }
        });

        activeDrag = {
          startX: e.clientX,
          startY: e.clientY,
          selectedWins: selectedWins
        };
      }
    }
  });

  let debounceTimer;
  textarea.addEventListener('input', (e) => {
    art.content = e.target.value;

    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      renderArtifactMarkdown(art, winEl);

      fetch(`${API_BASE}/api/artifacts/content`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: art.path,
          content: art.content
        })
      }).catch(err => console.error("Failed to save artifact content to disk:", err));
    }, 400);
  });

  winEl.querySelector('.edit-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    uiState.editMode = !uiState.editMode;

    const editor = winEl.querySelector('.window-editor');
    const preview = winEl.querySelector('.markdown-preview');
    const editBtn = e.currentTarget;

    if (uiState.editMode) {
      editor.style.display = 'block';
      preview.style.display = 'none';
      editBtn.innerHTML = ICONS.preview;
      editBtn.setAttribute('data-tooltip', 'Toggle Preview (📝)');
      textarea.focus();
    } else {
      editor.style.display = 'none';
      preview.style.display = 'block';
      editBtn.innerHTML = ICONS.edit;
      editBtn.setAttribute('data-tooltip', 'Toggle Editor (📝)');
      uiState.baseWidth = null;
      uiState.baseHeight = null;
      uiState.openComplete = true;
      renderArtifactMarkdown(art, winEl);
    }
    saveState();
  });

  winEl.querySelector('.collapse-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    uiState.isCollapsed = !uiState.isCollapsed;

    const collapseBtn = e.currentTarget;
    if (uiState.isCollapsed) {
      winEl.classList.add('collapsed');
      collapseBtn.innerHTML = ICONS.expand;
    } else {
      winEl.classList.remove('collapsed');
      collapseBtn.innerHTML = ICONS.collapse;
    }
    drawConnections();
    saveState();
  });

  winEl.querySelector('.focus-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    const viewWidth = canvasContainer.clientWidth;
    const viewHeight = canvasContainer.clientHeight;
    state.zoom = Math.max(0.6, Math.min(1.2, state.zoom));

    const artX = parseFloat(winEl.style.left) || 0;
    const artY = parseFloat(winEl.style.top) || 0;
    state.pan.x = (viewWidth / 2) - (artX + uiState.width / 2) * state.zoom;
    state.pan.y = (viewHeight / 2) - (artY + uiState.height / 2) * state.zoom;
    updateTransform();

    maxZIndex++;
    uiState.zIndex = maxZIndex;
    winEl.style.zIndex = maxZIndex;
    document.querySelectorAll('.window-container').forEach(el => el.classList.remove('focused'));
    document.querySelectorAll('.feature-node').forEach(el => el.classList.remove('focused'));
    winEl.classList.add('focused');
    saveState();
  });

  header.addEventListener('mousedown', (e) => {
    if (e.target.closest('.window-controls') || e.target.closest('.card-metadata-overlay')) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();

    maxZIndex++;
    uiState.zIndex = maxZIndex;
    winEl.style.zIndex = maxZIndex;
    document.querySelectorAll('.window-container').forEach(el => el.classList.remove('focused'));
    document.querySelectorAll('.feature-node').forEach(el => el.classList.remove('focused'));
    winEl.classList.add('focused');

    if (!winEl.classList.contains('selected')) {
      if (!e.shiftKey) {
        document.querySelectorAll('.window-container.selected, .feature-node.selected').forEach(el => el.classList.remove('selected'));
      }
      winEl.classList.add('selected');
    }

    const selectedWins = [];
    document.querySelectorAll('.window-container.selected, .feature-node.selected').forEach(el => {
      const wId = el.id;
      if (el.classList.contains('feature-node')) {
        const cId = wId.replace('feature_', '');
        const changeObj = state.changes.find(c => c.id === cId);
        if (changeObj) {
          selectedWins.push({
            window: changeObj,
            startWinX: Number(changeObj.x) || 0,
            startWinY: Number(changeObj.y) || 0,
            isFeatureNode: true,
            elementId: wId
          });
        }
      } else {
        const standardWin = state.windows.find(w => w.id === wId);
        const artifactWin = state.artifacts.find(a => a.id === wId);
        const targetWin = standardWin || artifactWin;
        if (targetWin) {
          selectedWins.push({
            window: targetWin,
            startWinX: targetWin.x,
            startWinY: targetWin.y,
            isArtifact: !!artifactWin,
            isFeatureNode: false
          });
        }
      }
    });

    activeDrag = {
      startX: e.clientX,
      startY: e.clientY,
      selectedWins: selectedWins
    };
  });

  const handles = winEl.querySelectorAll('.resize-handle');
  handles.forEach(handle => {
    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();

      maxZIndex++;
      uiState.zIndex = maxZIndex;
      winEl.style.zIndex = maxZIndex;
      document.querySelectorAll('.window-container').forEach(el => el.classList.remove('focused'));
      document.querySelectorAll('.feature-node').forEach(el => el.classList.remove('focused'));
      winEl.classList.add('focused');

      activeResize = {
        window: art,
        isArtifact: true,
        handleType: e.target.getAttribute('data-type'),
        startX: e.clientX,
        startY: e.clientY,
        startW: uiState.width,
        startH: uiState.height,
        startWinX: parseFloat(winEl.style.left) || art.x,
        startWinY: parseFloat(winEl.style.top) || art.y
      };
    });
  });
}

// ---- Elbow Connectors ----

function drawConnections() {
  const svg = document.getElementById('canvas-connections');
  if (!svg) return;

  // Ensure defs with arrow markers exist
  let defs = svg.querySelector('defs');
  if (!defs) {
    defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    svg.appendChild(defs);
  }

  // Create color-coded arrow markers
  const colors = {
    plan: 'rgba(99, 102, 241, 0.8)',
    tasks: 'rgba(6, 182, 212, 0.8)',
    walkthrough: 'rgba(16, 185, 129, 0.8)'
  };

  Object.entries(colors).forEach(([type, color]) => {
    let marker = defs.querySelector(`#arrow-${type}`);
    if (!marker) {
      marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
      marker.setAttribute('id', `arrow-${type}`);
      marker.setAttribute('viewBox', '0 0 10 10');
      marker.setAttribute('refX', '8');
      marker.setAttribute('refY', '5');
      marker.setAttribute('markerWidth', '6');
      marker.setAttribute('markerHeight', '6');
      marker.setAttribute('orient', 'auto-start-reverse');
      const arrowPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      arrowPath.setAttribute('d', 'M 0 1.5 L 8 5 L 0 8.5 z');
      arrowPath.setAttribute('fill', color);
      marker.appendChild(arrowPath);
      defs.appendChild(marker);
    }
  });

  // Clear existing paths
  svg.querySelectorAll('path').forEach(p => p.remove());

  // Only draw connections for the expanded Feature
  if (!expandedChangeId) return;

  const featureEl = document.getElementById(`feature_${expandedChangeId}`);
  if (!featureEl) return;

  const artifacts = state.artifacts.filter(a => a.change_id === expandedChangeId);

  artifacts.forEach(art => {
    const childEl = document.getElementById(art.id);
    if (!childEl) return;
    drawElbow(featureEl, childEl, art.type);
  });
}

function drawElbow(featureEl, childEl, type) {
  const svg = document.getElementById('canvas-connections');
  if (!svg) return;

  // Feature Node bottom-center
  const fX = parseFloat(featureEl.style.left) || 0;
  const fY = parseFloat(featureEl.style.top) || 0;
  const fW = featureEl.offsetWidth || 280;
  const fH = featureEl.offsetHeight || 180;

  const startX = fX + fW / 2;
  const startY = fY + fH;

  // Child header top-center
  const cX = parseFloat(childEl.style.left) || 0;
  const cY = parseFloat(childEl.style.top) || 0;
  const cW = childEl.offsetWidth || 650;

  const endX = cX + cW / 2;
  const endY = cY;

  // Elbow routing: vertical down → horizontal → vertical down
  const midY = startY + (endY - startY) / 2;

  // Build orthogonal path
  const d = `M ${startX} ${startY} L ${startX} ${midY} L ${endX} ${midY} L ${endX} ${endY}`;

  const strokeColors = {
    plan: 'rgba(99, 102, 241, 0.6)',
    tasks: 'rgba(6, 182, 212, 0.6)',
    walkthrough: 'rgba(16, 185, 129, 0.6)'
  };

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', d);
  path.setAttribute('stroke', strokeColors[type] || 'rgba(99, 102, 241, 0.6)');
  path.setAttribute('stroke-width', '2');
  path.setAttribute('fill', 'none');
  path.setAttribute('marker-end', `url(#arrow-${type})`);
  path.setAttribute('stroke-dasharray', '6 3');
  path.style.opacity = '0.8';

  svg.appendChild(path);
}

// ---- Render Pipeline ----

function renderChangeNodes() {
  // Remove old artifact cards and change nodes
  document.querySelectorAll('.window-container.change-card').forEach(el => el.remove());
  document.querySelectorAll('.window-container.change-node').forEach(el => el.remove());

  const deletedIds = state.deletedChangeIds || [];

  // Remove old Feature Nodes that no longer exist in state or are deleted
  document.querySelectorAll('.feature-node').forEach(el => {
    const changeId = el.id.replace('feature_', '');
    const isDeleted = deletedIds.includes(changeId);
    if (!state.changes.find(c => c.id === changeId) || isDeleted) {
      el.remove();
    }
  });

  const visibleChanges = state.changes.filter(c => !deletedIds.includes(c.id));

  // Create/update Feature Nodes for each visible change
  visibleChanges.forEach(change => {
    const changeArtifacts = state.artifacts.filter(art => art.change_id === change.id);
    createFeatureNodeDOM(change, changeArtifacts);
  });

  // If a Feature was expanded, re-expand it
  if (expandedChangeId) {
    const stillExists = visibleChanges.find(c => c.id === expandedChangeId);
    if (stillExists) {
      // Re-create artifact cards if they're not in the DOM
      const artifacts = state.artifacts.filter(a => a.change_id === expandedChangeId);
      const anyChildInDOM = artifacts.some(a => document.getElementById(a.id));
      if (!anyChildInDOM && artifacts.length > 0) {
        const change = stillExists;
        artifacts.forEach(art => {
          const defaults = ARTIFACT_DEFAULTS[art.type] || { width: 650, height: 450 };
          createArtifactCardDOM(art, change, defaults);
        });
      }
    } else {
      expandedChangeId = null;
    }
  }

  drawConnections();
}

function syncWithServer() {
  fetch(`${API_BASE}/api/changes`)
    .then(res => res.json())
    .then(data => {
      if (data.success) {
        isServerConnected = true;
        state.changes = (data.changes || []).map(c => {
          c.id = String(c.id);
          return c;
        });
        state.features = (data.features || []).map(f => {
          f.id = String(f.id);
          return f;
        });
        state.projects = data.projects || [];
        state.artifacts = (data.artifacts || []).map(art => {
          art.id = String(art.id);
          art.change_id = String(art.change_id);
          return art;
        });

        // Set workspace identity if available from server config
        if (data.config) {
          state.workspaceId = data.config.workspaceId;
          state.workspaceName = data.config.workspaceName;
          state.createdAt = data.config.createdAt;
        }
        
        renderChangeNodes();
      }
    })
    .catch(err => {
      isServerConnected = false;
      console.warn("Express server is not running locally. Operating in standalone mode.");
    });

  if (isServerConnected) {
    fetch(`${API_BASE}/api/inbox`)
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          const normalizedInbox = (data.inbox || []).map(item => {
            item.id = String(item.id);
            return item;
          });
          renderInboxList(normalizedInbox);
        }
      })
      .catch(err => {
        // Ignored
      });
  }
}


let selectedProjectFilter = 'all';

function updateProjectFilterDropdown(projects) {
  const select = document.getElementById('inbox-project-filter');
  if (!select) return;

  const currentValue = select.value;
  select.innerHTML = '<option value="all">All Projects</option>';

  projects.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p;
    opt.textContent = p;
    select.appendChild(opt);
  });

  const exists = Array.from(select.options).some(opt => opt.value === currentValue);
  if (exists) {
    select.value = currentValue;
  } else {
    selectedProjectFilter = 'all';
    select.value = 'all';
  }
}

function renderInboxList(inboxItems) {
  state.inboxItems = inboxItems;
  
  const projects = [];
  inboxItems.forEach(item => {
    if (item.projectName && !projects.includes(item.projectName)) {
      projects.push(item.projectName);
    }
  });
  updateProjectFilterDropdown(projects);

  const inboxListEl = document.getElementById('inbox-list');
  const badgeEl = document.getElementById('inbox-badge');
  
  inboxListEl.innerHTML = '';
  
  const filteredItems = inboxItems.filter(item => {
    if (selectedProjectFilter === 'all') return true;
    return item.projectName === selectedProjectFilter;
  });

  badgeEl.textContent = inboxItems.length;
  badgeEl.style.display = inboxItems.length > 0 ? 'inline-block' : 'none';

  if (filteredItems.length === 0) {
    inboxListEl.innerHTML = '<div style="color:var(--text-muted); font-size:13px; text-align:center; padding:20px;">No pending changes for this project</div>';
    return;
  }

  filteredItems.forEach(item => {
    const li = document.createElement('li');
    li.className = 'inbox-item';
    
    let filesList = '';
    if (item.planPath) filesList += `<div class="inbox-item-file"><span class="inbox-item-file-dot"></span>Plan</div>`;
    if (item.tasksPath) filesList += `<div class="inbox-item-file"><span class="inbox-item-file-dot"></span>Tasks</div>`;
    if (item.walkthroughPath) filesList += `<div class="inbox-item-file"><span class="inbox-item-file-dot"></span>Walkthrough</div>`;

    const timeAgoStr = formatRelativeTime(item.updatedAt);

    li.innerHTML = `
      <div class="inbox-item-meta">
        <span class="badge-agent" title="Source Agent: ${escapeHtml(item.sourceAgent)}">${escapeHtml(item.sourceAgent)}</span>
        <span class="badge-project" title="Full Path: ${escapeHtml(item.projectPath)}">${escapeHtml(item.projectName)}</span>
        <span class="inbox-item-time">${escapeHtml(timeAgoStr)}</span>
      </div>
      <div class="inbox-item-title">${escapeHtml(item.title)}</div>
      <div class="inbox-item-files">${filesList}</div>
      <div class="inbox-item-actions">
        <button class="inbox-item-btn discard-inbox-btn" data-id="${item.id}">Discard</button>
        <button class="inbox-item-btn accept accept-inbox-btn" data-id="${item.id}">Accept</button>
      </div>
    `;

    li.querySelector('.accept-inbox-btn').addEventListener('click', (e) => {
      const inboxId = e.currentTarget.getAttribute('data-id');
      const itemToAccept = inboxItems.find(x => x.id === inboxId);
      if (itemToAccept) {
        currentInboxItemToAccept = itemToAccept;
        document.getElementById('change-title-input').value = itemToAccept.title;
        document.getElementById('change-feature-input').value = '';
        document.getElementById('accept-modal').style.display = 'flex';
      }
    });

    li.querySelector('.discard-inbox-btn').addEventListener('click', (e) => {
      const inboxId = e.currentTarget.getAttribute('data-id');
      if (confirm("Discard this change candidate?")) {
        fetch(`${API_BASE}/api/inbox/discard`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: inboxId })
        })
        .then(res => res.json())
        .then(data => {
          if (data.success) {
            syncWithServer();
          }
        });
      }
    });

    inboxListEl.appendChild(li);
  });
}

function formatRelativeTime(timestamp) {
  if (!timestamp) return 'unknown';
  const diff = Date.now() - timestamp;
  const secs = Math.floor(diff / 1000);
  const mins = Math.floor(secs / 60);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);

  if (secs < 60) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderMarkdown(winId) {
  const win = state.windows.find(w => w.id === winId);
  if (!win) return;

  const winEl = document.getElementById(winId);
  if (!winEl) return;

  const previewEl = winEl.querySelector('.markdown-preview');
  
  // Set parsed markdown
  try {
    // If marked is available via script CDN
    if (window.marked && typeof window.marked.parse === 'function') {
      previewEl.innerHTML = window.marked.parse(win.content);
    } else {
      // Simple fallback if script is blocked or offline
      previewEl.innerHTML = `<p>${win.content.replace(/\n/g, '<br>')}</p>`;
    }
  } catch (err) {
    console.error("Marked parsing error:", err);
    previewEl.innerHTML = `<pre>${escapeHtml(win.content)}</pre>`;
  }

  // Handle tasks lists checkboxes
  const listItems = previewEl.querySelectorAll('li');
  listItems.forEach(li => {
    const text = li.innerHTML.trim();
    if (text.startsWith('[ ]')) {
      li.innerHTML = `<input type="checkbox" disabled> ${text.substring(3)}`;
    } else if (text.startsWith('[x]') || text.startsWith('[X]')) {
      li.innerHTML = `<input type="checkbox" checked disabled> ${text.substring(3)}`;
    }
  });

  // Code Highlighting with Prism
  if (window.mermaid) {
    const mermaidCodes = previewEl.querySelectorAll('pre code.language-mermaid');
    mermaidCodes.forEach((codeEl, idx) => {
      const preEl = codeEl.parentElement;
      const rawCode = codeEl.textContent;
      
      const mermaidDiv = document.createElement('div');
      mermaidDiv.className = 'mermaid';
      mermaidDiv.id = `mermaid-${winId}-${idx}`;
      mermaidDiv.textContent = rawCode;
      
      preEl.replaceWith(mermaidDiv);
    });
    
    try {
      window.mermaid.init(undefined, previewEl.querySelectorAll('.mermaid'));
    } catch (e) {
      console.error("Mermaid rendering failed:", e);
    }
  }

  if (window.Prism) {
    window.Prism.highlightAllUnder(previewEl);
  }

  updateWindowScale(win, winEl);
}

function updateWindowScale(win, winEl) {
  if (!winEl) return;
  const previewEl = winEl.querySelector('.markdown-preview');
  const bodyEl = winEl.querySelector('.window-body');
  if (!previewEl || !bodyEl) return;

  if (win.editMode) {
    // Reset styles for edit mode so normal editing scroll is preserved
    previewEl.style.transform = '';
    previewEl.style.zoom = '';
    previewEl.style.width = '';
    previewEl.style.height = '';
    previewEl.style.position = '';
    bodyEl.style.overflow = 'auto';
    return;
  }

  bodyEl.style.overflow = 'hidden';

  // If base dimensions are not set, calculate them
  if (!win.baseWidth || !win.baseHeight) {
    // Reset styles to get the natural base dimensions
    previewEl.style.transform = '';
    previewEl.style.zoom = '';
    previewEl.style.position = '';
    previewEl.style.width = '100%';
    previewEl.style.height = 'auto';
    
    const currentWidth = win.width || 450;
    previewEl.style.width = `${currentWidth}px`;
    
    const naturalHeight = previewEl.scrollHeight;
    
    win.baseWidth = currentWidth;
    win.baseHeight = Math.max(100, naturalHeight);

    if (win.openComplete) {
      win.height = win.baseHeight + 42; // 42 is header height
      winEl.style.height = `${win.height}px`;
      delete win.openComplete;
      saveState();
    }
  }

  // Calculate the scaling factor
  const scale = win.width / win.baseWidth;

  // Apply native CSS zoom scaling
  previewEl.style.transform = '';
  previewEl.style.position = 'relative';
  previewEl.style.width = `${win.baseWidth}px`;
  previewEl.style.height = `${win.baseHeight}px`;
  previewEl.style.zoom = scale;
}

function focusWindow(winId) {
  // Bring window to top of stack
  const win = state.windows.find(w => w.id === winId);
  if (!win) return;

  maxZIndex++;
  win.zIndex = maxZIndex;
  
  const winEl = document.getElementById(winId);
  if (winEl) {
    winEl.style.zIndex = maxZIndex;
    
    // Remove focused class from all windows and add to active one
    document.querySelectorAll('.window-container').forEach(el => el.classList.remove('focused'));
    winEl.classList.add('focused');
  }

  // Update active status in Sidebar
  document.querySelectorAll('.file-item').forEach(el => el.classList.remove('active'));
  const sidebarItem = document.querySelector(`.file-item[data-id="${winId}"]`);
  if (sidebarItem) {
    sidebarItem.classList.add('active');
  }

  saveState();
}

function centerOnWindow(winId) {
  const win = state.windows.find(w => w.id === winId);
  if (!win) return;

  // Align workspace coordinates to focus window in the middle of viewport
  const viewWidth = canvasContainer.clientWidth;
  const viewHeight = canvasContainer.clientHeight;

  // Target zoom: default to 1.0, or keep current zoom if reasonable
  state.zoom = Math.max(0.6, Math.min(1.2, state.zoom));

  // Compute layout coordinates to place window center exactly at screen center
  state.pan.x = (viewWidth / 2) - (win.x + win.width / 2) * state.zoom;
  state.pan.y = (viewHeight / 2) - (win.y + win.height / 2) * state.zoom;

  updateTransform();
  focusWindow(winId);
}

function setupWindowEventListeners(winEl, win) {
  const header = winEl.querySelector('.window-header');
  const titleInput = winEl.querySelector('.window-title-input');
  const textarea = winEl.querySelector('.window-editor textarea');
  const body = winEl.querySelector('.window-body');

  // Focus on mouse down inside window
  winEl.addEventListener('mousedown', (e) => {
    // Focus window
    focusWindow(win.id);

    // Group dragging check
    if (!win.editMode && winEl.classList.contains('selected')) {
      const isInteractive = e.target.closest('button, a, input, textarea, .resize-handle, .window-header');
      if (!isInteractive) {
        e.preventDefault();
        
        const selectedWins = [];
        document.querySelectorAll('.window-container.selected').forEach(el => {
          const wId = el.id;
          const standardWin = state.windows.find(w => w.id === wId);
          const changeWin = state.changes.find(c => c.id === wId);
          const targetWin = standardWin || changeWin;
          if (targetWin) {
            selectedWins.push({
              window: targetWin,
              startWinX: targetWin.x,
              startWinY: targetWin.y,
              isChangeNode: !!changeWin
            });
          }
        });

        activeDrag = {
          startX: e.clientX,
          startY: e.clientY,
          selectedWins: selectedWins
        };
      }
    }
  });

  // Rename action
  titleInput.addEventListener('change', (e) => {
    const newName = e.target.value.trim() || 'Untitled.md';
    win.name = newName;
    titleInput.value = newName;
    updateSidebar();
    saveState();
  });

  titleInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      titleInput.blur();
    }
  });

  // Content edit updates (debounced)
  let debounceTimer;
  textarea.addEventListener('input', (e) => {
    win.content = e.target.value;
    
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      renderMarkdown(win.id);
      saveState();
    }, 300);
  });

  // Action Buttons
  winEl.querySelector('.edit-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    win.editMode = !win.editMode;
    
    const editor = winEl.querySelector('.window-editor');
    const preview = winEl.querySelector('.markdown-preview');
    const editBtn = e.currentTarget;

    if (win.editMode) {
      editor.style.display = 'block';
      preview.style.display = 'none';
      editBtn.innerHTML = ICONS.preview;
      editBtn.setAttribute('data-tooltip', 'Toggle Preview (📝)');
      textarea.focus();
      titleInput.removeAttribute('disabled');
      titleInput.setAttribute('title', 'Edit title');
    } else {
      editor.style.display = 'none';
      preview.style.display = 'block';
      editBtn.innerHTML = ICONS.edit;
      editBtn.setAttribute('data-tooltip', 'Toggle Editor (📝)');
      titleInput.setAttribute('disabled', 'true');
      titleInput.setAttribute('title', 'Rename possible in Edit mode');
      win.baseWidth = null;
      win.baseHeight = null;
      win.openComplete = true;
      renderMarkdown(win.id);
    }
    saveState();
  });

  winEl.querySelector('.collapse-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    win.isCollapsed = !win.isCollapsed;
    
    const collapseBtn = e.currentTarget;
    if (win.isCollapsed) {
      winEl.classList.add('collapsed');
      collapseBtn.innerHTML = ICONS.expand;
      collapseBtn.setAttribute('data-tooltip', 'Expand Document (➖)');
    } else {
      winEl.classList.remove('collapsed');
      collapseBtn.innerHTML = ICONS.collapse;
      collapseBtn.setAttribute('data-tooltip', 'Collapse Document (➖)');
    }
    saveState();
  });

  winEl.querySelector('.focus-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    centerOnWindow(win.id);
  });

  winEl.querySelector('.close-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    removeWindow(win.id);
  });

  // Drag handler start
  header.addEventListener('mousedown', (e) => {
    // Avoid dragging when typing in the title or pressing buttons
    if (e.target.tagName === 'INPUT' || e.target.closest('.window-controls')) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    focusWindow(win.id);

    // If card is not selected, select it
    if (!winEl.classList.contains('selected')) {
      if (!e.shiftKey) {
        document.querySelectorAll('.window-container.selected').forEach(el => el.classList.remove('selected'));
      }
      winEl.classList.add('selected');
    }
    
    // Gather all selected windows and their starting coordinates
    const selectedWins = [];
    document.querySelectorAll('.window-container.selected').forEach(el => {
      const wId = el.id;
      const standardWin = state.windows.find(w => w.id === wId);
      const changeWin = state.changes.find(c => c.id === wId);
      const targetWin = standardWin || changeWin;
      if (targetWin) {
        selectedWins.push({
          window: targetWin,
          startWinX: targetWin.x,
          startWinY: targetWin.y,
          isChangeNode: !!changeWin
        });
      }
    });

    activeDrag = {
      startX: e.clientX,
      startY: e.clientY,
      selectedWins: selectedWins
    };
  });

  // Resize handlers start
  const handles = winEl.querySelectorAll('.resize-handle');
  handles.forEach(handle => {
    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      focusWindow(win.id);

      activeResize = {
        window: win,
        handleType: e.target.getAttribute('data-type'),
        startX: e.clientX,
        startY: e.clientY,
        startW: win.width,
        startH: win.height,
        startWinX: win.x,
        startWinY: win.y
      };
    });
  });
}

function removeWindow(winId) {
  // Remove from state
  state.windows = state.windows.filter(w => w.id !== winId);
  
  // Remove from DOM
  const winEl = document.getElementById(winId);
  if (winEl) {
    winEl.remove();
  }

  updateSidebar();
  toggleOnboarding();
  saveState();
}

function createNewNote(x = null, y = null) {
  // If coordinates are not specified, place in center of viewport
  if (x === null || y === null) {
    const viewWidth = canvasContainer.clientWidth;
    const viewHeight = canvasContainer.clientHeight;
    // Calculate layout coords corresponding to center of screen
    x = (viewWidth / 2 - panOffsetCorrection().x) / state.zoom - 200;
    y = (viewHeight / 2 - panOffsetCorrection().y) / state.zoom - 150;
  }

  const newWin = {
    id: generateId(),
    name: `Note_${state.windows.length + 1}.md`,
    content: `# New Note\n\nDouble click to edit title or click the edit icon (📝) in the header to change contents.`,
    x: Math.round(x),
    y: Math.round(y),
    width: 400,
    height: 300,
    zIndex: ++maxZIndex,
    isCollapsed: false,
    editMode: true,
    openComplete: true
  };

  state.windows.push(newWin);
  createWindowDOM(newWin);
  updateSidebar();
  toggleOnboarding();
  focusWindow(newWin.id);
  saveState();
}

function createNoteWithContent(title, content) {
  const viewWidth = canvasContainer.clientWidth;
  const viewHeight = canvasContainer.clientHeight;
  const x = (viewWidth / 2 - state.pan.x) / state.zoom - 200;
  const y = (viewHeight / 2 - state.pan.y) / state.zoom - 150;

  const newWin = {
    id: generateId(),
    name: title,
    content: content,
    x: Math.round(x),
    y: Math.round(y),
    width: 450,
    height: 350,
    zIndex: ++maxZIndex,
    isCollapsed: false,
    editMode: false,
    openComplete: true
  };

  state.windows.push(newWin);
  createWindowDOM(newWin);
  updateSidebar();
  toggleOnboarding();
  focusWindow(newWin.id);
  saveState();
}

function panOffsetCorrection() {
  return { x: state.pan.x, y: state.pan.y };
}

// ----------------------------------------------------
// Sidebar Explorer Controls
// ----------------------------------------------------
function updateSidebar() {
  const searchQuery = searchInput.value.toLowerCase();
  fileListEl.innerHTML = '';

  const filteredWindows = state.windows.filter(w => 
    w.name.toLowerCase().includes(searchQuery) || 
    w.content.toLowerCase().includes(searchQuery)
  );

  filteredWindows.forEach(win => {
    const li = document.createElement('li');
    li.className = `file-item ${document.getElementById(win.id)?.classList.contains('focused') ? 'active' : ''}`;
    li.setAttribute('data-id', win.id);
    
    li.innerHTML = `
      <div class="file-item-info">
        <span class="file-item-icon">${ICONS.file}</span>
        <span class="file-item-name">${escapeHtml(win.name)}</span>
      </div>
      <div class="file-item-actions">
        <button class="file-action-btn focus-btn-sb" title="Center view">🎯</button>
        <button class="file-action-btn danger delete-btn-sb" title="Delete note">✕</button>
      </div>
    `;

    // Click on item focuses and centers
    li.addEventListener('click', (e) => {
      if (e.target.classList.contains('delete-btn-sb')) {
        e.stopPropagation();
        removeWindow(win.id);
      } else {
        centerOnWindow(win.id);
      }
    });

    fileListEl.appendChild(li);
  });
}

// ----------------------------------------------------
// Drag and Drop Files Controller
// ----------------------------------------------------
function handleFileUpload(files) {
  let loadedCount = 0;
  const viewWidth = canvasContainer.clientWidth;
  const viewHeight = canvasContainer.clientHeight;

  // Position newly uploaded files in a cascading grid fashion in the center of workspace
  let offsetX = (viewWidth / 2 - state.pan.x) / state.zoom - 225;
  let offsetY = (viewHeight / 2 - state.pan.y) / state.zoom - 200;

  Array.from(files).forEach((file, index) => {
    if (!file.name.endsWith('.md')) return;

    const reader = new FileReader();
    reader.onload = function(e) {
      const content = e.target.result;
      
      const newWin = {
        id: generateId(),
        name: file.name,
        content: content,
        x: offsetX + (index * 30),
        y: offsetY + (index * 30),
        width: 450,
        height: 400,
        zIndex: ++maxZIndex,
        isCollapsed: false,
        editMode: false,
        openComplete: true
      };

      state.windows.push(newWin);
      createWindowDOM(newWin);
      
      loadedCount++;
      if (loadedCount === files.length || index === files.length - 1) {
        updateSidebar();
        toggleOnboarding();
        // Focus the last added window
        focusWindow(newWin.id);
        saveState();
      }
    };
    reader.readAsText(file);
  });
}

// Drag & Drop visual overlays on empty canvas
function setupDragAndDrop() {
  window.addEventListener('dragenter', (e) => {
    e.preventDefault();
  });

  window.addEventListener('dragover', (e) => {
    e.preventDefault();
  });

  window.addEventListener('drop', (e) => {
    e.preventDefault();
    if (e.dataTransfer.files.length > 0) {
      handleFileUpload(e.dataTransfer.files);
    }
  });
}

// Fit screen to view all windows on canvas
function fitAllWindows() {
  if (state.windows.length === 0) return;

  // Find bounding box enclosing all windows
  let minX = Infinity, minY = Infinity;
  let maxX = -Infinity, maxY = -Infinity;

  state.windows.forEach(w => {
    if (w.x < minX) minX = w.x;
    if (w.y < minY) minY = w.y;
    if (w.x + w.width > maxX) maxX = w.x + w.width;
    if (w.y + w.height > maxY) maxY = w.y + w.height;
  });

  // Bounding box dimensions
  const bboxW = maxX - minX;
  const bboxH = maxY - minY;

  const viewW = canvasContainer.clientWidth;
  const viewH = canvasContainer.clientHeight;
  const padding = 60; // Padding space around border

  // Calculate scales for width and height
  const scaleX = (viewW - padding * 2) / bboxW;
  const scaleY = (viewH - padding * 2) / bboxH;
  
  // Choose zoom level to fit both axes comfortably
  let idealZoom = Math.min(scaleX, scaleY);
  idealZoom = Math.max(0.2, Math.min(1.2, idealZoom)); // restrict bounds

  state.zoom = idealZoom;

  // Center pan coordinates relative to bounding box
  const bboxCenterX = minX + bboxW / 2;
  const bboxCenterY = minY + bboxH / 2;

  state.pan.x = viewW / 2 - bboxCenterX * state.zoom;
  state.pan.y = viewH / 2 - bboxCenterY * state.zoom;

  updateTransform();
  saveState();
}

// Load default onboarding structure
function loadSampleWorkspace() {
  const viewWidth = canvasContainer.clientWidth;
  const viewHeight = canvasContainer.clientHeight;

  // Center coordinates
  const centerX = (viewWidth / 2 - state.pan.x) / state.zoom;
  const centerY = (viewHeight / 2 - state.pan.y) / state.zoom;

  const sampleWindows = [
    {
      id: 'win_sample_readme',
      name: 'README.md',
      content: DEFAULT_MD_CONTENT,
      x: centerX - 225,
      y: centerY - 200,
      width: 450,
      height: 400,
      zIndex: 10,
      isCollapsed: false,
      editMode: false
    }
  ];

  state.windows = sampleWindows;
  state.windows.forEach(w => createWindowDOM(w));
  updateSidebar();
  toggleOnboarding();
  focusWindow('win_sample_readme');
  saveState();
}

function setActiveTool(tool) {
  state.activeTool = tool;

  const selectBtn = document.getElementById('tool-select-btn');
  const panBtn = document.getElementById('tool-pan-btn');

  if (tool === 'select') {
    selectBtn?.classList.add('active');
    panBtn?.classList.remove('active');
    canvasContainer.style.cursor = 'default';
    canvasContainer.classList.remove('pan-mode');
  } else {
    selectBtn?.classList.remove('active');
    panBtn?.classList.add('active');
    canvasContainer.style.cursor = 'grab';
    canvasContainer.classList.add('pan-mode');
    
    // Deselect all selected windows when entering pan mode
    document.querySelectorAll('.window-container.selected, .feature-node.selected').forEach(el => el.removeProperty ? el.removeProperty('selected') : el.classList.remove('selected'));
  }
  saveState();
}

// ----------------------------------------------------
// Global DOM Event Bindings
// ----------------------------------------------------
function init() {
  loadState();
  applyTheme();
  
  if (window.mermaid) {
    window.mermaid.initialize({
      startOnLoad: false,
      theme: state.theme === 'dark' ? 'dark' : 'default',
      securityLevel: 'loose'
    });
  }
  
  // Recreate windows from saved state
  state.windows.forEach(w => createWindowDOM(w));
  updateTransform();
  updateSidebar();
  toggleOnboarding();
  setupDragAndDrop();

  // Set active tool and cursor state
  setActiveTool(state.activeTool || 'select');

  // Resize handler updates on window scale
  window.addEventListener('resize', () => {
    updateTransform();
  });

  // Track spacebar holds for panning toggle, Escape key, and V/H shortcuts
  window.addEventListener('keydown', (e) => {
    if (document.activeElement.tagName === 'TEXTAREA' || document.activeElement.tagName === 'INPUT') {
      return;
    }
    if (e.code === 'Space') {
      e.preventDefault(); // Prevent page scrolling
      isSpacePressed = true;
      if (!isPanning) {
        canvasContainer.style.cursor = 'grab';
      }
    }
    if (e.key === 'Escape') {
      document.querySelectorAll('.window-container.selected, .feature-node.selected').forEach(el => el.classList.remove('selected'));
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      const selected = document.querySelectorAll('.window-container.selected, .feature-node.selected');
      if (selected.length > 0) {
        e.preventDefault();
        if (confirm(`Remove the ${selected.length} selected item(s) from the canvas?`)) {
          selected.forEach(el => {
            const id = el.id;
            if (el.classList.contains('feature-node')) {
              const changeId = id.replace('feature_', '');
              if (expandedChangeId === changeId) {
                collapseFeature(changeId);
              }
              if (!state.deletedChangeIds) {
                state.deletedChangeIds = [];
              }
              if (!state.deletedChangeIds.includes(changeId)) {
                state.deletedChangeIds.push(changeId);
              }
              el.remove();
            } else {
              // Standard note
              state.windows = state.windows.filter(w => w.id !== id);
              el.remove();
            }
          });
          saveState();
          updateSidebar();
          toggleOnboarding();
          drawConnections();
        }
      }
    }
    if (e.key === 'v' || e.key === 'V') {
      setActiveTool('select');
    }
    if (e.key === 'h' || e.key === 'H') {
      setActiveTool('pan');
    }
  });

  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space') {
      isSpacePressed = false;
      if (!isPanning) {
        canvasContainer.style.cursor = state.activeTool === 'pan' ? 'grab' : 'default';
      }
    }
  });

  // Canvas Mouse Down - Drag background to Pan / Marquee Selection
  canvasContainer.addEventListener('mousedown', (e) => {
    const isBackground = e.target === canvasContainer || e.target === canvasGrid;
    
    if (state.activeTool === 'pan' || isSpacePressed || e.button === 1) {
      if (isBackground || isSpacePressed || e.button === 1) {
        e.preventDefault();
        isPanning = true;
        canvasContainer.style.cursor = 'grabbing';
        startMouse.x = e.clientX;
        startMouse.y = e.clientY;
        startPan.x = state.pan.x;
        startPan.y = state.pan.y;
      }
    } else if (state.activeTool === 'select' && e.button === 0) {
      if (isBackground) {
        e.preventDefault();
        isSelecting = true;
        selectionStart.x = e.clientX;
        selectionStart.y = e.clientY;
        
        // Deselect all windows/elements
        document.querySelectorAll('.window-container.selected, .feature-node.selected').forEach(el => el.classList.remove('selected'));
        
        // Create selection box element
        selectionBoxEl = document.createElement('div');
        selectionBoxEl.className = 'selection-box';
        selectionBoxEl.style.left = `${e.clientX}px`;
        selectionBoxEl.style.top = `${e.clientY}px`;
        selectionBoxEl.style.width = '0px';
        selectionBoxEl.style.height = '0px';
        document.body.appendChild(selectionBoxEl);
      }
    }
  });

  // Double click canvas background to spawn new note
  canvasContainer.addEventListener('dblclick', (e) => {
    const isBackground = e.target === canvasContainer || e.target === canvasGrid;
    if (isBackground) {
      e.preventDefault();
      // Mouse coordinates in screen space, corrected to canvas layout coordinates
      const rect = canvasContainer.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      
      const canvasX = (mouseX - state.pan.x) / state.zoom;
      const canvasY = (mouseY - state.pan.y) / state.zoom;
      
      // Spawn new note at mouse click site
      createNewNote(canvasX - 200, canvasY - 150);
    }
  });

  // Mouse Move tracking for Drag, Resize, Selection, Pan actions
  window.addEventListener('mousemove', (e) => {
    // 1. Pan Action
    if (isPanning) {
      const dx = e.clientX - startMouse.x;
      const dy = e.clientY - startMouse.y;
      state.pan.x = startPan.x + dx;
      state.pan.y = startPan.y + dy;
      updateTransform();
      saveState();
    }

    // 2. Selection Action (Marquee)
    else if (isSelecting && selectionBoxEl) {
      const x1 = Math.min(e.clientX, selectionStart.x);
      const x2 = Math.max(e.clientX, selectionStart.x);
      const y1 = Math.min(e.clientY, selectionStart.y);
      const y2 = Math.max(e.clientY, selectionStart.y);

      selectionBoxEl.style.left = `${x1}px`;
      selectionBoxEl.style.top = `${y1}px`;
      selectionBoxEl.style.width = `${x2 - x1}px`;
      selectionBoxEl.style.height = `${y2 - y1}px`;

      // Check intersections with all cards
      const boxRect = { left: x1, top: y1, right: x2, bottom: y2 };
      document.querySelectorAll('.window-container, .feature-node').forEach(winEl => {
        const winRect = winEl.getBoundingClientRect();
        const intersects = !(boxRect.right < winRect.left || 
                             boxRect.left > winRect.right || 
                             boxRect.bottom < winRect.top || 
                             boxRect.top > winRect.bottom);
        if (intersects) {
          winEl.classList.add('selected');
        } else {
          winEl.classList.remove('selected');
        }
      });
    }

    // 3. Drag Action (Header Drag - with Group Drag support)
    else if (activeDrag) {
      const dx = (e.clientX - activeDrag.startX) / state.zoom;
      const dy = (e.clientY - activeDrag.startY) / state.zoom;
      
      activeDrag.selectedWins.forEach(item => {
        const win = item.window;
        win.x = Math.round(item.startWinX + dx);
        win.y = Math.round(item.startWinY + dy);

        const elementId = item.elementId || win.id;
        const winEl = document.getElementById(elementId);
        if (winEl) {
          winEl.style.left = `${win.x}px`;
          winEl.style.top = `${win.y}px`;
        }

        // Real-time collision avoidance for sibling artifact windows
        if (item.isArtifact && win.change_id === expandedChangeId) {
          resolveChildCollisions(win.id);
        }
      });
      drawConnections();
    }
 
    // 4. Resize Action (Edge / Corner Resize)
    else if (activeResize) {
      const dx = (e.clientX - activeResize.startX) / state.zoom;
      const dy = (e.clientY - activeResize.startY) / state.zoom;
      
      const win = activeResize.window;
      const winEl = document.getElementById(win.id);
      
      if (!winEl) return;
 
      if (activeResize.isArtifact) {
        const uiState = state.artifactUIState[win.id];
        if (!uiState.baseWidth || !uiState.baseHeight) {
          uiState.baseWidth = uiState.width || 420;
          uiState.baseHeight = (uiState.height || 320) - 42;
        }

        let scale = 1.0;
        if (activeResize.handleType === 'r') {
          const targetWidth = Math.max(200, activeResize.startW + dx);
          scale = targetWidth / uiState.baseWidth;
        } else if (activeResize.handleType === 'b') {
          const targetHeight = Math.max(120, activeResize.startH + dy);
          scale = (targetHeight - 42) / uiState.baseHeight;
        } else if (activeResize.handleType === 'se') {
          const targetWidth = Math.max(200, activeResize.startW + dx);
          const targetHeight = Math.max(120, activeResize.startH + dy);
          const scaleX = targetWidth / uiState.baseWidth;
          const scaleY = (targetHeight - 42) / uiState.baseHeight;
          scale = Math.max(scaleX, scaleY);
        }

        const minScaleW = 200 / uiState.baseWidth;
        const minScaleH = (120 - 42) / uiState.baseHeight;
        const minScale = Math.max(minScaleW, minScaleH);
        scale = Math.max(minScale, scale);

        uiState.width = Math.round(uiState.baseWidth * scale);
        uiState.height = Math.round(uiState.baseHeight * scale + 42);

        winEl.style.width = `${uiState.width}px`;
        winEl.style.height = `${uiState.height}px`;

        updateArtifactWindowScale(win, winEl);
        drawConnections();
      } else {
        // Ensure base dimensions are cached
        if (!win.baseWidth || !win.baseHeight) {
          win.baseWidth = win.width || 450;
          win.baseHeight = (win.height || 400) - 42;
        }

        // Calculate scale based on the handle type
        let scale = 1.0;
        if (activeResize.handleType === 'r') {
          const targetWidth = Math.max(200, activeResize.startW + dx);
          scale = targetWidth / win.baseWidth;
        } else if (activeResize.handleType === 'b') {
          const targetHeight = Math.max(120, activeResize.startH + dy);
          scale = (targetHeight - 42) / win.baseHeight;
        } else if (activeResize.handleType === 'se') {
          const targetWidth = Math.max(200, activeResize.startW + dx);
          const targetHeight = Math.max(120, activeResize.startH + dy);
          const scaleX = targetWidth / win.baseWidth;
          const scaleY = (targetHeight - 42) / win.baseHeight;
          scale = Math.max(scaleX, scaleY);
        }

        // Constrain scale so it doesn't violate min width (200px) or min height (120px)
        const minScaleW = 200 / win.baseWidth;
        const minScaleH = (120 - 42) / win.baseHeight;
        const minScale = Math.max(minScaleW, minScaleH);
        scale = Math.max(minScale, scale);

        // Rescale dimensions proportionally
        win.width = Math.round(win.baseWidth * scale);
        win.height = Math.round(win.baseHeight * scale + 42);

        winEl.style.width = `${win.width}px`;
        winEl.style.height = `${win.height}px`;

        // Update scale on preview panel dynamically during resize
        updateWindowScale(win, winEl);
      }
    }
  });
 
  // Mouse Up reset actions
  window.addEventListener('mouseup', () => {
    if (isPanning) {
      isPanning = false;
      canvasContainer.style.cursor = isSpacePressed ? 'grab' : (state.activeTool === 'pan' ? 'grab' : 'default');
    }
    if (isSelecting) {
      isSelecting = false;
      if (selectionBoxEl) {
        selectionBoxEl.remove();
        selectionBoxEl = null;
      }
    }
    if (activeDrag) {
      if (isServerConnected) {
        activeDrag.selectedWins.forEach(item => {
          if (item.isFeatureNode || item.isChangeNode) {
            fetch(`${API_BASE}/api/changes/layout`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                id: item.window.id,
                x: item.window.x,
                y: item.window.y
              })
            }).catch(err => console.error("Failed to save coordinates:", err));
          } else if (item.isArtifact) {
            fetch(`${API_BASE}/api/artifacts/layout`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                id: item.window.id,
                changeId: item.window.change_id,
                type: item.window.type,
                x: item.window.x,
                y: item.window.y
              })
            }).catch(err => console.error("Failed to save artifact coordinates:", err));

            // Also persist sibling artifact positions that were pushed due to collision
            const siblings = state.artifacts.filter(a => a.change_id === item.window.change_id && a.id !== item.window.id);
            siblings.forEach(sib => {
              const sibEl = document.getElementById(sib.id);
              if (sibEl) {
                const currentX = parseFloat(sibEl.style.left) || sib.x;
                const currentY = parseFloat(sibEl.style.top) || sib.y;
                sib.x = currentX;
                sib.y = currentY;
                fetch(`${API_BASE}/api/artifacts/layout`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    id: sib.id,
                    changeId: sib.change_id,
                    type: sib.type,
                    x: currentX,
                    y: currentY
                  })
                }).catch(err => console.error("Failed to save sibling coordinates:", err));
              }
            });
          }
        });
      }
      activeDrag = null;
      saveState();
    }
    if (activeResize) {
      activeResize = null;
      saveState();
    }
  });

  // Canvas Zoom & Scroll Engine
  canvasContainer.addEventListener('wheel', (e) => {
    e.preventDefault();

    const isPanMode = state.activeTool === 'pan' || isSpacePressed;

    if (e.altKey || (isPanMode && !e.ctrlKey)) {
      // Zoom engine (centered on cursor coordinates)
      const zoomIntensity = 0.08;
      const delta = -e.deltaY;
      const zoomFactor = delta > 0 ? (1 + zoomIntensity) : (1 - zoomIntensity);
      
      const previousZoom = state.zoom;
      let nextZoom = state.zoom * zoomFactor;
      nextZoom = Math.max(0.1, Math.min(3.0, nextZoom));

      const rect = canvasContainer.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const canvasX = (mouseX - state.pan.x) / previousZoom;
      const canvasY = (mouseY - state.pan.y) / previousZoom;

      state.zoom = nextZoom;
      state.pan.x = mouseX - canvasX * state.zoom;
      state.pan.y = mouseY - canvasY * state.zoom;

      updateTransform();
      saveState();
    } else if (e.ctrlKey) {
      // Horizontal canvas scroll
      state.pan.x -= e.deltaY;
      updateTransform();
      saveState();
    } else {
      // Vertical canvas scroll
      state.pan.y -= e.deltaY;
      updateTransform();
      saveState();
    }
  }, { passive: false });

  // Floating Toolbar Buttons
  document.getElementById('zoom-out-btn').addEventListener('click', () => {
    adjustZoomCenter(0.85);
  });

  document.getElementById('zoom-in-btn').addEventListener('click', () => {
    adjustZoomCenter(1.15);
  });

  // Toolbar mode button click bindings
  document.getElementById('tool-select-btn').addEventListener('click', () => {
    setActiveTool('select');
  });

  document.getElementById('tool-pan-btn').addEventListener('click', () => {
    setActiveTool('pan');
  });

  document.getElementById('zoom-reset-btn').addEventListener('click', () => {
    state.zoom = 1.0;
    state.pan = { x: 100, y: 100 };
    updateTransform();
    saveState();
  });

  document.getElementById('zoom-fit-btn').addEventListener('click', fitAllWindows);

  // Sidebar Controls
  const toggleSidebarBtn = document.getElementById('toggle-sidebar-btn');
  const closeSidebarBtn = document.getElementById('close-sidebar-btn');

  toggleSidebarBtn.addEventListener('click', () => {
    fileSidebar.classList.toggle('open');
  });

  closeSidebarBtn.addEventListener('click', () => {
    fileSidebar.classList.remove('open');
  });

  // File Upload actions
  const uploadBtn = document.getElementById('upload-btn');
  const sidebarUploadBtn = document.getElementById('sidebar-upload-btn');
  const onboardingUploadBtn = document.getElementById('onboarding-upload-btn');

  const triggerUpload = () => fileInput.click();
  
  uploadBtn.addEventListener('click', triggerUpload);
  sidebarUploadBtn.addEventListener('click', triggerUpload);
  onboardingUploadBtn.addEventListener('click', triggerUpload);

  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      handleFileUpload(e.target.files);
    }
  });

  // Empty canvas triggers
  document.getElementById('onboarding-sample-btn').addEventListener('click', loadSampleWorkspace);

  // New Note actions
  document.getElementById('create-note-btn').addEventListener('click', () => createNewNote());
  document.getElementById('sidebar-new-btn').addEventListener('click', () => createNewNote());

  // Search filter
  searchInput.addEventListener('input', updateSidebar);

  // Clear workspace action
  document.getElementById('clear-all-btn').addEventListener('click', () => {
    const hasNotes = state.windows.length > 0;
    const hasChanges = state.changes.length > 0;
    if (!hasNotes && !hasChanges) return;

    if (confirm("Are you sure you want to clear all documents from the canvas?")) {
      state.windows = [];
      document.querySelectorAll('.window-container').forEach(el => el.remove());
      document.querySelectorAll('.feature-node').forEach(el => el.remove());
      
      if (!state.deletedChangeIds) {
        state.deletedChangeIds = [];
      }
      state.changes.forEach(c => {
        if (!state.deletedChangeIds.includes(c.id)) {
          state.deletedChangeIds.push(c.id);
        }
      });

      expandedChangeId = null;
      updateSidebar();
      toggleOnboarding();
      saveState();
      drawConnections();
    }
  });

  // Theme Toggler
  document.getElementById('theme-toggle').addEventListener('click', () => {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    applyTheme();
    
    if (window.mermaid) {
      window.mermaid.initialize({
        theme: state.theme === 'dark' ? 'dark' : 'default'
      });
      state.windows.forEach(w => renderMarkdown(w.id));
      if (expandedChangeId) {
        state.artifacts.filter(a => a.change_id === expandedChangeId).forEach(art => {
          const winEl = document.getElementById(art.id);
          if (winEl) renderArtifactMarkdown(art, winEl);
        });
      }
    }
    
    saveState();
  });

  // Help Modal Toggle
  const helpBtn = document.getElementById('help-btn');
  const closeModalBtn = document.getElementById('close-modal-btn');
  
  helpBtn.addEventListener('click', () => {
    helpModal.style.display = 'flex';
  });

  closeModalBtn.addEventListener('click', () => {
    helpModal.style.display = 'none';
  });

  window.addEventListener('click', (e) => {
    if (e.target === helpModal) {
      helpModal.style.display = 'none';
    }
  });

  // Staging Inbox Sidebar Controls
  const inboxSidebar = document.getElementById('inbox-sidebar');
  const toggleInboxBtn = document.getElementById('toggle-inbox-btn');
  const closeInboxBtn = document.getElementById('close-inbox-btn');

  toggleInboxBtn.addEventListener('click', () => {
    inboxSidebar.classList.toggle('open');
  });

  closeInboxBtn.addEventListener('click', () => {
    inboxSidebar.classList.remove('open');
  });

  // Accept Modal Controls
  const acceptModal = document.getElementById('accept-modal');
  const closeAcceptModalBtn = document.getElementById('close-accept-modal-btn');
  const cancelAcceptBtn = document.getElementById('cancel-accept-btn');
  const acceptChangeForm = document.getElementById('accept-change-form');

  const closeAcceptModal = () => {
    acceptModal.style.display = 'none';
    currentInboxItemToAccept = null;
  };

  closeAcceptModalBtn.addEventListener('click', closeAcceptModal);
  cancelAcceptBtn.addEventListener('click', closeAcceptModal);

  acceptChangeForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!currentInboxItemToAccept) return;

    const title = document.getElementById('change-title-input').value.trim();
    const featureName = document.getElementById('change-feature-input').value.trim();

    let maxX = 0;
    let targetY = 100;
    document.querySelectorAll('.feature-node').forEach(el => {
      const left = parseFloat(el.style.left) || 0;
      const width = el.offsetWidth || 280;
      if (left + width > maxX) {
        maxX = left + width;
      }
      const top = parseFloat(el.style.top) || 100;
      if (top > targetY) {
        targetY = top;
      }
    });

    const newX = maxX > 0 ? maxX + 70 : 100;
    const newY = targetY;

    fetch(`${API_BASE}/api/inbox/accept`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: currentInboxItemToAccept.id,
        title: title,
        featureName: featureName,
        x: newX,
        y: newY
      })
    })
    .then(res => res.json())
    .then(data => {
      if (data.success) {
        closeAcceptModal();
        syncWithServer();
      }
    });
  });

  // Close accept modal when clicking outside content
  window.addEventListener('click', (e) => {
    if (e.target === acceptModal) {
      closeAcceptModal();
    }
  });

  // Project Filtering Select Listener
  const projectFilter = document.getElementById('inbox-project-filter');
  if (projectFilter) {
    projectFilter.addEventListener('change', (e) => {
      selectedProjectFilter = e.target.value;
      if (state.inboxItems) {
        renderInboxList(state.inboxItems);
      }
    });
  }

  // Import All Filtered Button Listener
  const importAllBtn = document.getElementById('inbox-import-all-btn');
  if (importAllBtn) {
    importAllBtn.addEventListener('click', () => {
      if (!state.inboxItems || state.inboxItems.length === 0) return;

      const filteredItems = state.inboxItems.filter(item => {
        if (selectedProjectFilter === 'all') return true;
        return item.projectName === selectedProjectFilter;
      });

      if (filteredItems.length === 0) {
        alert("No change candidates match the selected project filter.");
        return;
      }

      if (confirm(`Import all ${filteredItems.length} filtered change candidates?`)) {
        let currentMaxX = 0;
        let targetY = 100;
        document.querySelectorAll('.feature-node').forEach(el => {
          const left = parseFloat(el.style.left) || 0;
          const width = el.offsetWidth || 280;
          if (left + width > currentMaxX) {
            currentMaxX = left + width;
          }
          const top = parseFloat(el.style.top) || 100;
          if (top > targetY) {
            targetY = top;
          }
        });

        let startX = currentMaxX > 0 ? currentMaxX + 70 : 100;

        let chain = Promise.resolve();
        filteredItems.forEach((item, index) => {
          const nextX = startX + index * 350; // 280px width + 70px spacing
          chain = chain.then(() => {
            return fetch(`${API_BASE}/api/inbox/accept`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                id: item.id,
                title: item.title,
                featureName: '',
                x: nextX,
                y: targetY
              })
            })
            .then(res => res.json());
          });
        });

        chain.then(() => {
          syncWithServer();
        });
      }
    });
  }

  // Window Focus event auto-refresh
  window.addEventListener('focus', () => {
    syncWithServer();
  });

  // Manual Refresh Button Listener
  const refreshInboxBtn = document.getElementById('refresh-inbox-btn');
  if (refreshInboxBtn) {
    refreshInboxBtn.addEventListener('click', () => {
      refreshInboxBtn.style.transform = 'rotate(180deg)';
      refreshInboxBtn.style.transition = 'transform 0.5s ease';
      
      fetch(`${API_BASE}/api/inbox/refresh`, { method: 'POST' })
        .then(res => res.json())
        .then(data => {
          setTimeout(() => {
            refreshInboxBtn.style.transform = 'none';
          }, 500);
          if (data.success) {
            syncWithServer();
          }
        })
        .catch(err => {
          refreshInboxBtn.style.transform = 'none';
          console.error("Refresh failed:", err);
        });
    });
  }

  // Export Workspace Action
  const exportBtn = document.getElementById('export-workspace-btn');
  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      exportWorkspace();
    });
  }

  // Import Workspace Action
  const importBtn = document.getElementById('import-workspace-btn');
  const workspaceFileInput = document.getElementById('workspace-file-input');
  if (importBtn && workspaceFileInput) {
    importBtn.addEventListener('click', () => {
      workspaceFileInput.click();
    });
    workspaceFileInput.addEventListener('change', (e) => {
      if (e.target.files.length > 0) {
        importWorkspace(e.target.files[0]);
      }
    });
  }

  // Share Workspace Actions
  const shareBtn = document.getElementById('share-btn');
  const shareModal = document.getElementById('share-modal');
  const closeShareModalBtn = document.getElementById('close-share-modal-btn');
  const closeShareModalOkBtn = document.getElementById('close-share-modal-ok-btn');
  const copyShareLinkBtn = document.getElementById('copy-share-link-btn');
  const shareLinkInput = document.getElementById('share-link-input');

  if (shareBtn) {
    shareBtn.addEventListener('click', () => {
      shareWorkspace();
    });
  }

  if (closeShareModalBtn) {
    closeShareModalBtn.addEventListener('click', () => {
      if (shareModal) shareModal.style.display = 'none';
    });
  }

  if (closeShareModalOkBtn) {
    closeShareModalOkBtn.addEventListener('click', () => {
      if (shareModal) shareModal.style.display = 'none';
    });
  }

  if (copyShareLinkBtn && shareLinkInput) {
    copyShareLinkBtn.addEventListener('click', () => {
      shareLinkInput.select();
      shareLinkInput.setSelectionRange(0, 99999);
      navigator.clipboard.writeText(shareLinkInput.value)
        .then(() => {
          showToast("Share link copied to clipboard!");
        })
        .catch(err => {
          console.error("Failed to copy:", err);
          showToast("Failed to copy link.", "error");
        });
    });
  }

  // Onboarding Paste Action
  const onboardingPasteBtn = document.getElementById('onboarding-paste-btn');
  const pasteModal = document.getElementById('paste-modal');
  const closePasteModalBtn = document.getElementById('close-paste-modal-btn');
  const closePasteModalCancelBtn = document.getElementById('close-paste-modal-cancel-btn');
  const submitPasteBtn = document.getElementById('submit-paste-btn');
  const pasteTitleInput = document.getElementById('paste-title-input');
  const pasteTextInput = document.getElementById('paste-text-input');

  if (onboardingPasteBtn && pasteModal) {
    onboardingPasteBtn.addEventListener('click', () => {
      if (pasteTitleInput) pasteTitleInput.value = '';
      if (pasteTextInput) pasteTextInput.value = '';
      pasteModal.style.display = 'flex';
    });
  }

  if (closePasteModalBtn) {
    closePasteModalBtn.addEventListener('click', () => {
      if (pasteModal) pasteModal.style.display = 'none';
    });
  }

  if (closePasteModalCancelBtn) {
    closePasteModalCancelBtn.addEventListener('click', () => {
      if (pasteModal) pasteModal.style.display = 'none';
    });
  }

  if (submitPasteBtn && pasteTextInput) {
    submitPasteBtn.addEventListener('click', () => {
      const content = pasteTextInput.value;
      let title = (pasteTitleInput && pasteTitleInput.value.trim()) || `Note_${state.windows.length + 1}.md`;
      if (!title.endsWith('.md')) {
        title = `${title}.md`;
      }
      
      if (!content.trim()) {
        showToast("Please paste some markdown text first.", "error");
        return;
      }

      createNoteWithContent(title, content);
      
      if (pasteModal) pasteModal.style.display = 'none';
      showToast("Note created from pasted text!");
    });
  }

  // Start periodic sync polling
  syncWithServer();
  setInterval(syncWithServer, 4000);

  // Check for shared canvas link in URL
  const urlParams = new URLSearchParams(window.location.search);
  const shareId = urlParams.get('share');
  if (shareId) {
    setTimeout(() => {
      loadSharedCanvas(shareId);
    }, 400);
  }
}

function exportWorkspace() {
  const workspaceName = state.workspaceName || 'canvas';
  const exportData = {
    workspaceId: state.workspaceId || 'uuid-placeholder',
    workspaceName: workspaceName,
    createdAt: state.createdAt || new Date().toISOString(),
    version: 1,
    pan: state.pan,
    zoom: state.zoom,
    theme: state.theme,
    windows: state.windows
  };

  const dataStr = JSON.stringify(exportData, null, 2);
  const blob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.href = url;
  link.download = `${workspaceName.toLowerCase().replace(/[^a-z0-9]/g, '_')}.atlas.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function importWorkspace(file) {
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const data = JSON.parse(e.target.result);
      if (!data.workspaceId || !data.windows) {
        alert("Invalid workspace file format. Missing workspaceId or windows.");
        return;
      }
      
      if (confirm(`Load workspace "${data.workspaceName || 'Untitled'}"? This will replace your current notes layout.`)) {
        // Remove standard card DOM containers
        document.querySelectorAll('.window-container').forEach(el => {
          if (!el.classList.contains('change-card')) {
            el.remove();
          }
        });

        state.workspaceId = data.workspaceId;
        state.workspaceName = data.workspaceName;
        state.pan = data.pan || { x: 100, y: 100 };
        state.zoom = data.zoom || 1.0;
        state.theme = data.theme || 'dark';
        
        state.windows = (data.windows || []).map(w => {
          w.id = String(w.id);
          return w;
        });

        applyTheme();
        updateTransform();

        state.windows.forEach(w => createWindowDOM(w));
        drawConnections();

        updateSidebar();
        toggleOnboarding();
        saveState();
      }
    } catch (err) {
      alert("Failed to parse workspace file: " + err.message);
    }
  };
  reader.readAsText(file);
}

function showToast(message, type = 'success') {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  let iconHtml = '';
  if (type === 'success') {
    iconHtml = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color:var(--accent-cyan);"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`;
  } else {
    iconHtml = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color:var(--danger-color);"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;
  }

  toast.innerHTML = `
    <span class="toast-icon">${iconHtml}</span>
    <span class="toast-message">${message}</span>
    <button class="toast-close">✕</button>
  `;

  container.appendChild(toast);

  const closeBtn = toast.querySelector('.toast-close');
  const dismiss = () => {
    toast.style.animation = 'toast-out 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards';
    setTimeout(() => {
      toast.remove();
      if (container.children.length === 0) {
        container.remove();
      }
    }, 200);
  };

  closeBtn.addEventListener('click', dismiss);
  setTimeout(dismiss, 4000);
}

function shareWorkspace() {
  const workspaceName = state.workspaceName || 'canvas';
  const exportData = {
    workspaceId: state.workspaceId || 'uuid-placeholder',
    workspaceName: workspaceName,
    createdAt: state.createdAt || new Date().toISOString(),
    version: 1,
    pan: state.pan,
    zoom: state.zoom,
    theme: state.theme,
    windows: state.windows,
    deletedChangeIds: state.deletedChangeIds || [],
    expandedChangeId: expandedChangeId || null
  };

  fetch(`${API_BASE}/api/share`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ state: exportData })
  })
  .then(res => res.json())
  .then(data => {
    if (data.success && data.shareId) {
      const shareUrl = `${window.location.origin}${window.location.pathname}?share=${data.shareId}`;
      const shareLinkInput = document.getElementById('share-link-input');
      const shareModal = document.getElementById('share-modal');
      if (shareLinkInput && shareModal) {
        shareLinkInput.value = shareUrl;
        shareModal.style.display = 'flex';
        showToast("Canvas shared successfully!");
      }
    } else {
      showToast("Failed to share canvas: " + (data.error || "Unknown error"), "error");
    }
  })
  .catch(err => {
    console.error("Error sharing canvas:", err);
    showToast("Error sharing canvas. Is the server running?", "error");
  });
}

function loadSharedCanvas(shareId) {
  fetch(`${API_BASE}/api/share/${shareId}`)
    .then(res => res.json())
    .then(data => {
      if (data.success && data.state) {
        const sharedState = data.state;
        if (confirm(`Load shared workspace "${sharedState.workspaceName || 'Untitled'}"? This will replace your current notes layout.`)) {
          // Remove standard card DOM containers
          document.querySelectorAll('.window-container').forEach(el => {
            if (!el.classList.contains('change-card')) {
              el.remove();
            }
          });

          // Apply state
          state.workspaceId = sharedState.workspaceId;
          state.workspaceName = sharedState.workspaceName;
          state.pan = sharedState.pan || { x: 100, y: 100 };
          state.zoom = sharedState.zoom || 1.0;
          state.theme = sharedState.theme || 'dark';
          
          state.windows = (sharedState.windows || []).map(w => {
            w.id = String(w.id);
            return w;
          });
          state.deletedChangeIds = sharedState.deletedChangeIds || [];
          expandedChangeId = sharedState.expandedChangeId || null;

          applyTheme();
          updateTransform();

          state.windows.forEach(w => createWindowDOM(w));
          drawConnections();

          updateSidebar();
          toggleOnboarding();
          saveState();

          showToast(`Loaded shared workspace: ${state.workspaceName}`);
          
          // Clear URL query parameters from address bar
          window.history.replaceState({}, document.title, window.location.pathname);
        } else {
          window.history.replaceState({}, document.title, window.location.pathname);
        }
      } else {
        showToast("Failed to load shared workspace: " + (data.error || "Unknown error"), "error");
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    })
    .catch(err => {
      console.error("Error loading shared workspace:", err);
      showToast("Error loading shared workspace. Is the server running?", "error");
      window.history.replaceState({}, document.title, window.location.pathname);
    });
}

function adjustZoomCenter(ratio) {
  // Zoom centered on the viewport center coordinates
  const previousZoom = state.zoom;
  let nextZoom = state.zoom * ratio;
  nextZoom = Math.max(0.1, Math.min(3.0, nextZoom));

  const viewWidth = canvasContainer.clientWidth;
  const viewHeight = canvasContainer.clientHeight;
  const screenX = viewWidth / 2;
  const screenY = viewHeight / 2;

  const canvasX = (screenX - state.pan.x) / previousZoom;
  const canvasY = (screenY - state.pan.y) / previousZoom;

  state.zoom = nextZoom;
  state.pan.x = screenX - canvasX * state.zoom;
  state.pan.y = screenY - canvasY * state.zoom;

  updateTransform();
  saveState();
}

// Run loader
window.addEventListener('DOMContentLoaded', init);
