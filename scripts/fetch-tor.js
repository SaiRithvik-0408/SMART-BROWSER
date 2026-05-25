#!/usr/bin/env node
// SmartBrowser: download + extract the Tor Expert Bundle into ./tor/
// Runs cross-platform; on Windows we grab the x86_64 .tar.gz and use bundled
// tar.exe (Win10+). On macOS/Linux we use the native tar.

const fs   = require('fs');
const path = require('path');
const os   = require('os');
const { execFileSync } = require('child_process');
const https = require('https');

const TBB_VERSION = process.env.TOR_BUNDLE_VERSION || '15.0.14';
const ROOT  = path.resolve(__dirname, '..');
const TOR   = path.join(ROOT, 'tor');
const ARCH  = path.join(TOR, 'tor-bundle.tar.gz');

function platformAsset() {
  const p = process.platform;
  const a = process.arch;
  if (p === 'win32'  && a === 'x64')   return `tor-expert-bundle-windows-x86_64-${TBB_VERSION}.tar.gz`;
  if (p === 'darwin' && a === 'x64')   return `tor-expert-bundle-macos-x86_64-${TBB_VERSION}.tar.gz`;
  if (p === 'darwin' && a === 'arm64') return `tor-expert-bundle-macos-aarch64-${TBB_VERSION}.tar.gz`;
  if (p === 'linux'  && a === 'x64')   return `tor-expert-bundle-linux-x86_64-${TBB_VERSION}.tar.gz`;
  if (p === 'linux'  && a === 'arm64') return `tor-expert-bundle-linux-aarch64-${TBB_VERSION}.tar.gz`;
  throw new Error(`No Tor Expert Bundle asset known for ${p}/${a}`);
}

function torExeName() {
  return process.platform === 'win32' ? 'tor.exe' : 'tor';
}

function fetch(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        file.close(); fs.unlinkSync(dest);
        return fetch(res.headers.location, dest).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        file.close(); fs.unlinkSync(dest);
        return reject(new Error(`HTTP ${res.statusCode} fetching ${url}`));
      }
      const total = parseInt(res.headers['content-length'] || '0', 10);
      let got = 0;
      res.on('data', (c) => {
        got += c.length;
        if (total) {
          const pct = ((got / total) * 100).toFixed(1);
          process.stdout.write(`\r  downloading: ${pct}% (${(got/1024/1024).toFixed(1)} / ${(total/1024/1024).toFixed(1)} MB)`);
        }
      });
      res.pipe(file);
      file.on('finish', () => { file.close(); process.stdout.write('\n'); resolve(); });
    }).on('error', (e) => { try { fs.unlinkSync(dest); } catch {} reject(e); });
  });
}

async function main() {
  const torExe = path.join(TOR, 'tor', torExeName());
  if (fs.existsSync(torExe)) {
    console.log(`[fetch-tor] already present at ${torExe} - skipping`);
    return;
  }

  fs.mkdirSync(TOR, { recursive: true });
  const asset = platformAsset();
  const url   = `https://archive.torproject.org/tor-package-archive/torbrowser/${TBB_VERSION}/${asset}`;
  console.log(`[fetch-tor] downloading Tor Expert Bundle ${TBB_VERSION} (${process.platform}/${process.arch})`);
  console.log(`            ${url}`);

  await fetch(url, ARCH);

  console.log('[fetch-tor] extracting...');
  execFileSync('tar', ['-xzf', ARCH], { cwd: TOR, stdio: 'inherit' });

  try { fs.unlinkSync(ARCH); } catch {}

  if (!fs.existsSync(torExe)) {
    throw new Error(`extraction finished but ${torExe} not found - archive layout may have changed`);
  }
  console.log(`[fetch-tor] ready: ${torExe}`);
}

main().catch((e) => { console.error('[fetch-tor] FAILED:', e.message); process.exit(1); });
