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

function createChangeNodeDOM(change, changeArtifacts) {
  change.id = String(change.id);
  const winEl = document.createElement('div');
  winEl.className = 'window-container change-node';
  winEl.id = change.id;
  winEl.style.left = `${change.x}px`;
  winEl.style.top = `${change.y}px`;
  winEl.style.width = `340px`;
  winEl.style.height = `auto`;
  winEl.style.zIndex = change.zIndex || 10;

  // Find feature name
  const feature = state.features.find(f => f.id === change.feature_id);
  const featureBadge = feature ? `<span class="change-feature-badge">${escapeHtml(feature.name)}</span>` : '';

  let artifactsHtml = '';
  changeArtifacts.forEach(art => {
    let typeLabel = art.type.toUpperCase();
    artifactsHtml += `
      <div class="artifact-link" data-path="${art.path}" data-type="${art.type}">
        <span class="artifact-link-icon">${ICONS.file}</span>
        <span style="font-weight: 500;">${typeLabel}</span>
      </div>
    `;
  });

  winEl.innerHTML = `
    <div class="window-header" data-id="${change.id}">
      <div class="window-title-area">
        ${featureBadge}
        <span style="font-weight: 600; font-size: 13px; color: var(--text-primary); text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">${escapeHtml(change.title)}</span>
      </div>
    </div>
    <div class="window-body" style="padding: 16px;">
      ${artifactsHtml || '<div style="color:var(--text-muted); font-size: 12px; text-align: center;">No artifacts attached</div>'}
    </div>
  `;

  canvasWorkspace.appendChild(winEl);

  // Focus on mouse down
  winEl.addEventListener('mousedown', (e) => {
    focusWindow(change.id);

    // Group dragging check for change nodes
    if (winEl.classList.contains('selected')) {
      const isInteractive = e.target.closest('button, a, input, textarea, .resize-handle, .window-header, .artifact-link');
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

  // Drag handler start
  const header = winEl.querySelector('.window-header');
  header.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    focusWindow(change.id);
    
    if (!winEl.classList.contains('selected')) {
      if (!e.shiftKey) {
        document.querySelectorAll('.window-container.selected').forEach(el => el.classList.remove('selected'));
      }
      winEl.classList.add('selected');
    }

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

  // Setup click listeners for artifacts
  winEl.querySelectorAll('.artifact-link').forEach(link => {
    link.addEventListener('click', (e) => {
      const filePath = link.getAttribute('data-path');
      const fileType = link.getAttribute('data-type');
      openArtifactInViewer(filePath, change.title + ' - ' + fileType.toUpperCase());
    });
  });
}

function openArtifactInViewer(relativePath, name) {
  fetch(`http://localhost:3000/${relativePath}`)
    .then(res => res.text())
    .then(content => {
      // Check if already open
      const existing = state.windows.find(w => w.name === name);
      if (existing) {
        focusWindow(existing.id);
        centerOnWindow(existing.id);
      } else {
        const id = 'win_' + Date.now();
        const newWin = {
          id: id,
          name: name,
          content: content,
          x: 150 + Math.random() * 100,
          y: 150 + Math.random() * 100,
          width: 600,
          height: 450,
          zIndex: ++maxZIndex,
          isCollapsed: false,
          editMode: false,
          openComplete: true
        };
        state.windows.push(newWin);
        createWindowDOM(newWin);
        focusWindow(id);
      }
    });
}

function syncWithServer() {
  fetch('http://localhost:3000/api/changes')
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
        state.artifacts = (data.artifacts || []).map(art => {
          art.id = String(art.id);
          art.change_id = String(art.change_id);
          return art;
        });
        
        renderChangeNodes();
      }
    })
    .catch(err => {
      isServerConnected = false;
      console.warn("Express server is not running locally. Operating in standalone mode.");
    });

  if (isServerConnected) {
    fetch('http://localhost:3000/api/inbox')
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

function renderChangeNodes() {
  document.querySelectorAll('.window-container.change-node').forEach(el => el.remove());

  state.changes.forEach(change => {
    const changeArtifacts = state.artifacts.filter(art => art.change_id === change.id);
    createChangeNodeDOM(change, changeArtifacts);
  });
}

function renderInboxList(inboxItems) {
  const inboxListEl = document.getElementById('inbox-list');
  const badgeEl = document.getElementById('inbox-badge');
  
  inboxListEl.innerHTML = '';
  
  if (inboxItems.length === 0) {
    inboxListEl.innerHTML = '<div style="color:var(--text-muted); font-size:13px; text-align:center; padding:20px;">No pending changes detected</div>';
    badgeEl.style.display = 'none';
    return;
  }

  badgeEl.textContent = inboxItems.length;
  badgeEl.style.display = 'inline-block';

  inboxItems.forEach(item => {
    const li = document.createElement('li');
    li.className = 'inbox-item';
    
    let filesList = '';
    if (item.planPath) filesList += `<div class="inbox-item-file"><span class="inbox-item-file-dot"></span>Plan</div>`;
    if (item.tasksPath) filesList += `<div class="inbox-item-file"><span class="inbox-item-file-dot"></span>Tasks</div>`;
    if (item.walkthroughPath) filesList += `<div class="inbox-item-file"><span class="inbox-item-file-dot"></span>Walkthrough</div>`;

    li.innerHTML = `
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
        fetch('http://localhost:3000/api/inbox/discard', {
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
    document.querySelectorAll('.window-container.selected').forEach(el => el.classList.remove('selected'));
  }
  saveState();
}

// ----------------------------------------------------
// Global DOM Event Bindings
// ----------------------------------------------------
function init() {
  loadState();
  applyTheme();
  
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
      document.querySelectorAll('.window-container.selected').forEach(el => el.classList.remove('selected'));
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
        document.querySelectorAll('.window-container.selected').forEach(el => el.classList.remove('selected'));
        
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
      document.querySelectorAll('.window-container').forEach(winEl => {
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

        const winEl = document.getElementById(win.id);
        if (winEl) {
          winEl.style.left = `${win.x}px`;
          winEl.style.top = `${win.y}px`;
        }
      });
    }

    // 4. Resize Action (Edge / Corner Resize)
    else if (activeResize) {
      const dx = (e.clientX - activeResize.startX) / state.zoom;
      const dy = (e.clientY - activeResize.startY) / state.zoom;
      
      const win = activeResize.window;
      const winEl = document.getElementById(win.id);
      
      if (!winEl) return;

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
          if (item.isChangeNode) {
            fetch('http://localhost:3000/api/changes/layout', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                id: item.window.id,
                x: item.window.x,
                y: item.window.y
              })
            }).catch(err => console.error("Failed to save coordinates:", err));
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
    if (state.windows.length === 0) return;
    if (confirm("Are you sure you want to clear all documents?")) {
      document.querySelectorAll('.window-container').forEach(el => el.remove());
      state.windows = [];
      updateSidebar();
      toggleOnboarding();
      saveState();
    }
  });

  // Theme Toggler
  document.getElementById('theme-toggle').addEventListener('click', () => {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    applyTheme();
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

    fetch('http://localhost:3000/api/inbox/accept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: currentInboxItemToAccept.id,
        title: title,
        featureName: featureName
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

  // Start periodic sync polling
  syncWithServer();
  setInterval(syncWithServer, 4000);
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
