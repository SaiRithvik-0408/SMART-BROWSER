// =========================================================================
// Saved dashboard layouts ("themes").
//
// The home page widget dashboard is a single mutable state stored under
// `smartbrowser.widgets.v6` + `smartbrowser.widgets.gridCols.v1`. Users
// asked for the ability to keep up to 3 snapshots of that state so they
// can switch between e.g. a Work layout, a Personal layout, and a Gaming
// layout the same way mobile phones save home-screen themes.
//
// Storage shape (LAYOUTS_KEY):
//   [
//     { name: 'Work',     widgets: [...], gridCols: 20, savedAt: 1718... },
//     null,                                              // empty slot
//     { name: 'Personal', widgets: [...], gridCols: 30, savedAt: 1718... },
//   ]
//
// Empty slots are persisted as null so the slot index is stable across
// reloads — the user always sees "Slot 1 / Slot 2 / Slot 3" in the same
// positions in the Settings UI.
// =========================================================================

export const LAYOUTS_KEY    = 'smartbrowser.widgets.layouts.v1';
export const WIDGETS_KEY    = 'smartbrowser.widgets.v6';
export const GRID_COLS_KEY  = 'smartbrowser.widgets.gridCols.v1';
export const LAYOUT_CHANGED = 'sb:widgets:layout-changed';
export const MAX_LAYOUT_SLOTS = 3;

function readJson(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch { return fallback; }
}

function writeJson(key, value) {
  try { window.localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

/** Return the 3-slot layouts array, always exactly length MAX_LAYOUT_SLOTS. */
export function loadLayouts() {
  const raw = readJson(LAYOUTS_KEY, []);
  const out = Array.isArray(raw) ? raw.slice(0, MAX_LAYOUT_SLOTS) : [];
  while (out.length < MAX_LAYOUT_SLOTS) out.push(null);
  return out;
}

function saveLayouts(layouts) {
  writeJson(LAYOUTS_KEY, layouts.slice(0, MAX_LAYOUT_SLOTS));
}

/** Snapshot the current dashboard state into the given slot. */
export function saveCurrentToSlot(slotIdx, name) {
  if (slotIdx < 0 || slotIdx >= MAX_LAYOUT_SLOTS) return;
  const widgets  = readJson(WIDGETS_KEY, null);
  const gridCols = Number(window.localStorage.getItem(GRID_COLS_KEY)) || 20;
  if (!widgets) return;
  const layouts = loadLayouts();
  layouts[slotIdx] = {
    name: (name || `Layout ${slotIdx + 1}`).slice(0, 40),
    widgets,
    gridCols,
    savedAt: Date.now(),
  };
  saveLayouts(layouts);
}

/** Apply the saved layout in `slotIdx` to the live dashboard. */
export function applySlot(slotIdx) {
  const layout = loadLayouts()[slotIdx];
  if (!layout || !layout.widgets) return false;
  writeJson(WIDGETS_KEY, layout.widgets);
  try { window.localStorage.setItem(GRID_COLS_KEY, String(layout.gridCols || 20)); } catch {}
  // Notify any mounted Widgets component so it can re-read state without a
  // page reload. localStorage 'storage' events only fire across windows,
  // so we use a custom in-page event.
  try {
    window.dispatchEvent(new CustomEvent(LAYOUT_CHANGED, {
      detail: { widgets: layout.widgets, gridCols: layout.gridCols },
    }));
  } catch {}
  return true;
}

/** Wipe the slot (sets it to null but keeps the array length stable). */
export function clearSlot(slotIdx) {
  const layouts = loadLayouts();
  layouts[slotIdx] = null;
  saveLayouts(layouts);
}

/** Rename the slot (no-op if empty). */
export function renameSlot(slotIdx, name) {
  const layouts = loadLayouts();
  if (!layouts[slotIdx]) return;
  layouts[slotIdx] = { ...layouts[slotIdx], name: (name || '').slice(0, 40) };
  saveLayouts(layouts);
}

// =========================================================================
// Live grid-column count. Used to be a picker in the dashboard header, now
// surfaced from Settings — the storage key is shared so Widgets.jsx
// hydrates from it on mount and we fire LAYOUT_CHANGED to update an
// already-mounted dashboard in-place.
// =========================================================================
export const GRID_COL_MIN = 4;
export const GRID_COL_MAX = 50;
export const GRID_COL_DEFAULT = 20;
export const GRID_COL_PRESETS = [4, 8, 12, 16, 20, 24, 30, 40, 50];

export function getCurrentGridCols() {
  const n = Number(window.localStorage.getItem(GRID_COLS_KEY));
  if (Number.isFinite(n) && n >= GRID_COL_MIN && n <= GRID_COL_MAX) return n;
  return GRID_COL_DEFAULT;
}

export function setCurrentGridCols(n) {
  const clamped = Math.max(GRID_COL_MIN, Math.min(GRID_COL_MAX, Math.round(Number(n) || GRID_COL_DEFAULT)));
  try { window.localStorage.setItem(GRID_COLS_KEY, String(clamped)); } catch {}
  try {
    window.dispatchEvent(new CustomEvent(LAYOUT_CHANGED, {
      detail: { gridCols: clamped },
    }));
  } catch {}
  return clamped;
}
