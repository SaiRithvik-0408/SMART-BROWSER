// SmartBrowser - downloads manager.
//
// Hooks into session.on('will-download') to track every download started by
// any tab. Items live in memory (with the DownloadItem reference for control
// actions like pause/resume/cancel) AND in a persisted manifest so they
// survive restarts (the file on disk is what matters; the manifest is just
// a record).

const { shell } = require('electron');
const { Store } = require('./store');

let store = null;
const liveItems = new Map();   // id -> { item: DownloadItem, snapshot }

function ensure() {
  if (!store) store = new Store('downloads', { defaultValue: [] });
  return store;
}

function snapshot(id, item) {
  return {
    id,
    filename:    item.getFilename(),
    url:         item.getURL(),
    mimeType:    item.getMimeType(),
    savePath:    item.getSavePath() || '',
    totalBytes:  item.getTotalBytes(),
    receivedBytes: item.getReceivedBytes(),
    state:       item.getState(),         // 'progressing' | 'completed' | 'cancelled' | 'interrupted'
    isPaused:    item.isPaused(),
    canResume:   item.canResume(),
    startTime:   item.getStartTime() * 1000,
    endTime:     null,
  };
}

function persist() {
  const items = ensure().get() || [];
  ensure().set(items);
}

function pushPersisted(snap) {
  const items = ensure().get() || [];
  items.unshift({ ...snap });
  if (items.length > 500) items.length = 500;
  ensure().set(items);
}

function patchPersisted(id, patch) {
  const items = ensure().get() || [];
  const idx = items.findIndex((it) => it.id === id);
  if (idx >= 0) {
    items[idx] = { ...items[idx], ...patch };
    ensure().set(items);
  }
}

function install(session, broadcast) {
  session.on('will-download', (_e, item) => {
    const id = `dl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const snap = snapshot(id, item);
    liveItems.set(id, { item, snapshot: snap });
    pushPersisted(snap);
    broadcast('downloads:added', snap);

    item.on('updated', (_evt, state) => {
      const next = snapshot(id, item);
      next.state = state;
      const live = liveItems.get(id);
      if (live) live.snapshot = next;
      patchPersisted(id, next);
      broadcast('downloads:updated', next);
    });
    item.once('done', (_evt, state) => {
      const next = snapshot(id, item);
      next.state = state;
      next.endTime = Date.now();
      patchPersisted(id, next);
      broadcast('downloads:updated', next);
      liveItems.delete(id);
    });
  });
}

function list() {
  // Merge persisted (history) with live (active) items, preferring live.
  const persisted = ensure().get() || [];
  const out = persisted.map((p) => {
    const live = liveItems.get(p.id);
    return live ? live.snapshot : p;
  });
  return out;
}

function pause(id)   { const l = liveItems.get(id); if (l && !l.item.isPaused()) l.item.pause(); }
function resume(id)  { const l = liveItems.get(id); if (l &&  l.item.canResume()) l.item.resume(); }
function cancel(id)  { const l = liveItems.get(id); if (l) l.item.cancel(); }
function openFile(id) {
  const items = ensure().get() || [];
  const it = items.find((x) => x.id === id);
  if (it && it.savePath) shell.openPath(it.savePath);
}
function showFile(id) {
  const items = ensure().get() || [];
  const it = items.find((x) => x.id === id);
  if (it && it.savePath) shell.showItemInFolder(it.savePath);
}
function removeRecord(id) {
  const items = ensure().get() || [];
  const next = items.filter((x) => x.id !== id);
  ensure().set(next);
}
function clearAll() {
  ensure().set([]);
}

module.exports = { install, list, pause, resume, cancel, openFile, showFile, removeRecord, clearAll };
