// SmartBrowser - self-updater.
//
// Distribution is via GitHub Releases. The Windows build is a portable ZIP that
// extracts into a `SmartBrowser/` folder, so we can't use electron-updater's
// NSIS/Squirrel flow. Instead:
//   1. Poll the GitHub Releases API for the latest tag.
//   2. Compare against app.getVersion().
//   3. On "Update now": download the platform asset, then
//        - Windows: extract + a detached .cmd helper that waits for exit,
//          copies the new files over the install dir, and relaunches.
//        - macOS/Linux: download the .dmg/.AppImage and open it for the user
//          (silent in-place replacement needs code signing / extra infra).

const { app, shell } = require('electron');
const https = require('node:https');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { spawn } = require('node:child_process');

const REPO = 'SaiRithvik-0408/SMART-BROWSER';
const API_LATEST = `https://api.github.com/repos/${REPO}/releases/latest`;

let cached = null;   // last successful check result

function getJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: { 'User-Agent': 'SmartBrowser-Updater', 'Accept': 'application/vnd.github+json' },
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return getJson(res.headers.location).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`GitHub API ${res.statusCode}`));
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf-8'))); }
        catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

// Download a URL to a file, following redirects, reporting progress (0..1).
function download(url, destPath, onProgress) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    const req = https.get(url, {
      headers: { 'User-Agent': 'SmartBrowser-Updater' },
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        file.close();
        return download(res.headers.location, destPath, onProgress).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        file.close();
        return reject(new Error(`Download HTTP ${res.statusCode}`));
      }
      const total = parseInt(res.headers['content-length'] || '0', 10);
      let received = 0;
      res.on('data', (c) => {
        received += c.length;
        if (total && onProgress) onProgress(received / total);
      });
      res.pipe(file);
      file.on('finish', () => file.close(() => resolve(destPath)));
    });
    req.on('error', (e) => { try { file.close(); fs.unlinkSync(destPath); } catch {} reject(e); });
  });
}

function isNewer(remote, local) {
  const r = String(remote).replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0);
  const l = String(local).replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(r.length, l.length); i++) {
    const a = r[i] || 0, b = l[i] || 0;
    if (a > b) return true;
    if (a < b) return false;
  }
  return false;
}

// Pick the release asset matching the current platform.
function pickAsset(assets) {
  if (!Array.isArray(assets)) return null;
  if (process.platform === 'win32')  return assets.find((a) => /-win-x64\.zip$/i.test(a.name));
  if (process.platform === 'darwin') return assets.find((a) => /\.dmg$/i.test(a.name));
  return assets.find((a) => /\.AppImage$/i.test(a.name));
}

async function check() {
  const rel = await getJson(API_LATEST);
  const latest = rel.tag_name || rel.name || '';
  const current = app.getVersion();
  const asset = pickAsset(rel.assets);
  cached = {
    available: isNewer(latest, current) && !!asset,
    current,
    latest: String(latest).replace(/^v/, ''),
    notes: rel.body || '',
    url: rel.html_url,
    assetName: asset ? asset.name : null,
    assetUrl: asset ? asset.browser_download_url : null,
  };
  return cached;
}

// Windows: download zip, drop a helper .cmd that swaps files after we exit.
async function applyWindows(info, onProgress) {
  const tmp = path.join(os.tmpdir(), `sb-update-${Date.now()}`);
  fs.mkdirSync(tmp, { recursive: true });
  const zipPath = path.join(tmp, info.assetName);
  await download(info.assetUrl, zipPath, onProgress);

  // Install dir is the parent of resources/ (where SmartBrowser.exe lives).
  const installDir = path.dirname(process.resourcesPath);
  const exePath = process.execPath;
  const extractDir = path.join(tmp, 'extract');
  const cmdPath = path.join(tmp, 'sb-update.cmd');

  // The ZIP extracts to a top-level `SmartBrowser\` folder (packaging guarantees
  // this), so the new files live under <extract>\SmartBrowser.
  const script =
`@echo off
setlocal
echo Waiting for SmartBrowser to close...
:waitloop
tasklist /fi "imagename eq SmartBrowser.exe" 2>nul | find /i "SmartBrowser.exe" >nul
if not errorlevel 1 (
  timeout /t 1 /nobreak >nul
  goto waitloop
)
echo Extracting update...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -LiteralPath '${zipPath}' -DestinationPath '${extractDir}' -Force"
set "SRC=${extractDir}\\SmartBrowser"
if not exist "%SRC%" set "SRC=${extractDir}"
echo Installing update...
robocopy "%SRC%" "${installDir}" /E /IS /IT /R:2 /W:1 /NFL /NDL /NJH /NJS /NP >nul
echo Relaunching...
start "" "${exePath}"
rmdir /s /q "${tmp}" >nul 2>&1
del "%~f0" >nul 2>&1
`;
  fs.writeFileSync(cmdPath, script, 'utf-8');

  const child = spawn('cmd.exe', ['/c', cmdPath], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  child.unref();

  setTimeout(() => app.quit(), 400);
  return { applying: true };
}

// macOS / Linux: download the installer image and open it.
async function applyOther(info, onProgress) {
  const dest = path.join(app.getPath('downloads'), info.assetName);
  await download(info.assetUrl, dest, onProgress);
  shell.showItemInFolder(dest);
  shell.openPath(dest);
  return { applying: false, downloadedTo: dest };
}

async function apply(onProgress) {
  const info = cached && cached.available ? cached : await check();
  if (!info.available || !info.assetUrl) {
    throw new Error('No update available to apply.');
  }
  if (!app.isPackaged) {
    // In dev there's nothing to replace; just open the release page.
    shell.openExternal(info.url);
    return { applying: false, dev: true };
  }
  return process.platform === 'win32'
    ? applyWindows(info, onProgress)
    : applyOther(info, onProgress);
}

module.exports = { check, apply, getCached: () => cached };
