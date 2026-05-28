// SmartBrowser - browsing history.
//
// Hooks into the main process to record every top-level navigation across all
// tabs. Entries are persisted (debounced) to userData/sb-store/history.json.
//
// Title resolution: navigations fire before page-title-updated, so we record
// the entry on navigate and patch the title later when it arrives.

const { Store } = require('./store');

const MAX_ENTRIES = 5000;
const SKIP_SCHEMES = ['about:', 'chrome:', 'devtools:', 'file:', 'data:', 'smartbrowser:'];

let store = null;     // lazy — Store needs `app` ready
let enabled = true;   // can be toggled via settings

function ensure() {
  if (!store) store = new Store('history', { defaultValue: [] });
  return store;
}

function shouldSkip(url) {
  if (!url || typeof url !== 'string') return true;
  return SKIP_SCHEMES.some((p) => url.startsWith(p));
}

// Record (or refresh) the entry for a navigation. If the most recent entry
// already matches the URL within the last 2s, we just patch its title instead
// of pushing a duplicate (in-page navs often fire navigate + title in quick
// succession).
function record(url, { tabId, title, favicon } = {}) {
  if (!enabled || shouldSkip(url)) return;
  const s = ensure();
  const items = Array.isArray(s.get()) ? s.get() : [];
  const now = Date.now();
  const last = items[items.length - 1];
  if (last && last.url === url && now - last.timestamp < 2000) {
    if (title) last.title = title;
    if (favicon) last.favicon = favicon;
    s.set(items);
    return;
  }
  items.push({ url, title: title || '', favicon: favicon || '', timestamp: now, tabId: tabId || null });
  if (items.length > MAX_ENTRIES) items.splice(0, items.length - MAX_ENTRIES);
  s.set(items);
}

function patchTitle(url, title) {
  if (!enabled || !title) return;
  const s = ensure();
  const items = s.get() || [];
  // Patch the most recent entry that matches this URL (handles SPA re-routes).
  for (let i = items.length - 1; i >= 0; i--) {
    if (items[i].url === url) {
      items[i].title = title;
      s.set(items);
      return;
    }
  }
}

function patchFavicon(url, favicon) {
  if (!enabled || !favicon) return;
  const s = ensure();
  const items = s.get() || [];
  for (let i = items.length - 1; i >= 0; i--) {
    if (items[i].url === url) {
      items[i].favicon = favicon;
      s.set(items);
      return;
    }
  }
}

// Return entries newest-first, optionally filtered by a case-insensitive query
// against URL + title. Hard limit on the response so the renderer doesn't have
// to ship 5000 entries every time.
function list({ query = '', limit = 500 } = {}) {
  const items = ensure().get() || [];
  const q = String(query || '').toLowerCase();
  const out = [];
  for (let i = items.length - 1; i >= 0 && out.length < limit; i--) {
    const it = items[i];
    if (!q || (it.url || '').toLowerCase().includes(q) || (it.title || '').toLowerCase().includes(q)) {
      out.push(it);
    }
  }
  return out;
}

function remove(timestamp) {
  const s = ensure();
  const items = s.get() || [];
  const idx = items.findIndex((it) => it.timestamp === timestamp);
  if (idx >= 0) {
    items.splice(idx, 1);
    s.set(items);
  }
}

function clear({ since } = {}) {
  const s = ensure();
  if (!since) { s.set([]); return; }
  const items = (s.get() || []).filter((it) => it.timestamp < since);
  s.set(items);
}

function setEnabled(v) { enabled = !!v; }
function isEnabled() { return enabled; }

module.exports = { record, patchTitle, patchFavicon, list, remove, clear, setEnabled, isEnabled };
