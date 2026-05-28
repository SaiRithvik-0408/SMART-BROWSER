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
  try {
    window.dispatchEvent(new CustomEvent(BG_CHANGED_EVENT));
  } catch {}
  return kind;
}

export async function clearBackground() {
  await deleteRecord();
  try { window.dispatchEvent(new CustomEvent(BG_CHANGED_EVENT)); } catch {}
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
  try { window.dispatchEvent(new CustomEvent(BG_CHANGED_EVENT)); } catch {}
  return clamped;
}
