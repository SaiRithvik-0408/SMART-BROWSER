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

// Windows: download the asset, then a detached .vbs helper waits for the app
// to exit, installs the update, and relaunches.
//
// IMPORTANT: previous versions used a hidden .cmd helper, but Windows 11's
// default terminal is Windows Terminal, which hosts cmd in its own process
// and IGNORES `WindowStyle = 0` / `windowsHide: true`. Even with a VBS
// wrapper hiding the initial launch, every `tasklist | find` iteration
// inside the cmd loop re-flashed through Windows Terminal, and closing that
// window aborted the install entirely (so the user clicked "Update", saw a
// terminal, closed it, and nothing happened).
//
// The current design does ALL the work inside the .vbs itself:
//   - Process check uses WMI (Win32_Process) — no subprocess spawned, no
//     cmd, no Windows Terminal involvement.
//   - The installer is run via WScript.Shell.Run with intWindowStyle=0,
//     bWaitOnReturn=True. NSIS /S already runs without UI, so this is silent.
//   - SmartBrowser is relaunched, then the .vbs deletes itself + tempdir.
//
// wscript.exe has no console window at all, so the helper is invisible end
// to end. The wait-loop is capped at 30 seconds in case lingering Electron
// helper processes share the SmartBrowser.exe name — NSIS silent install
// over a partially-running app is well-tolerated.
async function applyWindows(info, onProgress) {
  const stamp = Date.now();
  const tmp = path.join(os.tmpdir(), `sb-update-${stamp}`);
  fs.mkdirSync(tmp, { recursive: true });
  const assetPath = path.join(tmp, info.assetName);
  await download(info.assetUrl, assetPath, onProgress);

  const exePath = process.execPath;
  // Helper lives OUTSIDE the tmp dir so it can delete that dir while running.
  const vbsPath = path.join(os.tmpdir(), `sb-update-${stamp}.vbs`);
  const isInstaller = /\.exe$/i.test(info.assetName);

  // VBS string literal escape: " -> "" (and we don't expect paths with quotes,
  // but be safe). Backslashes are literal in VBS strings — no escaping needed.
  const vbsLit = (s) => String(s).replace(/"/g, '""');

  let installStep;
  if (isInstaller) {
    // Silent NSIS install. bWaitOnReturn=True so we don't relaunch mid-copy.
    // sh.Run's first arg is a command line, so we wrap the EXE path in quotes
    // via Chr(34).
    installStep =
`sh.Run Chr(34) & "${vbsLit(assetPath)}" & Chr(34) & " /S", 0, True\r\n`;
  } else {
    // ZIP fallback: extract via Shell.Application, then xcopy in a hidden
    // shell. Rarely hit since pickAsset() prefers the installer.
    const installDir = path.dirname(process.resourcesPath);
    const extractDir = path.join(tmp, 'extract');
    installStep =
`On Error Resume Next\r\nfso.CreateFolder "${vbsLit(extractDir)}"\r\nshellApp.Namespace("${vbsLit(extractDir)}").CopyHere shellApp.Namespace("${vbsLit(assetPath)}").Items, 16\r\nsh.Run "cmd /c xcopy /E /Y /I " & Chr(34) & "${vbsLit(extractDir)}\\SmartBrowser" & Chr(34) & " " & Chr(34) & "${vbsLit(installDir)}" & Chr(34), 0, True\r\nOn Error Goto 0\r\n`;
  }

  const vbs =
`Option Explicit
Dim sh, fso, wmi, shellApp, items, i, procName
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
Set wmi = GetObject("winmgmts:\\\\.\\root\\cimv2")
Set shellApp = CreateObject("Shell.Application")
procName = "SmartBrowser.exe"

' Wait up to 30s for SmartBrowser.exe to fully exit. WMI runs in-process,
' so this loop never spawns a visible subprocess.
For i = 1 To 30
  Set items = wmi.ExecQuery("Select ProcessId from Win32_Process Where Name = '" & procName & "'")
  If items.Count = 0 Then Exit For
  WScript.Sleep 1000
Next

' Safety net: force-terminate any lingering helper processes so the installer
' isn't blocked by file locks. Also WMI, so still no subprocess.
Dim proc
Set items = wmi.ExecQuery("Select * from Win32_Process Where Name = '" & procName & "'")
For Each proc In items
  On Error Resume Next
  proc.Terminate
  On Error Goto 0
Next
WScript.Sleep 500

${installStep}

' Relaunch SmartBrowser (window style 1 = normal/restored).
sh.Run Chr(34) & "${vbsLit(exePath)}" & Chr(34), 1, False

' Clean up temp folder + this script.
On Error Resume Next
WScript.Sleep 500
fso.DeleteFolder "${vbsLit(tmp)}", True
fso.DeleteFile WScript.ScriptFullName, True
`;
  fs.writeFileSync(vbsPath, vbs, 'utf-8');

  // wscript.exe has no console UI, period. Detached so it survives our exit.
  const child = spawn('wscript.exe', ['//B', '//Nologo', vbsPath], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  child.unref();

  // Give wscript a beat to start, then quit hard. `app.quit()` can be blocked
  // by handlers; follow up with `app.exit(0)` so the wait-loop can proceed.
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
