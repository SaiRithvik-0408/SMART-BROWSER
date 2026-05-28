// SmartBrowser - Electron main process
// Native WebContentsView per tab so DevTools can dock to the SmartBrowser window
// (same architecture Chrome itself uses).

const { app, BrowserWindow, WebContentsView, ipcMain, session, shell, Menu } = require('electron');
const path = require('node:path');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const adblock = require('./adblock');
const updater = require('./updater');
const history = require('./history');
const downloads = require('./downloads');
const passwords = require('./passwords');
const settings = require('./settings');
const notes = require('./notes');
const extensions = require('./extensions');
const storeMod = require('./store');

// One canonical session for ALL browsing traffic. Both the tabs (created via
// WebContentsView) and the things we attach to a session (proxy / adblock /
// downloads / UA) MUST live on the same session, otherwise — and this was the
// VPN bug — applying a proxy to defaultSession has no effect on tab traffic
// that's actually running on `persist:smartbrowser`. We use a single partition
// everywhere from now on.
const BROWSER_PARTITION = 'persist:smartbrowser';
function browserSession() { return session.fromPartition(BROWSER_PARTITION); }

// Rewrite legacy/redirect hosts to their modern equivalents.
// Reddit's old.reddit.com is the dated UI; route to the current www.reddit.com.
function normalizeUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return rawUrl;
  try {
    const u = new URL(rawUrl);
    if (u.hostname === 'old.reddit.com' || u.hostname === 'i.reddit.com') {
      u.hostname = 'www.reddit.com';
      return u.href;
    }
  } catch {}
  return rawUrl;
}

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
const TOR_BIN    = path.join(TOR_DIR, 'tor', process.platform === 'win32' ? 'tor.exe' : 'tor');
const TOR_CFGDIR = path.join(TOR_DIR, 'configs');
// Tor must be able to write its cached consensus + microdescriptors. In a
// packaged install resources/ is read-only, so park per-instance DataDirectory
// under app.getPath('userData').
const TOR_DATAROOT = path.join(app.getPath('userData'), 'tor-data');

const TOR_INSTANCES = [
  { id: 'tor-any', cfg: 'torrc-anywhere', port: 9050, label: 'Tor - Anywhere (random exit)' },
  { id: 'tor-us',  cfg: 'torrc-us',       port: 9051, label: 'Tor - United States' },
  { id: 'tor-de',  cfg: 'torrc-de',       port: 9052, label: 'Tor - Germany' },
  { id: 'tor-nl',  cfg: 'torrc-nl',       port: 9053, label: 'Tor - Netherlands' },
  { id: 'tor-fr',  cfg: 'torrc-fr',       port: 9054, label: 'Tor - France' },
];

function startTor() {
  if (!fs.existsSync(TOR_BIN)) {
    console.warn(`[tor] tor binary not found at ${TOR_BIN} - VPN servers will report 'unreachable'`);
    return;
  }
  fs.mkdirSync(TOR_DATAROOT, { recursive: true });
  for (const inst of TOR_INSTANCES) {
    const cfgPath = path.join(TOR_CFGDIR, inst.cfg);
    if (!fs.existsSync(cfgPath)) {
      console.warn(`[tor] missing config ${cfgPath} - skipping ${inst.id}`);
      continue;
    }
    const dataDir = path.join(TOR_DATAROOT, inst.id);
    fs.mkdirSync(dataDir, { recursive: true });
    const geoip  = path.join(TOR_DIR, 'data', 'geoip');
    const geoip6 = path.join(TOR_DIR, 'data', 'geoip6');

    console.log(`[tor] spawning ${inst.id} on 127.0.0.1:${inst.port} (cfg: ${inst.cfg}, data: ${dataDir})`);
    // Override torrc DataDirectory + GeoIP paths via CLI so the same config
    // file works in dev and in a packaged install.
    const args = [
      '-f', cfgPath,
      '--DataDirectory', dataDir,
      '--GeoIPFile',     geoip,
      '--GeoIPv6File',   geoip6,
    ];
    const proc = spawn(TOR_BIN, args, {
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
  // Apply to the same session the tabs use, otherwise nothing routes through
  // the proxy (see BROWSER_PARTITION comment).
  const ses = browserSession();
  if (!enabled || !host) {
    await ses.setProxy({ mode: 'direct' });
    console.log('[proxy] direct (no tunnel)');
    return { applied: false };
  }
  const scheme = type === 'SOCKS5' ? 'socks5' : (type === 'HTTP' ? 'http' : 'socks5');
  const rule = `${scheme}://${host}:${port}`;
  await ses.setProxy({ proxyRules: rule, proxyBypassRules: '127.0.0.1;localhost;<-loopback>' });
  console.log(`[proxy] tab traffic now routed via ${rule}`);
  return { applied: true, rule };
}

// ====================  DevTools shortcuts + context menu  ===================
// `isShell` toggles the shortcut targeting behavior:
//   - false (default): shortcuts act on `contents` itself. Used for tab
//     WebContentsViews — Ctrl+R reloads the tab, Ctrl+S downloads the
//     tab's URL, etc.
//   - true: shortcuts act on the ACTIVE TAB rather than `contents`. Used
//     for mainWindow.webContents (the React shell). Without this, pressing
//     Ctrl+R while focus is on the omnibox / a panel / the tabs strip
//     would reload the React shell and wipe the tabs list. Same trick
//     the zoom shortcuts already use.
function bindShortcuts(contents, opts = {}) {
  const isShell = opts.isShell === true;
  // Resolve the page we should act on at the moment a shortcut fires.
  // For shell shortcuts, returns the focused tab (or null if no tab is
  // active — in which case the shortcut is a no-op rather than nuking
  // the React shell).
  const targetWc = () => {
    if (!isShell) return contents;
    return activeTabWebContents();
  };

  contents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const ctrlOrCmd = input.control || input.meta;
    const isF12 = input.key === 'F12';
    const isDevtools = ctrlOrCmd && input.shift && (input.key === 'I' || input.key === 'i');
    if (isF12 || isDevtools) {
      const t = targetWc() || contents;
      if (t.isDevToolsOpened()) t.closeDevTools();
      else t.openDevTools({ mode: 'right' });
      event.preventDefault();
    }
    if ((ctrlOrCmd && (input.key === 'R' || input.key === 'r')) || input.key === 'F5') {
      const t = targetWc();
      if (t) { input.shift ? t.reloadIgnoringCache() : t.reload(); }
      event.preventDefault();
    }
    if (ctrlOrCmd && (input.key === 'S' || input.key === 's')) {
      const t = targetWc();
      if (t) { try { t.downloadURL(t.getURL()); } catch {} }
      event.preventDefault();
    }
    if (ctrlOrCmd && (input.key === 'P' || input.key === 'p')) {
      const t = targetWc();
      if (t) { try { t.print({ silent: false, printBackground: true }); } catch {} }
      event.preventDefault();
    }
    if (ctrlOrCmd && (input.key === 'U' || input.key === 'u')) {
      const t = targetWc();
      if (t) { try { broadcast('tab:open-new', { url: `view-source:${t.getURL()}` }); } catch {} }
      event.preventDefault();
    }
    // Zoom shortcuts — always route to the active tab via zoomActiveTab so
    // the React shell never zooms (which would break layouts). Covers all
    // common physical keys: =/+ / numpad +, -/_ / numpad -, 0.
    if (ctrlOrCmd && !input.alt) {
      const k = input.key;
      const isPlus  = k === '+' || k === '=' || (input.shift && k === '=');
      const isMinus = k === '-' || k === '_';
      const isZero  = k === '0';
      if (isPlus)  { zoomActiveTab('in');    event.preventDefault(); }
      if (isMinus) { zoomActiveTab('out');   event.preventDefault(); }
      if (isZero)  { zoomActiveTab('reset'); event.preventDefault(); }
    }
  });

  contents.on('context-menu', (_e, params) => {
    const nav = contents.navigationHistory ?? contents;
    const url = contents.getURL();
    const isWebPage = /^https?:/.test(url);

    // Link-specific entries appear only when right-click hit a real <a href>.
    const link = params.linkURL || '';
    const linkItems = link ? [
      { label: 'Open link in new tab', click: () => broadcast('tab:open-new', { url: link }) },
      { label: 'Copy link address',    click: () => { try { require('electron').clipboard.writeText(link); } catch {} } },
      { type: 'separator' },
    ] : [];

    // Image-specific entries.
    const img = params.srcURL && params.mediaType === 'image' ? params.srcURL : '';
    const imageItems = img ? [
      { label: 'Open image in new tab', click: () => broadcast('tab:open-new', { url: img }) },
      { label: 'Copy image address',    click: () => { try { require('electron').clipboard.writeText(img); } catch {} } },
      { label: 'Save image as...',      click: () => contents.downloadURL(img) },
      { type: 'separator' },
    ] : [];

    // Selection-specific entries (Search the web).
    const sel = (params.selectionText || '').trim();
    const selectionItems = sel ? [
      { label: `Search the web for "${sel.length > 30 ? sel.slice(0, 30) + '...' : sel}"`,
        click: () => {
          const q = settings.searchUrlFor(sel);
          broadcast('tab:open-new', { url: q });
        }
      },
      { type: 'separator' },
    ] : [];

    const template = [
      { label: 'Back',    accelerator: 'Alt+Left',  enabled: nav.canGoBack?.()    ?? false, click: () => nav.goBack?.() },
      { label: 'Forward', accelerator: 'Alt+Right', enabled: nav.canGoForward?.() ?? false, click: () => nav.goForward?.() },
      { label: 'Reload',  accelerator: 'Ctrl+R',    click: () => contents.reload() },
      { type: 'separator' },
      ...linkItems,
      ...imageItems,
      ...selectionItems,
      { label: 'Copy',       role: 'copy',      enabled: params.editFlags.canCopy },
      { label: 'Paste',      role: 'paste',     enabled: params.editFlags.canPaste },
      { label: 'Select All', role: 'selectAll', enabled: params.editFlags.canSelectAll },
      { type: 'separator' },
      // Chrome-equivalent page actions.
      { label: 'Save page as...', accelerator: 'Ctrl+S', enabled: isWebPage,
        click: () => contents.downloadURL(url) },
      { label: 'Print...', accelerator: 'Ctrl+P', enabled: isWebPage,
        click: () => contents.print({ silent: false, printBackground: true }) },
      { label: 'Create QR Code for this page', enabled: isWebPage,
        click: () => {
          // QR Server is a tiny free image API — opens the QR PNG in a new tab.
          const qr = `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(url)}`;
          broadcast('tab:open-new', { url: qr });
        } },
      { label: 'Translate to English', enabled: isWebPage,
        click: () => broadcast('tab:open-new', { url: `https://translate.google.com/translate?sl=auto&tl=en&u=${encodeURIComponent(url)}` }) },
      { type: 'separator' },
      { label: 'View page source', accelerator: 'Ctrl+U', enabled: isWebPage,
        click: () => broadcast('tab:open-new', { url: `view-source:${url}` }) },
      { label: 'Inspect',
        accelerator: 'Ctrl+Shift+I',
        click: () => {
          if (!contents.isDevToolsOpened()) contents.openDevTools({ mode: 'right' });
          contents.inspectElement(params.x, params.y);
        }
      },
    ];
    Menu.buildFromTemplate(template).popup();
  });
}

// ====================  Native tab manager  ==================================
function broadcast(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

// Brave-style window title: "<active tab title> — SmartBrowser" (or just
// "SmartBrowser" on the home tab / when no tab is loaded).
function syncWindowTitle(title) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const t = (title || '').trim();
  mainWindow.setTitle(t ? `${t} \u2014 SmartBrowser` : 'SmartBrowser');
}

function createTabView(tabId, initialUrl) {
  if (tabs.has(tabId)) return tabs.get(tabId);
  const view = new WebContentsView({
    webPreferences: {
      // partition wins over `session` when both are set, so we ONLY pass
      // partition — and we use the same one everywhere (proxy/adblock/
      // downloads/UA all attach to this session via browserSession()).
      partition: BROWSER_PARTITION,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  view.setBackgroundColor('#0a0e22');
  mainWindow.contentView.addChildView(view);
  bindShortcuts(view.webContents);

  const wc = view.webContents;
  // Apply cosmetic ad-hiding CSS once the DOM is ready on every navigation.
  wc.on('dom-ready', () => adblock.applyCosmetic(wc));
  // Also re-apply after lazy frames load (YouTube renders most chrome
  // after DOMContentLoaded, so dom-ready alone misses the Premium buttons).
  wc.on('did-finish-load', () => adblock.applyCosmetic(wc));
  // Redirect legacy hosts (e.g. old.reddit.com -> www.reddit.com) before load.
  wc.on('will-navigate', (event, url) => {
    const normalized = normalizeUrl(url);
    if (normalized !== url) {
      event.preventDefault();
      wc.loadURL(normalized);
    }
  });
  wc.on('did-start-loading', () => broadcast('tab:event', { tabId, type: 'loading', loading: true }));
  wc.on('did-stop-loading',  () => broadcast('tab:event', { tabId, type: 'loading', loading: false }));
  wc.on('did-navigate',         (_e, url) => {
    broadcast('tab:event', { tabId, type: 'nav', url });
    history.record(url, { tabId });
  });
  wc.on('did-navigate-in-page', (_e, url) => {
    broadcast('tab:event', { tabId, type: 'nav', url });
    history.record(url, { tabId });
  });
  wc.on('page-title-updated',   (_e, title) => {
    broadcast('tab:event', { tabId, type: 'title', title });
    if (tabId === activeTabId) syncWindowTitle(title);
    try { history.patchTitle(wc.getURL(), title); } catch {}
  });
  wc.on('page-favicon-updated', (_e, favicons) => {
    broadcast('tab:event', { tabId, type: 'favicon', favicon: favicons[0] });
    try { history.patchFavicon(wc.getURL(), favicons[0]); } catch {}
  });
  wc.setWindowOpenHandler(({ url }) => {
    broadcast('tab:open-new', { url });   // renderer creates a new tab
    return { action: 'deny' };
  });

  // Any focus on the native view (the user clicked into the page) tells the
  // chrome to dismiss floating panels (Notes, VPN). Mouse events on the
  // WebContentsView don't bubble into our React layer, so without this the
  // panels would only close via the explicit X button.
  wc.on('focus', () => broadcast('chrome:page-focus', { tabId }));

  tabs.set(tabId, { view });
  if (initialUrl && initialUrl !== 'about:blank') wc.loadURL(normalizeUrl(initialUrl));
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
    syncWindowTitle('');                // home tab — just "SmartBrowser"
    return;
  }
  activeTabId = tabId;
  const t = tabs.get(tabId);
  if (t) {
    t.view.setBounds(lastBounds);
    try { syncWindowTitle(t.view.webContents.getTitle()); } catch {}
  }
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

// Resolve the runtime icon path. In dev we point at the source PNG (which is
// always present in the repo); in a packaged app electron-builder ships the
// .ico under resources/build/, but the `extraResources`-free root is also
// fine for the BrowserWindow icon — Electron tolerates either format on
// Windows. We try a few likely paths and fall back to undefined if none are
// found (so the build doesn't crash on developers who haven't run
// `node scripts/build-icons.js` yet).
function resolveAppIcon() {
  // Windows really wants a multi-resolution .ico for the BrowserWindow
  // (titlebar / taskbar / alt-tab); everywhere else prefer the high-res PNG.
  const isWin = process.platform === 'win32';
  const names = isWin
    ? ['icon.ico', 'icon.png']
    : ['icon.png', 'icon.ico'];
  const roots = [
    path.join(__dirname, '..', 'build'),
    process.resourcesPath ? path.join(process.resourcesPath, 'build') : null,
    process.resourcesPath ? path.join(process.resourcesPath, 'app.asar.unpacked', 'build') : null,
  ].filter(Boolean);
  const fs = require('node:fs');
  for (const root of roots) {
    for (const name of names) {
      const p = path.join(root, name);
      try { if (fs.existsSync(p)) return p; } catch {}
    }
  }
  return undefined;
}
const APP_ICON_PATH = resolveAppIcon();

function createWindow() {
  // Brave-style integrated tab strip: hide the native title bar and let the
  // OS draw min/max/close as a transparent overlay (right side on Windows /
  // Linux, traffic lights top-left on macOS). The TabsBar component is then
  // marked as a drag region so the window is still movable.
  const isMac = process.platform === 'darwin';
  mainWindow = new BrowserWindow({
    width: 1400, height: 900, minWidth: 900, minHeight: 600,
    title: 'SmartBrowser', backgroundColor: '#05060f',
    icon: APP_ICON_PATH,
    autoHideMenuBar: true, show: false,
    frame: isMac ? true : false,                          // Win/Linux: chromeless
    titleBarStyle: isMac ? 'hiddenInset' : 'hidden',
    ...(isMac ? { trafficLightPosition: { x: 12, y: 14 } } : {
      titleBarOverlay: {
        color: '#05060f',          // chrome bg behind the buttons
        symbolColor: '#e6e9f5',    // glyph colour for min/max/close
        height: 40,
      },
    }),
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
      // Override the default reload roles so the accelerator (Ctrl+R /
      // Ctrl+Shift+R) NEVER reloads the React shell — which would wipe
      // the tabs array and any UI state. Always route to the focused
      // tab via activeTabWebContents().
      {
        label: 'Reload', accelerator: 'CmdOrCtrl+R',
        click: () => { const wc = activeTabWebContents(); if (wc) wc.reload(); },
      },
      {
        label: 'Force Reload', accelerator: 'CmdOrCtrl+Shift+R',
        click: () => { const wc = activeTabWebContents(); if (wc) wc.reloadIgnoringCache(); },
      },
      { label: 'Toggle DevTools', accelerator: 'CmdOrCtrl+Shift+I',
        click: () => {
          const target = activeTabId ? tabs.get(activeTabId)?.view.webContents : mainWindow.webContents;
          if (!target) return;
          target.isDevToolsOpened() ? target.closeDevTools() : target.openDevTools({ mode: 'right' });
        }
      },
      { type: 'separator' },
      // Override the built-in zoom roles. The defaults call setZoomLevel on
      // whatever webContents has keyboard focus, which on the home page is
      // the React shell — and zooming the shell breaks our chrome. Route
      // everything through zoomActiveTab() so only the actual page zooms.
      { label: 'Reset Zoom', accelerator: 'CmdOrCtrl+0', click: () => zoomActiveTab('reset') },
      { label: 'Zoom In',    accelerator: 'CmdOrCtrl+=', click: () => zoomActiveTab('in')  },
      { label: 'Zoom In',    accelerator: 'CmdOrCtrl+Plus', visible: false, click: () => zoomActiveTab('in') },
      { label: 'Zoom In',    accelerator: 'CmdOrCtrl+numadd', visible: false, click: () => zoomActiveTab('in') },
      { label: 'Zoom Out',   accelerator: 'CmdOrCtrl+-', click: () => zoomActiveTab('out') },
      { label: 'Zoom Out',   accelerator: 'CmdOrCtrl+numsub', visible: false, click: () => zoomActiveTab('out') },
      { type: 'separator' }, { role: 'togglefullscreen' },
    ] },
  ]));

  bindShortcuts(mainWindow.webContents, { isShell: true });

  // The React shell's own <title> would otherwise overwrite the window title
  // every time the renderer re-renders. We manage the window title manually
  // via syncWindowTitle() based on the active tab.
  mainWindow.webContents.on('page-title-updated', (e) => e.preventDefault());

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

ipcMain.handle('adblock:stats', () => adblock.stats());
ipcMain.handle('adblock:set',   (_e, enabled) => { adblock.setEnabled(enabled); return adblock.stats(); });

ipcMain.handle('update:check', async () => {
  try { return await updater.check(); }
  catch (e) { return { available: false, error: e.message }; }
});
ipcMain.handle('update:apply', async () => {
  try {
    return await updater.apply((pct) => broadcast('update:progress', Math.round(pct * 100)));
  } catch (e) {
    broadcast('update:error', e.message);
    return { applying: false, error: e.message };
  }
});

ipcMain.handle('tab:create',   (_e, { tabId, url }) => { createTabView(tabId, url); });
ipcMain.handle('tab:destroy',  (_e, tabId) => destroyTabView(tabId));
ipcMain.handle('tab:activate', (_e, tabId) => activateTabView(tabId));
ipcMain.handle('tab:navigate', (_e, { tabId, url }) => {
  const t = tabs.get(tabId);
  if (t && url) t.view.webContents.loadURL(normalizeUrl(url));
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

// ----- Browser-wide actions (driven by the hamburger menu) ----------------
// activeWebContents() resolves the currently focused tab. For most actions
// we want a window-level fallback (Find on the new-tab page is fine, Print
// nothing is fine). But zoom MUST NEVER fall back to mainWindow because
// `setZoomLevel` on mainWindow.webContents scales the entire React shell
// and breaks the layout (omnibar, tabs strip, widget grid all shrink).
// activeTabWebContents() is the strict, no-fallback variant used by zoom.
function activeWebContents() {
  if (activeTabId) {
    const t = tabs.get(activeTabId);
    if (t) return t.view.webContents;
  }
  return mainWindow?.webContents;
}
function activeTabWebContents() {
  if (!activeTabId) return null;
  const t = tabs.get(activeTabId);
  return t ? t.view.webContents : null;
}

// Applies a zoom delta/value to the active tab and returns the new level.
// Returns null when there's no tab to zoom (e.g. user is on the home page).
// All zoom entrypoints — IPC, Application Menu roles, keyboard shortcuts —
// funnel through this so the React shell is never zoomed.
function zoomActiveTab(direction) {
  const wc = activeTabWebContents();
  if (!wc) return null;
  const cur = wc.getZoomLevel?.() ?? 0;
  // 'query' is a read-only ping used by the renderer to populate the menu
  // badge — don't write anything, just echo the current zoom back.
  if (direction === 'query') return cur;
  let next = cur;
  if (direction === 'in')         next = Math.min(cur + 0.5, 5);
  else if (direction === 'out')   next = Math.max(cur - 0.5, -3);
  else if (direction === 'reset') next = 0;
  else if (typeof direction === 'number') next = direction;
  try { wc.setZoomLevel?.(next); } catch {}
  return next;
}

ipcMain.handle('browser:zoom', (_e, direction) => zoomActiveTab(direction));

ipcMain.handle('browser:find', (_e, query) => {
  const wc = activeWebContents();
  if (!wc) return false;
  if (!query) { try { wc.stopFindInPage?.('clearSelection'); } catch {} return true; }
  try { wc.findInPage?.(String(query)); return true; } catch { return false; }
});

ipcMain.handle('browser:print', () => {
  const wc = activeWebContents();
  if (!wc) return false;
  try { wc.print?.({ silent: false, printBackground: true }); return true; } catch { return false; }
});

ipcMain.handle('browser:save-page', async () => {
  const wc = activeWebContents();
  if (!wc) return false;
  try {
    const url = wc.getURL();
    const title = wc.getTitle() || 'page';
    const safe = title.replace(/[\\/:*?"<>|]+/g, '_').slice(0, 80) || 'page';
    const { dialog } = require('electron');
    const win = BrowserWindow.fromWebContents(wc) || mainWindow;
    const res = await dialog.showSaveDialog(win, {
      title: 'Save Page As',
      defaultPath: `${safe}.html`,
      filters: [{ name: 'HTML', extensions: ['html', 'htm'] }],
    });
    if (res.canceled || !res.filePath) return false;
    await wc.savePage(res.filePath, 'HTMLComplete');
    return true;
  } catch { return false; }
});

// Clear browsing data — accepts a categories object so the renderer can
// surface a Chromium-style dialog later. For the menu's one-click "Clear"
// we just nuke everything we own: history, downloads, and the shared
// session's HTTP cache + cookies.
ipcMain.handle('browser:clear-data', async (_e, opts) => {
  const o = Object.assign({ history: true, downloads: true, cache: true, cookies: false }, opts || {});
  const out = { history: false, downloads: false, cache: false, cookies: false };
  if (o.history)   { try { await history.clear({}); out.history = true; } catch {} }
  if (o.downloads) { try { await downloads.clearAll(); out.downloads = true; } catch {} }
  try {
    const ses = browserSession();
    if (o.cache)   { await ses.clearCache(); out.cache = true; }
    if (o.cookies) { await ses.clearStorageData({ storages: ['cookies'] }); out.cookies = true; }
  } catch {}
  return out;
});

// New window — spawn another top-level BrowserWindow. Cheap because they
// share the persistent `persist:smartbrowser` session under the hood, so
// cookies/logins/extensions/VPN all carry across.
ipcMain.handle('window:new', () => {
  createWindow();
  return true;
});

// ----- History -----------------------------------------------------------
ipcMain.handle('history:list',   (_e, opts)  => history.list(opts || {}));
ipcMain.handle('history:remove', (_e, ts)    => history.remove(ts));
ipcMain.handle('history:clear',  (_e, opts)  => history.clear(opts || {}));

// ----- Downloads ---------------------------------------------------------
ipcMain.handle('downloads:list',   ()         => downloads.list());
ipcMain.handle('downloads:pause',  (_e, id)   => downloads.pause(id));
ipcMain.handle('downloads:resume', (_e, id)   => downloads.resume(id));
ipcMain.handle('downloads:cancel', (_e, id)   => downloads.cancel(id));
ipcMain.handle('downloads:open',   (_e, id)   => downloads.openFile(id));
ipcMain.handle('downloads:show',   (_e, id)   => downloads.showFile(id));
ipcMain.handle('downloads:remove', (_e, id)   => downloads.removeRecord(id));
ipcMain.handle('downloads:clear',  ()         => downloads.clearAll());

// ----- Passwords ---------------------------------------------------------
ipcMain.handle('passwords:available', ()       => passwords.isAvailable());
ipcMain.handle('passwords:list',      ()       => passwords.list());
ipcMain.handle('passwords:reveal',    (_e, id) => passwords.reveal(id));
ipcMain.handle('passwords:upsert',    (_e, e)  => passwords.upsert(e || {}));
ipcMain.handle('passwords:remove',    (_e, id) => passwords.remove(id));

// ----- Settings ----------------------------------------------------------
ipcMain.handle('settings:get',  () => settings.get());
ipcMain.handle('settings:set',  (_e, patch) => {
  const next = settings.set(patch || {});
  // Apply any side-effects.
  if ('adblockEnabled' in patch) adblock.setEnabled(!!patch.adblockEnabled);
  if ('historyEnabled' in patch) history.setEnabled(!!patch.historyEnabled);
  return next;
});
ipcMain.handle('settings:search-url', (_e, q) => settings.searchUrlFor(String(q || '')));

// ----- Notes -------------------------------------------------------------
ipcMain.handle('notes:list',   ()              => notes.list());
ipcMain.handle('notes:get',    (_e, id)        => notes.get(id));
ipcMain.handle('notes:create', (_e, body)      => notes.create(body || {}));
ipcMain.handle('notes:update', (_e, { id, patch }) => notes.update(id, patch || {}));
ipcMain.handle('notes:remove', (_e, id)        => notes.remove(id));

// ----- Extensions --------------------------------------------------------
ipcMain.handle('extensions:list', () => extensions.list());
ipcMain.handle('extensions:install-folder', async (e) => {
  const w = BrowserWindow.fromWebContents(e.sender) || mainWindow;
  const dir = await extensions.pickFolder(w);
  if (!dir) return { canceled: true };
  try { return await extensions.installFromDir(dir); }
  catch (err) { return { error: err.message }; }
});
ipcMain.handle('extensions:install-crx', async (e) => {
  const w = BrowserWindow.fromWebContents(e.sender) || mainWindow;
  const file = await extensions.pickCrx(w);
  if (!file) return { canceled: true };
  try { return await extensions.installFromCrx(file); }
  catch (err) { return { error: err.message }; }
});
ipcMain.handle('extensions:remove',      (_e, id)               => extensions.remove(id));
ipcMain.handle('extensions:set-enabled', (_e, { id, enabled })  => extensions.setEnabled(id, enabled));

// On Windows the OS groups taskbar buttons by AppUserModelID. Without an
// explicit ID, dev runs of an Electron app inherit the default Electron ID
// and show up as "Electron" in the taskbar / start menu / jump lists. Set
// this BEFORE the first window is created so the very first taskbar entry
// uses the right name + icon. Packaged builds get this set automatically
// from build.appId, but dev runs still need the manual call.
if (process.platform === 'win32' && app.setAppUserModelId) {
  app.setAppUserModelId('com.smartbrowser.app');
}

// ====================  Lifecycle  ===========================================
app.whenReady().then(() => {
  // Strip Electron-specific tokens so sites see a plain Chrome user agent.
  // This prevents sites like DuckDuckGo from showing "upgrade your browser" ads
  // and stops servers from fingerprinting the app as an Electron shell.
  // CRITICAL: must run on the SAME session the tabs use, not defaultSession.
  const browsingSession = browserSession();
  const cleanUA = browsingSession.getUserAgent()
    .replace(/\s+Electron\/\S+/, '')
    .replace(/\s+smart-browser\/\S+/, '');
  browsingSession.setUserAgent(cleanUA);
  // Mirror on defaultSession too, just in case some internal Electron call
  // uses it (no harm if it has no tabs).
  session.defaultSession.setUserAgent(cleanUA);

  // Install the built-in ad/tracker blocker on the SAME session the tabs use,
  // applying the user's persisted preference. (Was on defaultSession, which
  // is why the blocker had no effect on real tab traffic.)
  const userSettings = settings.get();
  adblock.install(browsingSession);
  adblock.setEnabled(userSettings.adblockEnabled !== false);
  history.setEnabled(userSettings.historyEnabled !== false);

  // Install downloads tracking on the SAME session the tabs use.
  downloads.install(browsingSession, broadcast);

  // Load any previously-installed Chrome extensions into the same session.
  // Best-effort; failures are logged but don't block startup.
  extensions.loadAll(browsingSession).catch((e) => console.warn('[extensions] loadAll:', e.message));

  startTor();
  startBackend();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  // Check for a newer release shortly after launch, then every 6 hours.
  // Non-blocking and best-effort: failures are swallowed.
  const announceUpdate = (info) => {
    if (info && info.available) broadcast('update:available', info);
  };
  const runCheck = () => updater.check().then(announceUpdate).catch(() => {});
  setTimeout(runCheck, 8000);
  setInterval(runCheck, 6 * 60 * 60 * 1000);
});
app.on('window-all-closed', () => {
  stopBackend();
  stopTor();
  if (process.platform !== 'darwin') app.quit();
});
app.on('before-quit', () => { stopBackend(); stopTor(); storeMod.flushAll(); });
