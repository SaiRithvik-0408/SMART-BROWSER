// Lightweight JSON-on-disk store. One file per logical store under the user's
// app-data directory. No external dependencies — `electron-store` would add an
// AJV dep that's overkill for our shapes.
//
// API:
//   const s = new Store('history');
//   s.get()        -> whole JSON value (default [])
//   s.set(value)   -> replace, debounced write
//   s.flush()      -> force flush pending writes (used on app quit)
//
// Writes are debounced and atomic (write-tmp + rename) to avoid corrupting the
// JSON if the process is killed mid-write.

const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_DEBOUNCE_MS = 250;
const instances = new Set();

class Store {
  constructor(name, { defaultValue = null, debounceMs = DEFAULT_DEBOUNCE_MS } = {}) {
    this.name = name;
    this.debounceMs = debounceMs;
    this.dir = path.join(app.getPath('userData'), 'sb-store');
    this.file = path.join(this.dir, `${name}.json`);
    this.tmp  = path.join(this.dir, `${name}.json.tmp`);
    this._pendingTimer = null;
    try { fs.mkdirSync(this.dir, { recursive: true }); } catch {}
    try {
      const raw = fs.readFileSync(this.file, 'utf-8');
      this.value = JSON.parse(raw);
    } catch {
      this.value = defaultValue;
    }
    instances.add(this);
  }

  get() { return this.value; }

  set(next) {
    this.value = next;
    if (this._pendingTimer) clearTimeout(this._pendingTimer);
    this._pendingTimer = setTimeout(() => this.flush(), this.debounceMs);
  }

  // Force-write the current value to disk synchronously. Safe to call from
  // before-quit handlers.
  flush() {
    if (this._pendingTimer) { clearTimeout(this._pendingTimer); this._pendingTimer = null; }
    try {
      fs.writeFileSync(this.tmp, JSON.stringify(this.value, null, 2), 'utf-8');
      fs.renameSync(this.tmp, this.file);
    } catch (e) {
      console.warn(`[store:${this.name}] flush failed:`, e.message);
    }
  }
}

function flushAll() {
  for (const s of instances) s.flush();
}

module.exports = { Store, flushAll };
