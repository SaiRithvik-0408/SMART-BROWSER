// SmartBrowser - notes store.
//
// Notes live in userData/sb-store/notes.json. Each note has free-text content
// and an optional array of inline images stored as data: URIs. The same store
// powers both the Notes panel (full editor) and the Notes widget on the new
// tab page (compact view) — they read and write the same notes.
//
// Image strategy: data: URIs in JSON. Simple and works offline, at the cost
// of bloating the JSON. We cap stored images at ~2 MB per note to keep load
// times reasonable; anything larger gets rejected with an error.

const { Store } = require('./store');

const MAX_IMAGE_BYTES_PER_NOTE = 2 * 1024 * 1024;

let store = null;
function ensure() {
  if (!store) store = new Store('notes', { defaultValue: [] });
  return store;
}

function list() {
  // Newest first. Return a shallow copy so the renderer can't accidentally
  // mutate our in-memory state.
  return [...(ensure().get() || [])].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

function get(id) {
  return (ensure().get() || []).find((n) => n.id === id) || null;
}

function create({ title = '', content = '', images = [] } = {}) {
  const now = Date.now();
  const id = `note-${now}-${Math.random().toString(36).slice(2, 8)}`;
  const note = {
    id,
    title: String(title || '').slice(0, 200),
    content: String(content || ''),
    images: Array.isArray(images) ? images.slice(0, 16) : [],
    createdAt: now,
    updatedAt: now,
  };
  const items = ensure().get() || [];
  items.push(note);
  ensure().set(items);
  return note;
}

function update(id, patch) {
  const items = ensure().get() || [];
  const idx = items.findIndex((n) => n.id === id);
  if (idx < 0) return { error: 'Note not found' };
  const cur = items[idx];
  const next = {
    ...cur,
    ...(patch.title    !== undefined ? { title:   String(patch.title).slice(0, 200) } : {}),
    ...(patch.content  !== undefined ? { content: String(patch.content) }              : {}),
    ...(patch.images   !== undefined ? { images:  Array.isArray(patch.images) ? patch.images : cur.images } : {}),
    updatedAt: Date.now(),
  };
  // Enforce the per-note image budget (sum of data: URI sizes).
  if (Array.isArray(next.images)) {
    const total = next.images.reduce((acc, img) => acc + (img.src ? Buffer.byteLength(img.src, 'utf-8') : 0), 0);
    if (total > MAX_IMAGE_BYTES_PER_NOTE) {
      return { error: `Note exceeds ${Math.round(MAX_IMAGE_BYTES_PER_NOTE / 1024 / 1024)} MB image limit` };
    }
  }
  items[idx] = next;
  ensure().set(items);
  return next;
}

function remove(id) {
  const items = ensure().get() || [];
  const next = items.filter((n) => n.id !== id);
  ensure().set(next);
  return { ok: true };
}

function clearAll() {
  ensure().set([]);
  return { ok: true };
}

module.exports = { list, get, create, update, remove, clearAll };
