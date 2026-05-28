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
  if (process.platform === 'win32') {
    // Prefer the single-file NSIS installer; fall back to the portable zip.
    return assets.find((a) => /Setup-.*\.exe$/i.test(a.name))
        || assets.find((a) => /-win-x64\.zip$/i.test(a.name));
  }
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

// Windows: download the asset, then a detached .cmd helper waits for the app
// to exit, installs the update, and relaunches.
//   - Setup .exe  → run silently with /S (per-user install, overwrites in place)
//   - .zip (fallback) → extract + robocopy over the install dir
//
// The helper is launched via a tiny .vbs wrapper using WScript.Shell.Run with
// `intWindowStyle = 0` (vbHide). This is the ONLY reliable way to suppress the
// console window on Windows 11, where Windows Terminal hosts cmd in its own
// process and ignores Node's `windowsHide: true` flag.
//
// The wait-loop is capped at 30 seconds: Electron spawns multiple helper
// processes that all share the SmartBrowser.exe name, so a lingering renderer
// would otherwise hang the loop forever. After the cap we just install — NSIS
// silent install over a partially-running app is well-tolerated.
async function applyWindows(info, onProgress) {
  const tmp = path.join(os.tmpdir(), `sb-update-${Date.now()}`);
  fs.mkdirSync(tmp, { recursive: true });
  const assetPath = path.join(tmp, info.assetName);
  await download(info.assetUrl, assetPath, onProgress);

  const exePath = process.execPath;
  const cmdPath = path.join(tmp, 'sb-update.cmd');
  const vbsPath = path.join(tmp, 'sb-launch.vbs');
  const isInstaller = /\.exe$/i.test(info.assetName);

  let installStep;
  if (isInstaller) {
    installStep = `"${assetPath}" /S\r\n`;
  } else {
    const installDir = path.dirname(process.resourcesPath);
    const extractDir = path.join(tmp, 'extract');
    installStep =
`powershell -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -LiteralPath '${assetPath}' -DestinationPath '${extractDir}' -Force"\r\nset "SRC=${extractDir}\\SmartBrowser"\r\nif not exist "%SRC%" set "SRC=${extractDir}"\r\nrobocopy "%SRC%" "${installDir}" /E /IS /IT /R:2 /W:1 /NFL /NDL /NJH /NJS /NP >nul\r\n`;
  }

  const script =
`@echo off
setlocal
set /a tries=0
:waitloop
set /a tries+=1
if %tries% gtr 30 goto install
tasklist /fi "imagename eq SmartBrowser.exe" 2>nul | find /i "SmartBrowser.exe" >nul
if not errorlevel 1 (
  timeout /t 1 /nobreak >nul
  goto waitloop
)
:install
${installStep}start "" "${exePath}"
rmdir /s /q "${tmp}" >nul 2>&1
del "%~f0" >nul 2>&1
`;
  fs.writeFileSync(cmdPath, script, 'utf-8');

  // VBS wrapper: WScript.Shell.Run with vbHide(0) truly hides the console.
  // Chr(34) is a double quote (works regardless of paths with spaces).
  const vbs =
`Set sh = CreateObject("WScript.Shell")\r\nsh.Run Chr(34) & "${cmdPath}" & Chr(34), 0, False\r\n`;
  fs.writeFileSync(vbsPath, vbs, 'utf-8');

  const child = spawn('wscript.exe', [vbsPath], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  child.unref();

  // Give wscript a beat to spawn the hidden cmd, then quit hard. `app.quit()`
  // can be blocked by handlers; follow up with `app.exit(0)` as a safety net
  // so the helper's wait-loop can proceed.
  setTimeout(() => {
    try { app.quit(); } catch {}
    setTimeout(() => { try { app.exit(0); } catch {} }, 1500);
  }, 500);
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
