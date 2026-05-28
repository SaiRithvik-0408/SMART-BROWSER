// SmartBrowser — Chrome extensions support.
//
// Electron ships with Chrome's extension API built into its Chromium fork,
// so we can load (most) Chrome extensions via `session.loadExtension(path)`.
// What we layer on top:
//
//   1. **Install from folder** — point at an unpacked extension dir; we copy
//      it into `userData/sb-extensions/<name>-<id>/` and load it.
//   2. **Install from .crx** — strip the CRX header (v2 or v3), unzip the
//      embedded package into our extensions dir, and load it. This is how
//      most Chrome Web Store extensions ship if downloaded as a file.
//   3. **Enable / disable** — disabled extensions stay on disk but aren't
//      loaded into the session on startup.
//   4. **Remove** — unload from the session and delete the on-disk folder.
//
// LIMITATIONS (worth documenting because they trip users):
//   - Toolbar popups (browser_action / page_action) are NOT rendered today.
//     Electron has limited UI surfacing for them; if a content script does
//     the work without a toolbar UI, the extension still functions. Manifest
//     v3 service workers DO run.
//   - We can't install from chrome.google.com/webstore directly because that
//     flow is gated behind Chrome-only DRM. Users should download .crx via
//     a CRX downloader (e.g. crxextractor.com) and "Install from .crx".
//   - Enterprise-policy / DRM-protected extensions don't work in Electron.
//
// Loaded extensions persist across launches because we re-call loadExtension
// on every startup from `loadAll()`. We don't trust Electron's bundled
// extension store because it's bundled-specific and was deprecated.

const { app, session, dialog } = require('electron');
const fs   = require('node:fs');
const fsp  = require('node:fs/promises');
const path = require('node:path');

const EXT_DIR   = () => path.join(app.getPath('userData'), 'sb-extensions');
const META_FILE = () => path.join(app.getPath('userData'), 'sb-store', 'extensions.json');

let _session = null;
const loadedById = new Map();   // extId -> Electron.Extension
let metadata = {};              // extId -> { enabled, installedAt, source }

function ensureDirs() {
  fs.mkdirSync(EXT_DIR(), { recursive: true });
  fs.mkdirSync(path.dirname(META_FILE()), { recursive: true });
}

function loadMeta() {
  try { metadata = JSON.parse(fs.readFileSync(META_FILE(), 'utf-8')) || {}; }
  catch { metadata = {}; }
}
function saveMeta() {
  try { fs.writeFileSync(META_FILE(), JSON.stringify(metadata, null, 2), 'utf-8'); }
  catch (e) { console.warn('[extensions] saveMeta:', e.message); }
}

// Chrome packages sometimes wrap their actual root in a version folder
// (e.g. `MyExt/1.2.3/manifest.json`). Look one level deep if the manifest
// isn't right at the top.
async function findManifest(dir) {
  const direct = path.join(dir, 'manifest.json');
  if (fs.existsSync(direct)) return direct;
  let entries = [];
  try { entries = await fsp.readdir(dir); } catch { return null; }
  for (const e of entries) {
    const sub = path.join(dir, e, 'manifest.json');
    if (fs.existsSync(sub)) return sub;
  }
  return null;
}

async function copyDir(src, dest) {
  await fsp.mkdir(dest, { recursive: true });
  const entries = await fsp.readdir(src, { withFileTypes: true });
  for (const e of entries) {
    const s = path.join(src, e.name);
    const d = path.join(dest, e.name);
    if (e.isDirectory()) await copyDir(s, d);
    else await fsp.copyFile(s, d);
  }
}

async function loadAll(ses) {
  _session = ses;
  ensureDirs();
  loadMeta();
  let folders = [];
  try { folders = await fsp.readdir(EXT_DIR()); } catch { return; }

  for (const folder of folders) {
    const full = path.join(EXT_DIR(), folder);
    let stat; try { stat = await fsp.stat(full); } catch { continue; }
    if (!stat.isDirectory()) continue;

    // If the user previously DISABLED this one, skip the load step but keep
    // it on disk so they can flip it back on without re-installing.
    const explicit = Object.values(metadata).find((m) => m?.source === folder);
    if (explicit && explicit.enabled === false) continue;

    const manifestPath = await findManifest(full);
    if (!manifestPath) {
      console.warn('[extensions] no manifest.json under', full);
      continue;
    }
    const root = path.dirname(manifestPath);
    try {
      const ext = await ses.loadExtension(root, { allowFileAccess: true });
      loadedById.set(ext.id, ext);
      if (!metadata[ext.id]) {
        metadata[ext.id] = { enabled: true, installedAt: Date.now(), source: folder };
      } else {
        metadata[ext.id].source = folder;
      }
    } catch (e) {
      console.warn(`[extensions] failed to load ${folder}:`, e.message);
    }
  }
  saveMeta();
}

function list() {
  const out = [];
  const seen = new Set();

  for (const [id, ext] of loadedById) {
    seen.add(id);
    out.push({
      id,
      name: ext.manifest?.name || '(unknown)',
      version: ext.manifest?.version || '',
      description: ext.manifest?.description || '',
      manifestVersion: ext.manifest?.manifest_version || 2,
      enabled: true,
      installedAt: metadata[id]?.installedAt || null,
    });
  }
  // Disabled or not-loaded entries — surface them so the user can re-enable.
  for (const id of Object.keys(metadata)) {
    if (seen.has(id)) continue;
    const folder = metadata[id]?.source;
    if (!folder) continue;
    try {
      const mp = path.join(EXT_DIR(), folder, 'manifest.json');
      const dir = fs.existsSync(mp) ? path.dirname(mp) : null;
      if (!dir) continue;
      const m = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf-8'));
      out.push({
        id,
        name: m.name || folder,
        version: m.version || '',
        description: m.description || '',
        manifestVersion: m.manifest_version || 2,
        enabled: false,
        installedAt: metadata[id]?.installedAt || null,
      });
    } catch {}
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

async function installFromDir(srcDir) {
  ensureDirs();
  const manifestPath = await findManifest(srcDir);
  if (!manifestPath) throw new Error('No manifest.json in selected folder');
  const manifest = JSON.parse(await fsp.readFile(manifestPath, 'utf-8'));

  const slug = (manifest.name || 'extension')
    .replace(/[^a-z0-9-]+/gi, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 40) || 'extension';
  const targetName = `${slug}-${Date.now().toString(36)}`;
  const targetDir  = path.join(EXT_DIR(), targetName);
  await copyDir(path.dirname(manifestPath), targetDir);

  const ext = await _session.loadExtension(targetDir, { allowFileAccess: true });
  loadedById.set(ext.id, ext);
  metadata[ext.id] = { enabled: true, installedAt: Date.now(), source: targetName };
  saveMeta();
  return { id: ext.id, name: ext.manifest?.name, version: ext.manifest?.version };
}

// CRX header parser.
//   CRX2: "Cr24" (4) + version=2 (4) + pubKeyLen (4) + sigLen (4) + pubKey + sig + zip
//   CRX3: "Cr24" (4) + version=3 (4) + headerLen (4) + protobuf header + zip
function stripCrxHeader(buf) {
  if (buf.length < 16 || buf.slice(0, 4).toString() !== 'Cr24') {
    throw new Error('Not a CRX file (bad magic)');
  }
  const version = buf.readUInt32LE(4);
  if (version === 2) {
    const pubLen = buf.readUInt32LE(8);
    const sigLen = buf.readUInt32LE(12);
    const start  = 16 + pubLen + sigLen;
    return buf.slice(start);
  }
  if (version === 3) {
    const headerLen = buf.readUInt32LE(8);
    return buf.slice(12 + headerLen);
  }
  throw new Error(`Unsupported CRX version ${version}`);
}

async function installFromCrx(crxPath) {
  ensureDirs();
  const AdmZip = require('adm-zip');
  const buf = await fsp.readFile(crxPath);
  const zipBuf = stripCrxHeader(buf);

  // Extract to a temp folder first; if anything goes wrong (corrupt zip,
  // missing manifest), we don't leave half-extracted state in EXT_DIR.
  const tmpDir = path.join(EXT_DIR(), `.tmp-crx-${Date.now().toString(36)}`);
  fs.mkdirSync(tmpDir, { recursive: true });
  try {
    new AdmZip(zipBuf).extractAllTo(tmpDir, true);
    return await installFromDir(tmpDir);
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }
}

async function remove(id) {
  if (loadedById.has(id)) {
    try { _session.removeExtension(id); } catch {}
    loadedById.delete(id);
  }
  const folder = metadata[id]?.source;
  if (folder) {
    try { fs.rmSync(path.join(EXT_DIR(), folder), { recursive: true, force: true }); } catch {}
  }
  delete metadata[id];
  saveMeta();
  return { ok: true };
}

async function setEnabled(id, enabled) {
  const isLoaded = loadedById.has(id);
  if (enabled && !isLoaded) {
    const folder = metadata[id]?.source;
    if (!folder) throw new Error('No on-disk folder for this extension');
    const manifestPath = await findManifest(path.join(EXT_DIR(), folder));
    if (!manifestPath) throw new Error('manifest.json missing');
    const ext = await _session.loadExtension(path.dirname(manifestPath), { allowFileAccess: true });
    loadedById.set(ext.id, ext);
  } else if (!enabled && isLoaded) {
    try { _session.removeExtension(id); } catch {}
    loadedById.delete(id);
  }
  metadata[id] = { ...(metadata[id] || {}), enabled };
  saveMeta();
  return { ok: true, enabled };
}

// --- File-picker helpers used by the IPC layer -----------------------------

async function pickFolder(parentWindow) {
  const result = await dialog.showOpenDialog(parentWindow || null, {
    title: 'Choose unpacked extension folder',
    properties: ['openDirectory'],
  });
  if (result.canceled || !result.filePaths[0]) return null;
  return result.filePaths[0];
}

async function pickCrx(parentWindow) {
  const result = await dialog.showOpenDialog(parentWindow || null, {
    title: 'Choose a .crx file',
    properties: ['openFile'],
    filters: [{ name: 'Chrome Extension', extensions: ['crx', 'zip'] }],
  });
  if (result.canceled || !result.filePaths[0]) return null;
  return result.filePaths[0];
}

module.exports = {
  loadAll, list,
  installFromDir, installFromCrx,
  remove, setEnabled,
  pickFolder, pickCrx,
};
