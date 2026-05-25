// SmartBrowser - Electron main process
// Native WebContentsView per tab so DevTools can dock to the SmartBrowser window
// (same architecture Chrome itself uses).

const { app, BrowserWindow, WebContentsView, ipcMain, session, shell, Menu } = require('electron');
const path = require('node:path');
const { spawn } = require('node:child_process');
const fs = require('node:fs');

const isDev = process.env.NODE_ENV === 'development';
const BACKEND_PORT = 8080;
const FRONTEND_DEV_URL = 'http://localhost:5173';

let mainWindow = null;
let backendChild = null;

// tabId -> { view, lastBounds }
const tabs = new Map();
let activeTabId = null;
let lastBounds = { x: 8, y: 92, width: 1380, height: 800 };

// Spawned Tor processes (id -> ChildProcess)
const torProcs = new Map();

const TOR_DIR    = app.isPackaged
  ? path.join(process.resourcesPath, 'tor')
  : path.join(__dirname, '..', 'tor');
const TOR_BIN    = path.join(TOR_DIR, 'tor', 'tor.exe');
const TOR_CFGDIR = path.join(TOR_DIR, 'configs');

const TOR_INSTANCES = [
  { id: 'tor-any', cfg: 'torrc-anywhere', port: 9050, label: 'Tor - Anywhere (random exit)' },
  { id: 'tor-us',  cfg: 'torrc-us',       port: 9051, label: 'Tor - United States' },
  { id: 'tor-de',  cfg: 'torrc-de',       port: 9052, label: 'Tor - Germany' },
  { id: 'tor-nl',  cfg: 'torrc-nl',       port: 9053, label: 'Tor - Netherlands' },
  { id: 'tor-fr',  cfg: 'torrc-fr',       port: 9054, label: 'Tor - France' },
];

function startTor() {
  if (!fs.existsSync(TOR_BIN)) {
    console.warn(`[tor] tor.exe not found at ${TOR_BIN} - VPN servers will report 'unreachable'`);
    return;
  }
  for (const inst of TOR_INSTANCES) {
    const cfgPath = path.join(TOR_CFGDIR, inst.cfg);
    if (!fs.existsSync(cfgPath)) {
      console.warn(`[tor] missing config ${cfgPath} - skipping ${inst.id}`);
      continue;
    }
    console.log(`[tor] spawning ${inst.id} on 127.0.0.1:${inst.port} (cfg: ${inst.cfg})`);
    const proc = spawn(TOR_BIN, ['-f', cfgPath], {
      cwd: TOR_CFGDIR,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    proc.stdout.on('data', (d) => {
      const s = d.toString();
      // Quiet: only log bootstrap progress + warnings
      if (/Bootstrapped|Opening Socks listener|\[warn\]|\[err\]/.test(s)) {
        process.stdout.write(`[tor ${inst.id}] ${s}`);
      }
    });
    proc.stderr.on('data', (d) => process.stderr.write(`[tor ${inst.id} err] ${d}`));
    proc.on('exit', (code) => console.log(`[tor ${inst.id}] exited with ${code}`));
    torProcs.set(inst.id, proc);
  }
}

function stopTor() {
  for (const [id, p] of torProcs) {
    if (!p.killed) { try { p.kill(); } catch {} }
  }
  torProcs.clear();
}

// ====================  Backend  =============================================
function startBackend() {
  const check = require('node:net').createServer().once('error', () => {
    console.log('[backend] port 8080 already in use - skipping spawn');
  }).once('listening', () => {
    check.close();
    actuallySpawn();
  }).listen(BACKEND_PORT, '127.0.0.1');
}
function actuallySpawn() {
  const backendDir = app.isPackaged
    ? path.join(process.resourcesPath, 'backend-node')
    : path.join(__dirname, '..', 'backend-node');
  const entry = path.join(backendDir, 'server.js');
  if (!fs.existsSync(entry)) { console.error('[backend] server.js not found at', entry); return; }
  backendChild = spawn(process.execPath, [entry], {
    cwd: backendDir,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', PORT: String(BACKEND_PORT) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  backendChild.stdout.on('data', (d) => process.stdout.write(`[backend] ${d}`));
  backendChild.stderr.on('data', (d) => process.stderr.write(`[backend] ${d}`));
  backendChild.on('exit', (code) => console.log(`[backend] exited with ${code}`));
}
function stopBackend() {
  if (backendChild && !backendChild.killed) {
    try { backendChild.kill(); } catch {}
    backendChild = null;
  }
}

// ====================  OS-level proxy (real VPN)  ===========================
async function applyProxy({ enabled, host, port, type } = {}) {
  const ses = session.defaultSession;
  if (!enabled || !host) { await ses.setProxy({ mode: 'direct' }); return { applied: false }; }
  const scheme = type === 'SOCKS5' ? 'socks5' : (type === 'HTTP' ? 'http' : 'socks5');
  const rule = `${scheme}://${host}:${port}`;
  await ses.setProxy({ proxyRules: rule, proxyBypassRules: '127.0.0.1;localhost;<-loopback>' });
  console.log(`[proxy] OS-level routing -> ${rule}`);
  return { applied: true, rule };
}

// ====================  DevTools shortcuts + context menu  ===================
function bindShortcuts(contents) {
  contents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const ctrlOrCmd = input.control || input.meta;
    const isF12 = input.key === 'F12';
    const isDevtools = ctrlOrCmd && input.shift && (input.key === 'I' || input.key === 'i');
    if (isF12 || isDevtools) {
      if (contents.isDevToolsOpened()) contents.closeDevTools();
      else contents.openDevTools({ mode: 'right' });   // Chrome-default: dock to the right
      event.preventDefault();
    }
    if (ctrlOrCmd && (input.key === 'R' || input.key === 'r')) {
      contents.reload();
      event.preventDefault();
    }
  });

  contents.on('context-menu', (_e, params) => {
    const nav = contents.navigationHistory ?? contents;
    const menu = Menu.buildFromTemplate([
      { label: 'Back',    enabled: nav.canGoBack?.()    ?? false, click: () => nav.goBack?.() },
      { label: 'Forward', enabled: nav.canGoForward?.() ?? false, click: () => nav.goForward?.() },
      { label: 'Reload',  click: () => contents.reload() },
      { type: 'separator' },
      { label: 'Copy',  role: 'copy',  enabled: params.editFlags.canCopy },
      { label: 'Paste', role: 'paste', enabled: params.editFlags.canPaste },
      { label: 'Select All', role: 'selectAll', enabled: params.editFlags.canSelectAll },
      { type: 'separator' },
      { label: 'Inspect Element', click: () => {
          if (!contents.isDevToolsOpened()) contents.openDevTools({ mode: 'right' });
          contents.inspectElement(params.x, params.y);
        }
      },
    ]);
    menu.popup();
  });
}

// ====================  Native tab manager  ==================================
function broadcast(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

function createTabView(tabId, initialUrl) {
  if (tabs.has(tabId)) return tabs.get(tabId);
  const view = new WebContentsView({
    webPreferences: {
      session: session.defaultSession,
      contextIsolation: true,
      nodeIntegration: false,
      partition: 'persist:smartbrowser',
    },
  });
  view.setBackgroundColor('#0a0e22');
  mainWindow.contentView.addChildView(view);
  bindShortcuts(view.webContents);

  const wc = view.webContents;
  wc.on('did-start-loading', () => broadcast('tab:event', { tabId, type: 'loading', loading: true }));
  wc.on('did-stop-loading',  () => broadcast('tab:event', { tabId, type: 'loading', loading: false }));
  wc.on('did-navigate',         (_e, url) => broadcast('tab:event', { tabId, type: 'nav', url }));
  wc.on('did-navigate-in-page', (_e, url) => broadcast('tab:event', { tabId, type: 'nav', url }));
  wc.on('page-title-updated',   (_e, title) => broadcast('tab:event', { tabId, type: 'title', title }));
  wc.on('page-favicon-updated', (_e, favicons) => broadcast('tab:event', { tabId, type: 'favicon', favicon: favicons[0] }));
  wc.setWindowOpenHandler(({ url }) => {
    broadcast('tab:open-new', { url });   // renderer creates a new tab
    return { action: 'deny' };
  });

  tabs.set(tabId, { view });
  if (initialUrl && initialUrl !== 'about:blank') wc.loadURL(initialUrl);
  return tabs.get(tabId);
}

function destroyTabView(tabId) {
  const t = tabs.get(tabId);
  if (!t) return;
  try { mainWindow.contentView.removeChildView(t.view); } catch {}
  try { t.view.webContents.close?.() ?? t.view.webContents.destroy?.(); } catch {}
  tabs.delete(tabId);
  if (activeTabId === tabId) activeTabId = null;
}

function activateTabView(tabId) {
  // ALWAYS hide every non-matching native view first, even if the requested
  // tab has no native view (e.g. the home tab). Otherwise the previously
  // active page (YouTube etc.) bleeds through into the new tab.
  for (const [id, t] of tabs) {
    t.view.setVisible(id === tabId);
  }
  if (!tabs.has(tabId)) {
    activeTabId = null;
    return;
  }
  activeTabId = tabId;
  const t = tabs.get(tabId);
  if (t) t.view.setBounds(lastBounds);
}

function setBounds(tabId, bounds) {
  if (bounds && bounds.width > 0 && bounds.height > 0) lastBounds = bounds;
  const t = tabs.get(tabId);
  if (t) t.view.setBounds(lastBounds);
}

function setAllVisible(visible) {
  for (const t of tabs.values()) t.view.setVisible(visible);
}

// ====================  Window  ==============================================
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400, height: 900, minWidth: 900, minHeight: 600,
    title: 'SmartBrowser', backgroundColor: '#05060f',
    autoHideMenuBar: true, show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'File', submenu: [{ role: 'quit' }] },
    { label: 'Edit', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' },
      { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    { label: 'View', submenu: [
      { role: 'reload' }, { role: 'forceReload' },
      { label: 'Toggle DevTools', accelerator: 'CmdOrCtrl+Shift+I',
        click: () => {
          const target = activeTabId ? tabs.get(activeTabId)?.view.webContents : mainWindow.webContents;
          if (!target) return;
          target.isDevToolsOpened() ? target.closeDevTools() : target.openDevTools({ mode: 'right' });
        }
      },
      { type: 'separator' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
      { type: 'separator' }, { role: 'togglefullscreen' },
    ] },
  ]));

  bindShortcuts(mainWindow.webContents);

  const url = isDev
    ? FRONTEND_DEV_URL
    : `file://${path.join(__dirname, '..', 'frontend', 'dist', 'index.html')}`;
  mainWindow.loadURL(url);
  mainWindow.once('ready-to-show', () => mainWindow.show());

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  // When the host window resizes, reapply the cached bounds to the active view.
  mainWindow.on('resize', () => {
    if (!activeTabId) return;
    const t = tabs.get(activeTabId);
    if (t) t.view.setBounds(lastBounds);
  });
}

// ====================  IPC  =================================================
ipcMain.handle('vpn:apply-proxy', async (_e, payload) => applyProxy(payload));
ipcMain.handle('app:version',  () => app.getVersion());
ipcMain.handle('app:platform', () => process.platform);

ipcMain.handle('tab:create',   (_e, { tabId, url }) => { createTabView(tabId, url); });
ipcMain.handle('tab:destroy',  (_e, tabId) => destroyTabView(tabId));
ipcMain.handle('tab:activate', (_e, tabId) => activateTabView(tabId));
ipcMain.handle('tab:navigate', (_e, { tabId, url }) => {
  const t = tabs.get(tabId);
  if (t && url) t.view.webContents.loadURL(url);
});
ipcMain.handle('tab:back',     (_e, tabId) => {
  const t = tabs.get(tabId);
  if (!t) return;
  const n = t.view.webContents.navigationHistory ?? t.view.webContents;
  if (n.canGoBack?.()) n.goBack?.();
});
ipcMain.handle('tab:forward',  (_e, tabId) => {
  const t = tabs.get(tabId);
  if (!t) return;
  const n = t.view.webContents.navigationHistory ?? t.view.webContents;
  if (n.canGoForward?.()) n.goForward?.();
});
ipcMain.handle('tab:reload',   (_e, tabId) => { tabs.get(tabId)?.view.webContents.reload(); });
ipcMain.handle('tab:bounds',   (_e, { tabId, bounds }) => setBounds(tabId, bounds));
ipcMain.handle('tab:set-all-visible', (_e, visible) => setAllVisible(visible));
ipcMain.handle('tab:open-devtools', (_e, tabId) => {
  const target = tabId ? tabs.get(tabId)?.view.webContents : mainWindow.webContents;
  if (!target) return;
  target.isDevToolsOpened() ? target.closeDevTools() : target.openDevTools({ mode: 'right' });
});

// ====================  Lifecycle  ===========================================
app.whenReady().then(() => {
  startTor();
  startBackend();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
app.on('window-all-closed', () => {
  stopBackend();
  stopTor();
  if (process.platform !== 'darwin') app.quit();
});
app.on('before-quit', () => { stopBackend(); stopTor(); });
