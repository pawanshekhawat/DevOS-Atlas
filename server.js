const express = require('express');
const fs = require('fs');
const path = require('path');
const chokidar = require('chokidar');
const { DatabaseSync } = require('node:sqlite');

const PORT = 3000;
const WORKSPACE_DIR = __dirname;
const ATLAS_DIR = path.join(WORKSPACE_DIR, '.atlas');
const CHANGES_DIR = path.join(ATLAS_DIR, 'changes');
const DB_PATH = path.join(ATLAS_DIR, 'index.db');
const CONFIG_PATH = path.join(ATLAS_DIR, 'config.json');

// Ensure directories exist
if (!fs.existsSync(ATLAS_DIR)) {
  fs.mkdirSync(ATLAS_DIR, { recursive: true });
}
if (!fs.existsSync(CHANGES_DIR)) {
  fs.mkdirSync(CHANGES_DIR, { recursive: true });
}

// ----------------------------------------------------
// SQLite Setup (node:sqlite)
// ----------------------------------------------------
const db = new DatabaseSync(DB_PATH);

// Initialize schema
db.exec(`
  CREATE TABLE IF NOT EXISTS features (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE
  );

  CREATE TABLE IF NOT EXISTS changes (
    id TEXT PRIMARY KEY,
    feature_id TEXT,
    title TEXT NOT NULL,
    status TEXT NOT NULL,
    x REAL,
    y REAL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(feature_id) REFERENCES features(id)
  );

  CREATE TABLE IF NOT EXISTS artifacts (
    id TEXT PRIMARY KEY,
    change_id TEXT NOT NULL,
    type TEXT NOT NULL,
    path TEXT NOT NULL,
    FOREIGN KEY(change_id) REFERENCES changes(id)
  );

  CREATE TABLE IF NOT EXISTS connections (
    from_change TEXT,
    to_change TEXT,
    PRIMARY KEY (from_change, to_change)
  );
`);

// ----------------------------------------------------
// Sync / Rebuild Database on Startup
// ----------------------------------------------------
function rebuildIndex() {
  console.log('Rebuilding SQLite index from .atlas/changes...');
  
  // Clear tables to rebuild
  db.exec('DELETE FROM connections');
  db.exec('DELETE FROM artifacts');
  db.exec('DELETE FROM changes');
  db.exec('DELETE FROM features');

  if (!fs.existsSync(CHANGES_DIR)) return;

  const changeFolders = fs.readdirSync(CHANGES_DIR);
  
  for (const folder of changeFolders) {
    const changePath = path.join(CHANGES_DIR, folder);
    if (!fs.statSync(changePath).isDirectory()) continue;

    const metaFile = path.join(changePath, 'change.json');
    if (!fs.existsSync(metaFile)) continue;

    try {
      const metadata = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
      
      // Upsert feature
      if (metadata.feature_id && metadata.feature_name) {
        const checkFeat = db.prepare('SELECT id FROM features WHERE id = ?').get(metadata.feature_id);
        if (!checkFeat) {
          db.prepare('INSERT INTO features (id, name) VALUES (?, ?)').run(metadata.feature_id, metadata.feature_name);
        }
      }

      // Insert Change
      db.prepare(`
        INSERT INTO changes (id, feature_id, title, status, x, y, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        metadata.id,
        metadata.feature_id || null,
        metadata.title,
        metadata.status || 'completed',
        metadata.x !== undefined ? metadata.x : null,
        metadata.y !== undefined ? metadata.y : null,
        metadata.created_at || new Date().toISOString()
      );

      // Read files in folder to add as artifacts
      const files = fs.readdirSync(changePath);
      for (const file of files) {
        if (file === 'change.json') continue;
        
        let type = 'other';
        if (file === 'plan.md') type = 'plan';
        else if (file === 'tasks.md') type = 'tasks';
        else if (file === 'walkthrough.md') type = 'walkthrough';
        else if (file === 'decisions.md') type = 'decision';

        const artifactId = `art_${metadata.id}_${type}`;
        const relativePath = path.join('.atlas', 'changes', folder, file).replace(/\\/g, '/');

        db.prepare(`
          INSERT INTO artifacts (id, change_id, type, path)
          VALUES (?, ?, ?, ?)
        `).run(artifactId, metadata.id, type, relativePath);
      }
    } catch (e) {
      console.error(`Failed to process change metadata in folder ${folder}:`, e);
    }
  }
  console.log('SQLite index rebuild completed successfully.');
}

// Perform initial index rebuild
rebuildIndex();

// ----------------------------------------------------
// In-Memory Staging Inbox & File Watching
// ----------------------------------------------------
let inbox = []; // List of { id, conversationId, timestamp, planPath, tasksPath, walkthroughPath, title }

// Watchers state
let activeWatchers = [];

function loadConfigAndStartWatchers() {
  // Clear any existing watchers
  activeWatchers.forEach(w => w.close());
  activeWatchers = [];

  if (!fs.existsSync(CONFIG_PATH)) {
    console.log('No config.json found at .atlas/config.json. Watchers disabled.');
    return;
  }

  try {
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    if (!config.watchers || !Array.isArray(config.watchers)) return;

    config.watchers.forEach((w, idx) => {
      if (w.type === 'antigravity' && w.path) {
        console.log(`Starting Antigravity watcher for path: ${w.path}`);
        
        const watcher = chokidar.watch(w.path, {
          ignored: null,
          persistent: true,
          depth: 3,
          ignoreInitial: false
        });

        watcher.on('add', (filePath) => handleAgentFileEvent(filePath));
        watcher.on('change', (filePath) => handleAgentFileEvent(filePath));

        activeWatchers.push(watcher);
      }
    });
  } catch (e) {
    console.error('Failed to load config.json or start file watchers:', e);
  }
}

// Analyze file changes to identify possible logical workflow steps
function handleAgentFileEvent(filePath) {
  const fileName = path.basename(filePath);
  if (!['implementation_plan.md', 'task.md', 'walkthrough.md'].includes(fileName)) {
    return;
  }

  // Determine conversation folder from path
  const parts = filePath.split(path.sep);
  // Expected: .../brain/<conversation-id>/<file>
  // Let's find conversation id
  const brainIndex = parts.findIndex(p => p.toLowerCase() === 'brain');
  if (brainIndex === -1 || brainIndex >= parts.length - 2) return;

  const conversationId = parts[brainIndex + 1];
  
  // Verify this conversation references the current workspace directory
  // We can scan the conversation folder logs for references to the workspace path.
  // For V1, to make it frictionless, we link it if it's the most recent conversation
  // or contains workspace path. Let's do a simple check.
  const logDir = path.join(path.dirname(filePath), '.system_generated', 'logs');
  const transcriptPath = path.join(logDir, 'transcript.jsonl');
  let isRelated = false;

  if (fs.existsSync(transcriptPath)) {
    try {
      const content = fs.readFileSync(transcriptPath, 'utf8');
      if (content.toLowerCase().includes(WORKSPACE_DIR.toLowerCase())) {
        isRelated = true;
      }
    } catch (e) {
      // Fallback
    }
  }

  // If not explicitly related, check if any of the files in the directory are newer
  if (!isRelated) {
    // We can allow it as a candidate or check if there is a match in active workspace
    isRelated = true; // For local single-user testing, default to true
  }

  if (!isRelated) return;

  // Locate or create Inbox entry
  let entry = inbox.find(item => item.conversationId === conversationId);
  
  if (!entry) {
    entry = {
      id: `inbox_${conversationId}`,
      conversationId: conversationId,
      timestamp: Date.now(),
      planPath: null,
      tasksPath: null,
      walkthroughPath: null,
      title: `Change via Chat ${conversationId.slice(0, 8)}`
    };
    inbox.push(entry);
  }

  // Update file reference paths
  if (fileName === 'implementation_plan.md') {
    entry.planPath = filePath;
    // Try to extract a title from the implementation plan's first heading
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const match = content.match(/^#\s+(.+)$/m);
      if (match && match[1]) {
        entry.title = match[1].trim();
      }
    } catch (e) {
      // Ignored
    }
  } else if (fileName === 'task.md') {
    entry.tasksPath = filePath;
  } else if (fileName === 'walkthrough.md') {
    entry.walkthroughPath = filePath;
  }

  entry.timestamp = Date.now();
  console.log(`Updated Inbox candidate [${entry.id}]: "${entry.title}"`);
}

// ----------------------------------------------------
// Express API Server Setup
// ----------------------------------------------------
const app = express();
app.use(express.json());

// Serve Static Frontend files (Vite build output or public folder if building)
app.use(express.static(WORKSPACE_DIR));

// CORS headers
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  next();
});

// API Endpoint: Get active changes and features
app.get('/api/changes', (req, res) => {
  try {
    const changes = db.prepare('SELECT * FROM changes ORDER BY created_at ASC').all();
    const features = db.prepare('SELECT * FROM features').all();
    const artifacts = db.prepare('SELECT * FROM artifacts').all();
    
    // Map artifact relative path to full URL
    const mappedArtifacts = artifacts.map(art => ({
      ...art,
      url: `http://localhost:${PORT}/${art.path}`
    }));

    res.json({
      success: true,
      changes: changes,
      features: features,
      artifacts: mappedArtifacts
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// API Endpoint: Get pending staging inbox items
app.get('/api/inbox', (req, res) => {
  // Filter out inbox items that have already been accepted
  // (We check if their plan or tasks files are already registered in DB)
  const activeArtifactPaths = db.prepare('SELECT path FROM artifacts').all().map(a => a.path);
  
  const pending = inbox.filter(item => {
    // If we already accepted this conversation, skip
    const checkChange = db.prepare('SELECT id FROM changes WHERE id = ?').get(`change_${item.conversationId}`);
    return !checkChange;
  });

  res.json({
    success: true,
    inbox: pending
  });
});

// API Endpoint: Accept pending change
app.post('/api/inbox/accept', (req, res) => {
  const { id, title, featureName } = req.body;
  const item = inbox.find(x => x.id === id);

  if (!item) {
    return res.status(404).json({ success: false, error: 'Inbox item not found' });
  }

  try {
    const changeId = `change_${item.conversationId}`;
    const featureId = featureName ? `feat_${featureName.toLowerCase().replace(/[^a-z0-9]/g, '_')}` : null;
    const changeFolder = path.join(CHANGES_DIR, changeId);
    
    if (!fs.existsSync(changeFolder)) {
      fs.mkdirSync(changeFolder, { recursive: true });
    }

    // Copy original agent artifacts
    const copiedFiles = [];
    
    if (item.planPath && fs.existsSync(item.planPath)) {
      const dest = path.join(changeFolder, 'plan.md');
      fs.copyFileSync(item.planPath, dest);
      copiedFiles.push({ type: 'plan', file: 'plan.md' });
    }
    if (item.tasksPath && fs.existsSync(item.tasksPath)) {
      const dest = path.join(changeFolder, 'tasks.md');
      fs.copyFileSync(item.tasksPath, dest);
      copiedFiles.push({ type: 'tasks', file: 'tasks.md' });
    }
    if (item.walkthroughPath && fs.existsSync(item.walkthroughPath)) {
      const dest = path.join(changeFolder, 'walkthrough.md');
      fs.copyFileSync(item.walkthroughPath, dest);
      copiedFiles.push({ type: 'walkthrough', file: 'walkthrough.md' });
    }

    // Write change.json metadata
    const metadata = {
      id: changeId,
      title: title || item.title,
      feature_id: featureId,
      feature_name: featureName || null,
      status: 'completed',
      x: 100 + Math.random() * 200,
      y: 100 + Math.random() * 200,
      created_at: new Date().toISOString()
    };
    fs.writeFileSync(path.join(changeFolder, 'change.json'), JSON.stringify(metadata, null, 2));

    // Rebuild database index
    rebuildIndex();

    // Clean from inbox
    inbox = inbox.filter(x => x.id !== id);

    res.json({ success: true, changeId });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// API Endpoint: Discard pending change
app.post('/api/inbox/discard', (req, res) => {
  const { id } = req.body;
  inbox = inbox.filter(x => x.id !== id);
  res.json({ success: true });
});

// API Endpoint: Save dragged canvas layout coordinates
app.post('/api/changes/layout', (req, res) => {
  const { id, x, y } = req.body;
  try {
    // Update SQLite index
    db.prepare('UPDATE changes SET x = ?, y = ? WHERE id = ?').run(x, y, id);

    // Update the change.json file in `.atlas/changes/`
    const changeFolder = path.join(CHANGES_DIR, id);
    const metaFile = path.join(changeFolder, 'change.json');
    if (fs.existsSync(metaFile)) {
      const metadata = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
      metadata.x = x;
      metadata.y = y;
      fs.writeFileSync(metaFile, JSON.stringify(metadata, null, 2));
    }

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Start Server & Watchers
app.listen(PORT, () => {
  console.log(`DevOS Atlas API server listening at http://localhost:${PORT}`);
  loadConfigAndStartWatchers();
});
