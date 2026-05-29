// =========================================================================
// Home-page background storage. Holds ONE image or video at a time,
// uploaded via Settings → Appearance.
//
// We use IndexedDB instead of localStorage because:
//   - localStorage caps at ~5–10 MB per origin and can't store binary
//     blobs natively (we'd have to base64-encode, which inflates by 33%).
//   - Videos and high-res images easily exceed those limits.
//   - IndexedDB stores Blobs directly with no encoding overhead and has
//     a multi-GB quota in modern Chromium.
//
// The blob URL (`URL.createObjectURL`) is the cheapest way to render the
// stored blob — it's a synthetic in-memory URL that <img> and <video>
// understand natively. We re-create the URL on every load() because blob
// URLs don't survive page reloads.
// =========================================================================

import { emit, on as busOn } from './bus';

// In the Electron build the background lives in the main process (served via
// the sbbg:// protocol) so the upload — triggered from the overlay/settings
// view — reliably reaches the home page, and the file picker is a native OS
// dialog rather than a hidden <input> buried in a child WebContentsView. The
// IndexedDB path below is the fallback for the plain web build.
const nativeBg = () =>
  (typeof window !== 'undefined' && window.smartBrowserAPI && window.smartBrowserAPI.background) || null;

export function hasNativeBackground() { return !!nativeBg(); }

const DB_NAME       = 'sb-background';
const DB_VERSION    = 1;
const STORE         = 'blobs';
const KEY           = 'home';
export const BG_CHANGED_EVENT = 'sb:background-changed';

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

async function getRecord() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(KEY);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror   = () => reject(req.error);
  });
}

async function putRecord(record) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(record, KEY);
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}

async function deleteRecord() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(KEY);
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}

/**
 * Returns { kind: 'image'|'video', url, name, size } or null.
 * `url` is a fresh blob URL — the caller should revoke it (or just let
 * the GC clean up when the page unloads).
 */
export async function loadBackground() {
  const api = nativeBg();
  if (api) {
    try { return (await api.get()) || null; } catch { return null; }
  }
  try {
    const rec = await getRecord();
    if (!rec || !rec.blob) return null;
    return {
      kind: rec.kind,
      name: rec.name,
      size: rec.blob.size,
      url:  URL.createObjectURL(rec.blob),
    };
  } catch { return null; }
}

/**
 * Electron-only: open a native file dialog and store the chosen image/video
 * as the home-page background. Returns { kind, url, name, size } on success,
 * { canceled: true } if the user dismissed the dialog, or { error } on failure.
 */
export async function pickBackground(kind) {
  const api = nativeBg();
  if (!api) throw new Error('Native background picker unavailable.');
  const res = await api.pick(kind);
  if (res && !res.canceled && !res.error) emit(BG_CHANGED_EVENT);
  return res;
}

/**
 * Subscribe to background-changed notifications from ANY source — the native
 * main-process IPC event (cross-window) AND the in-page bus (same window /
 * opacity tweaks). Returns an unsubscribe function.
 */
export function onBackgroundChanged(cb) {
  const offBus = busOn(BG_CHANGED_EVENT, cb);
  const api = nativeBg();
  const offNative = api && api.onChanged ? api.onChanged(cb) : null;
  return () => { offBus(); if (offNative) offNative(); };
}

/**
 * Stores a File / Blob as the home-page background. Detects image vs.
 * video from the MIME type. Fires BG_CHANGED_EVENT so any mounted
 * HomePage refreshes immediately.
 */
export async function saveBackground(file) {
  if (!file) return null;
  const kind = file.type.startsWith('video/') ? 'video'
             : file.type.startsWith('image/') ? 'image'
             : null;
  if (!kind) throw new Error('Unsupported file type — pick an image or video.');
  await putRecord({ kind, blob: file, name: file.name || 'background' });
  emit(BG_CHANGED_EVENT);
  return kind;
}

export async function clearBackground() {
  const api = nativeBg();
  if (api) { try { await api.clear(); } catch {} emit(BG_CHANGED_EVENT); return; }
  await deleteRecord();
  emit(BG_CHANGED_EVENT);
}

// Lightweight opacity dial — small enough to stay in localStorage so the
// HomePage can read it synchronously on first render without an await.
const OPACITY_KEY = 'sb.background.opacity.v1';
export function loadBackgroundOpacity() {
  const n = Number(window.localStorage.getItem(OPACITY_KEY));
  if (!Number.isFinite(n)) return 0.45;
  return Math.max(0.05, Math.min(1, n));
}
export function setBackgroundOpacity(value) {
  const clamped = Math.max(0.05, Math.min(1, Number(value) || 0.45));
  try { window.localStorage.setItem(OPACITY_KEY, String(clamped)); } catch {}
  emit(BG_CHANGED_EVENT);
  return clamped;
}

// Animated 3D backdrop (globe + starfield). Users can dim it down or turn it
// off entirely so a custom image/video background reads clearly underneath.
const ANIM_ON_KEY  = 'sb.background.anim.enabled.v1';
const ANIM_OPA_KEY = 'sb.background.anim.opacity.v1';

export function loadAnimationEnabled() {
  const v = window.localStorage.getItem(ANIM_ON_KEY);
  return v === null ? true : v === '1';
}
export function setAnimationEnabled(on) {
  try { window.localStorage.setItem(ANIM_ON_KEY, on ? '1' : '0'); } catch {}
  emit(BG_CHANGED_EVENT);
  return !!on;
}
export function loadAnimationOpacity() {
  const n = Number(window.localStorage.getItem(ANIM_OPA_KEY));
  if (!Number.isFinite(n) || n <= 0) return 0.5;
  return Math.max(0.05, Math.min(1, n));
}
export function setAnimationOpacity(value) {
  const clamped = Math.max(0.05, Math.min(1, Number(value) || 0.5));
  try { window.localStorage.setItem(ANIM_OPA_KEY, String(clamped)); } catch {}
  emit(BG_CHANGED_EVENT);
  return clamped;
}
