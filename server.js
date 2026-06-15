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
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    path TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS features (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE
  );

  CREATE TABLE IF NOT EXISTS changes (
    id TEXT PRIMARY KEY,
    project_id TEXT,
    feature_id TEXT,
    title TEXT NOT NULL,
    status TEXT NOT NULL,
    x REAL,
    y REAL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    source_agent TEXT,
    updated_at DATETIME,
    FOREIGN KEY(project_id) REFERENCES projects(id),
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

// Run SQLite migrations safely to handle legacy databases
try {
  db.exec(`ALTER TABLE changes ADD COLUMN project_id TEXT`);
} catch (e) {}
try {
  db.exec(`ALTER TABLE changes ADD COLUMN source_agent TEXT`);
} catch (e) {}
try {
  db.exec(`ALTER TABLE changes ADD COLUMN updated_at DATETIME`);
} catch (e) {}

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
  db.exec('DELETE FROM projects');

  if (!fs.existsSync(CHANGES_DIR)) return;

  const changeFolders = fs.readdirSync(CHANGES_DIR);
  
  for (const folder of changeFolders) {
    const changePath = path.join(CHANGES_DIR, folder);
    if (!fs.statSync(changePath).isDirectory()) continue;

    const metaFile = path.join(changePath, 'change.json');
    if (!fs.existsSync(metaFile)) continue;

    try {
      const metadata = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
      
      // Upsert project
      let projectId = null;
      if (metadata.project_path) {
        projectId = `proj_${metadata.project_name.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
        const checkProj = db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId);
        if (!checkProj) {
          db.prepare('INSERT INTO projects (id, name, path) VALUES (?, ?, ?)').run(projectId, metadata.project_name, metadata.project_path);
        }
      }

      // Upsert feature
      if (metadata.feature_id && metadata.feature_name) {
        const checkFeat = db.prepare('SELECT id FROM features WHERE id = ?').get(metadata.feature_id);
        if (!checkFeat) {
          db.prepare('INSERT INTO features (id, name) VALUES (?, ?)').run(metadata.feature_id, metadata.feature_name);
        }
      }

      // Insert Change
      db.prepare(`
        INSERT INTO changes (id, project_id, feature_id, title, status, x, y, created_at, source_agent, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        metadata.id,
        projectId,
        metadata.feature_id || null,
        metadata.title,
        metadata.status || 'completed',
        metadata.x !== undefined ? metadata.x : null,
        metadata.y !== undefined ? metadata.y : null,
        metadata.created_at || new Date().toISOString(),
        metadata.source_agent || 'Antigravity',
        metadata.updated_at || metadata.created_at || new Date().toISOString()
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
// ----------------------------------------------------
// In-Memory Staging Inbox & Pluggable File Watching
// ----------------------------------------------------
const crypto = require('crypto');
let inbox = []; // List of inbox items
let activeWatchers = [];

// Pluggable Agent Provider Registry
const providers = {
  antigravity: {
    detectProject(filePath, logContent) {
      if (!logContent) return null;
      // 1. Search for Cwd references
      const cwdMatch = logContent.match(/"Cwd"\s*:\s*"([^"]+)"/i);
      if (cwdMatch && cwdMatch[1]) {
        const fullPath = cwdMatch[1].replace(/\\\\/g, '/').replace(/\\/g, '/');
        return {
          path: fullPath,
          name: path.basename(fullPath)
        };
      }
      // 2. Fallback: Search for workspace layout mapping in logs
      const workspaceMatch = logContent.match(/([a-zA-Z]:[\\/][^-\r\n\s\t"]+)\s*->/i);
      if (workspaceMatch && workspaceMatch[1]) {
        const fullPath = workspaceMatch[1].replace(/\\\\/g, '/').replace(/\\/g, '/');
        return {
          path: fullPath,
          name: path.basename(fullPath)
        };
      }
      return null;
    },
    parseMetadata(filePath, fileContent) {
      let title = null;
      if (fileContent) {
        const match = fileContent.match(/^#\s+(.+)$/m);
        if (match && match[1]) {
          title = match[1].trim();
        }
      }
      return {
        title: title || `Change via Antigravity`,
        sourceAgent: 'Antigravity'
      };
    }
  },
  cursor: {
    detectProject(filePath, logContent) { return null; },
    parseMetadata(filePath, fileContent) {
      return { title: 'Cursor Change', sourceAgent: 'Cursor' };
    }
  },
  claude_code: {
    detectProject(filePath, logContent) { return null; },
    parseMetadata(filePath, fileContent) {
      return { title: 'Claude Code Change', sourceAgent: 'Claude Code' };
    }
  }
};

function initializeWorkspaceIdentity() {
  let config = {};
  if (fs.existsSync(CONFIG_PATH)) {
    try {
      config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    } catch (e) {
      config = {};
    }
  }

  let updated = false;
  if (!config.workspaceId) {
    config.workspaceId = crypto.randomUUID();
    updated = true;
  }
  if (!config.workspaceName) {
    config.workspaceName = path.basename(WORKSPACE_DIR);
    updated = true;
  }
  if (!config.createdAt) {
    config.createdAt = new Date().toISOString();
    updated = true;
  }
  if (config.version === undefined) {
    config.version = 1;
    updated = true;
  }
  if (!config.watchers || !Array.isArray(config.watchers)) {
    const homeDir = process.env.USERPROFILE || process.env.HOME || 'C:\\Users\\minec';
    const defaultBrainPath = path.join(homeDir, '.gemini', 'antigravity-ide', 'brain');
    config.watchers = [
      {
        type: "antigravity",
        path: defaultBrainPath
      }
    ];
    updated = true;
  }

  if (updated) {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
    console.log(`Workspace identity initialized: ID=${config.workspaceId}, Name=${config.workspaceName}`);
  }
  return config;
}

function scanBrainFolderForInbox() {
  const config = initializeWorkspaceIdentity();
  if (!config.watchers || !Array.isArray(config.watchers)) return;

  config.watchers.forEach(w => {
    if (w.type !== 'antigravity' || !w.path || !fs.existsSync(w.path)) return;

    try {
      const folders = fs.readdirSync(w.path);
      for (const folder of folders) {
        const conversationId = folder;
        const convFolder = path.join(w.path, folder);
        if (!fs.statSync(convFolder).isDirectory()) continue;

        const planPath = path.join(convFolder, 'implementation_plan.md');
        const tasksPath = path.join(convFolder, 'task.md');
        const walkthroughPath = path.join(convFolder, 'walkthrough.md');

        const filesExist = fs.existsSync(planPath) || fs.existsSync(tasksPath) || fs.existsSync(walkthroughPath);
        if (!filesExist) continue;

        const transcriptPath = path.join(convFolder, '.system_generated', 'logs', 'transcript.jsonl');
        let logContent = '';
        if (fs.existsSync(transcriptPath)) {
          try {
            logContent = fs.readFileSync(transcriptPath, 'utf8');
          } catch (e) {}
        }

        const provider = providers.antigravity;
        const projectInfo = provider.detectProject(planPath, logContent);
        
        let projectPath = WORKSPACE_DIR.replace(/\\/g, '/');
        let projectName = path.basename(WORKSPACE_DIR);
        if (projectInfo) {
          projectPath = projectInfo.path;
          projectName = projectInfo.name;
        }

        let fileContent = '';
        const mdFile = [planPath, tasksPath, walkthroughPath].find(fs.existsSync);
        if (mdFile) {
          try {
            fileContent = fs.readFileSync(mdFile, 'utf8');
          } catch (e) {}
        }

        const meta = provider.parseMetadata(mdFile, fileContent);
        const title = meta ? meta.title : `Change in ${projectName}`;
        const sourceAgent = meta ? meta.sourceAgent : 'Antigravity';

        const mtimes = [];
        const birthtimes = [];
        [planPath, tasksPath, walkthroughPath].forEach(p => {
          if (fs.existsSync(p)) {
            const stat = fs.statSync(p);
            mtimes.push(stat.mtimeMs);
            birthtimes.push(stat.birthtimeMs);
          }
        });

        const createdAt = birthtimes.length ? Math.min(...birthtimes) : Date.now();
        const updatedAt = mtimes.length ? Math.max(...mtimes) : createdAt;

        const entryId = `inbox_${conversationId}`;
        let entry = inbox.find(item => item.id === entryId);
        
        if (!entry) {
          entry = {
            id: entryId,
            conversationId: conversationId,
            planPath: fs.existsSync(planPath) ? planPath : null,
            tasksPath: fs.existsSync(tasksPath) ? tasksPath : null,
            walkthroughPath: fs.existsSync(walkthroughPath) ? walkthroughPath : null,
          };
          inbox.push(entry);
        } else {
          entry.planPath = fs.existsSync(planPath) ? planPath : entry.planPath;
          entry.tasksPath = fs.existsSync(tasksPath) ? tasksPath : entry.tasksPath;
          entry.walkthroughPath = fs.existsSync(walkthroughPath) ? walkthroughPath : entry.walkthroughPath;
        }

        entry.title = title;
        entry.sourceAgent = sourceAgent;
        entry.projectName = projectName;
        entry.projectPath = projectPath;
        entry.createdAt = createdAt;
        entry.updatedAt = updatedAt;
      }
    } catch (err) {
      console.error('Error scanning brain folder:', err);
    }
  });

  inbox.sort((a, b) => {
    if (b.createdAt !== a.createdAt) {
      return b.createdAt - a.createdAt;
    }
    return b.updatedAt - a.updatedAt;
  });
}

function loadConfigAndStartWatchers() {
  activeWatchers.forEach(w => w.close());
  activeWatchers = [];

  const config = initializeWorkspaceIdentity();
  if (!config.watchers || !Array.isArray(config.watchers)) return;

  try {
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

function handleAgentFileEvent(filePath) {
  const fileName = path.basename(filePath);
  if (!['implementation_plan.md', 'task.md', 'walkthrough.md'].includes(fileName)) {
    return;
  }
  scanBrainFolderForInbox();
}

// ----------------------------------------------------
// Express API Server Setup
// ----------------------------------------------------
const app = express();
app.use(express.json());

// Serve Static Frontend files (Vite build output or public folder if building)
app.use(express.static(WORKSPACE_DIR));
app.use('/.atlas', express.static(ATLAS_DIR, { dotfiles: 'allow' }));

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
    const projects = db.prepare('SELECT * FROM projects').all();
    const artifacts = db.prepare('SELECT * FROM artifacts').all();
    const config = initializeWorkspaceIdentity();
    
    // Map artifact relative path to full URL
    const mappedArtifacts = artifacts.map(art => ({
      ...art,
      url: `http://localhost:${PORT}/${art.path}`
    }));

    res.json({
      success: true,
      changes: changes,
      features: features,
      projects: projects,
      artifacts: mappedArtifacts,
      config: config
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

function getFilteredInbox() {
  return inbox.filter(item => {
    const checkChange = db.prepare('SELECT id FROM changes WHERE id = ?').get(`change_${item.conversationId}`);
    return !checkChange;
  });
}

// API Endpoint: Get pending staging inbox items
app.get('/api/inbox', (req, res) => {
  scanBrainFolderForInbox();
  res.json({
    success: true,
    inbox: getFilteredInbox()
  });
});

// API Endpoint: Force refresh staging inbox items manually
app.post('/api/inbox/refresh', (req, res) => {
  try {
    scanBrainFolderForInbox();
    res.json({
      success: true,
      inbox: getFilteredInbox()
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
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
      created_at: new Date(item.createdAt).toISOString(),
      updated_at: new Date(item.updatedAt).toISOString(),
      project_name: item.projectName,
      project_path: item.projectPath,
      source_agent: item.sourceAgent
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
