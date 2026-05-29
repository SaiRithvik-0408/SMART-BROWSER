import React, { useEffect, useState } from 'react';
import {
  Box, Typography, IconButton, Menu, MenuItem, Button, Divider,
  InputBase, Select, TextField, Tooltip, Popover,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import AspectRatioIcon from '@mui/icons-material/AspectRatio';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import StickyNote2Icon from '@mui/icons-material/StickyNote2';
import LinkIcon from '@mui/icons-material/Link';
import PublicIcon from '@mui/icons-material/Public';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import SendIcon from '@mui/icons-material/Send';
import NewspaperIcon from '@mui/icons-material/Newspaper';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import SearchIcon from '@mui/icons-material/Search';
import BoltIcon from '@mui/icons-material/Bolt';
import AppsIcon from '@mui/icons-material/Apps';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import { motion } from 'framer-motion';
import { proxyUrlFor } from '../api/client';
import GridLayout from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import NewsFeed from './NewsFeed';
import { LAYOUT_CHANGED } from '../lib/layouts';
import { on as busOn } from '../lib/bus';

const sbAPI = typeof window !== 'undefined' ? window.smartBrowserAPI : null;

// v6 widens the default grid from 12 → 20 columns (user-configurable via a
// dashboard control), drops the minimum widget size to 1×1, and adds the
// brand + header widget types. Existing widgets sized in 12-col units get
// scaled out to 20 cols (and 8/16/24 etc.) when the user picks a different
// column count.
const STORAGE_KEY        = 'smartbrowser.widgets.v6';
const LEGACY_KEY_V5      = 'smartbrowser.widgets.v5';
const LEGACY_KEY_V4      = 'smartbrowser.widgets.v4';
const LEGACY_KEY_V3      = 'smartbrowser.widgets.v3';
const LEGACY_KEY_V2      = 'smartbrowser.widgets.v2';
const LAYOUT_STORAGE_KEY = 'smartbrowser.widgets.layout.v1';
const GRID_COLS_KEY      = 'smartbrowser.widgets.gridCols.v1';

// v5 widgets were laid out in a 12-column grid. v6 default is 20 columns
// so we scale every widget's `x` / `w` when migrating.
const V5_REFERENCE_COLS  = 12;
const DEFAULT_GRID_COLS  = 20;
// Hard cap on the number of columns the user can pick. Past ~50 the cells
// become single-pixel wide on most screens and react-grid-layout starts
// dropping frames during drags.
const GRID_COL_MAX       = 50;
const GRID_COL_MIN       = 4;
// Preset column counts exposed in the dashboard header dropdown — the
// user can also pick "Custom…" to type any number between 4 and 50.
const GRID_COL_OPTIONS   = [8, 12, 16, 20, 24, 30, 40, 50];

// Nothing-UI-inspired tokens: monospace, uppercase, flat black surfaces,
// a single red accent, dotted grid texture.
const MONO = "'JetBrains Mono', 'SFMono-Regular', ui-monospace, Menlo, monospace";
const ACCENT = '#d6453d';            // Nothing red
const SURFACE = 'rgba(8,9,14,0.72)';
const LINE = 'rgba(255,255,255,0.10)';

// Per-type defaults used both for the catalog entries (icon shown in the Add
// menu) AND for the default size/min-size when a NEW widget of that type is
// dropped in. Sizes are in grid cells (12-col grid, ~80px row height by
// default, so a 4x3 widget is roughly 320 × 240 px).
// Heights doubled vs the original 80px rowHeight era because we halved the
// row height to 40 px for smoother user resizing. A widget with h=4 here is
// the same on-screen as h=2 was in v3.
// minSize is uniformly 1×1 — the user explicitly asked that every widget be
// able to shrink to a single grid cell. Some widgets (news / AI chat) won't
// be usable at that size but the option is there, intentionally.
//
// `addable` controls whether the type shows up in the "Add widget" menu.
// `singleton` means at most one instance can exist (the brand widget).
// `removable: false` hides the × button so the user can't delete it.
const CATALOG = [
  { type: 'brand',      label: 'SmartBrowser', icon: <AutoAwesomeIcon fontSize="small" />,   defaultSize: { w: 8,  h: 4  }, minSize: { w: 1, h: 1 }, addable: false, singleton: true, removable: false, persistentId: 'w-brand' },
  { type: 'header',     label: 'Section title',icon: <NewspaperIcon fontSize="small" />,     defaultSize: { w: 12, h: 2  }, minSize: { w: 1, h: 1 } },
  { type: 'search',     label: 'Search',       icon: <SearchIcon fontSize="small" />,        defaultSize: { w: 20, h: 3  }, minSize: { w: 1, h: 1 } },
  { type: 'aishortcuts',label: 'AI Shortcuts', icon: <SmartToyIcon fontSize="small" />,      defaultSize: { w: 20, h: 3  }, minSize: { w: 1, h: 1 } },
  { type: 'apps',       label: 'Apps',         icon: <AppsIcon fontSize="small" />,          defaultSize: { w: 2,  h: 2  }, minSize: { w: 1, h: 1 } },
  { type: 'clock',      label: 'Clock',        icon: <AccessTimeIcon fontSize="small" />,    defaultSize: { w: 6,  h: 4  }, minSize: { w: 1, h: 1 } },
  { type: 'calendar',   label: 'Calendar',     icon: <CalendarMonthIcon fontSize="small" />, defaultSize: { w: 7,  h: 8  }, minSize: { w: 1, h: 1 } },
  { type: 'notes',      label: 'Notes',        icon: <StickyNote2Icon fontSize="small" />,   defaultSize: { w: 7,  h: 6  }, minSize: { w: 1, h: 1 } },
  { type: 'links',      label: 'Quick Links',  icon: <LinkIcon fontSize="small" />,          defaultSize: { w: 7,  h: 8  }, minSize: { w: 1, h: 1 } },
  { type: 'worldclock', label: 'World Clock',  icon: <PublicIcon fontSize="small" />,        defaultSize: { w: 7,  h: 8  }, minSize: { w: 1, h: 1 } },
  { type: 'stocks',     label: 'Stocks',       icon: <TrendingUpIcon fontSize="small" />,    defaultSize: { w: 10, h: 8  }, minSize: { w: 1, h: 1 } },
  { type: 'ai',         label: 'Ask AI',       icon: <AutoAwesomeIcon fontSize="small" />,   defaultSize: { w: 10, h: 8  }, minSize: { w: 1, h: 1 } },
  { type: 'news',       label: 'News',         icon: <NewspaperIcon fontSize="small" />,     defaultSize: { w: 20, h: 12 }, minSize: { w: 1, h: 1 } },
];
const catalogFor = (type) => CATALOG.find((c) => c.type === type) || CATALOG[0];

// Default starting dashboard, expressed in the 20-column grid. Each entry
// has an `id`, `type`, `config`, and a `layout` rect { x, y, w, h }. The
// brand widget is auto-injected (and locked) so it lives at the top of
// the canvas as the home page's identity.
const DEFAULTS = [
  { id: 'w-brand',      type: 'brand',      config: {},                     layout: { x: 0,  y: 0,  w: 8,  h: 4  } },
  { id: 'w-apps',       type: 'apps',       config: { suite: 'google' },    layout: { x: 8,  y: 0,  w: 2,  h: 2  } },
  { id: 'w-clock',      type: 'clock',      config: {},                     layout: { x: 14, y: 0,  w: 6,  h: 4  } },
  { id: 'w-hdr-board',  type: 'header',     config: { text: 'DASHBOARD' },  layout: { x: 0,  y: 4,  w: 20, h: 2  } },
  { id: 'w-search',     type: 'search',     config: {},                     layout: { x: 0,  y: 6,  w: 20, h: 3  } },
  { id: 'w-ai-shorts',  type: 'aishortcuts',config: {},                     layout: { x: 0,  y: 9,  w: 20, h: 3  } },
  { id: 'w-hdr-tools',  type: 'header',     config: { text: 'OFFICE & STOCKS' }, layout: { x: 0, y: 12, w: 20, h: 2 } },
  { id: 'w-ai',         type: 'ai',         config: { service: 'chatgpt' }, layout: { x: 0,  y: 14, w: 10, h: 8  } },
  { id: 'w-stocks',     type: 'stocks',     config: {},                     layout: { x: 10, y: 14, w: 10, h: 8  } },
  { id: 'w-calendar',   type: 'calendar',   config: {},                     layout: { x: 0,  y: 22, w: 7,  h: 8  } },
  { id: 'w-notes',      type: 'notes',      config: {},                     layout: { x: 7,  y: 22, w: 6,  h: 8  } },
  { id: 'w-hdr-news',   type: 'header',     config: { text: 'NEWS' },       layout: { x: 0,  y: 30, w: 20, h: 2  } },
  { id: 'w-news',       type: 'news',       config: { section: 'top' },     layout: { x: 0,  y: 32, w: 20, h: 12 } },
];

// Convert the user's saved widgets to the shape react-grid-layout wants.
function toLayoutArray(widgets) {
  return widgets.map((w) => {
    const meta = catalogFor(w.type);
    const l = w.layout || { x: 0, y: Infinity, ...meta.defaultSize };
    // The smallest a widget can be dragged to vertically is HALF its current
    // height (rounded down, floored at 1 cell). Because this recomputes from
    // the live height on every render, you can keep halving a widget all the
    // way down to a single cell — one drag at a time — which is exactly the
    // behaviour the user asked for ("min height should be half the current").
    const minH = Math.max(1, Math.floor((l.h || meta.defaultSize.h) / 2));
    return {
      i: w.id,
      x: l.x, y: l.y, w: l.w, h: l.h,
      minW: meta.minSize.w, minH,
    };
  });
}

// Rescale every widget's x / w so its proportions are preserved when the
// grid column count changes (v5→v6 migration AND the user-facing column
// picker). Heights and y-positions are independent of column count so we
// leave them alone.
function rescaleCols(widgets, fromCols, toCols) {
  if (!Array.isArray(widgets) || !fromCols || !toCols || fromCols === toCols) return widgets;
  const ratio = toCols / fromCols;
  return widgets.map((w) => {
    if (!w.layout) return w;
    const x = Math.max(0, Math.min(toCols - 1, Math.round((w.layout.x || 0) * ratio)));
    let wCells = Math.max(1, Math.round((w.layout.w || 1) * ratio));
    if (x + wCells > toCols) wCells = toCols - x;
    if (wCells < 1) wCells = 1;
    return { ...w, layout: { ...w.layout, x, w: wCells } };
  });
}

// Make sure the layout contains every required ("essential") widget — the
// brand wordmark singleton, plus the search / AI shortcuts / apps strip
// the v5 release introduced. Idempotent: if a type already exists we
// leave the user's instance alone. The brand is forced as the very first
// row so it always reads as the page header.
function addHomeEssentials(widgets) {
  const out = Array.isArray(widgets) ? [...widgets] : [];
  const has = (t) => out.some((w) => w.type === t);
  const missing = [];
  if (!has('brand'))       missing.push({ id: 'w-brand',     type: 'brand',       config: {},                  layout: { w: 8,  h: 4  } });
  if (!has('search'))      missing.push({ id: 'w-search',    type: 'search',      config: {},                  layout: { w: 20, h: 3  } });
  if (!has('aishortcuts')) missing.push({ id: 'w-ai-shorts', type: 'aishortcuts', config: {},                  layout: { w: 20, h: 3  } });
  if (!has('apps'))        missing.push({ id: 'w-apps',      type: 'apps',        config: { suite: 'google' }, layout: { w: 2,  h: 2  } });
  if (missing.length === 0) return out;
  // Total y-rows the new strip occupies (brand: 4, search: 3, ai: 3, apps: 0
  // because it tucks alongside brand).
  const shift = (missing.find((m) => m.type === 'brand') ? 4 : 0)
              + (missing.find((m) => m.type === 'search') ? 3 : 0)
              + (missing.find((m) => m.type === 'aishortcuts') ? 3 : 0);
  const shifted = out.map((w) => ({
    ...w,
    layout: w.layout ? { ...w.layout, y: (w.layout.y || 0) + shift } : w.layout,
  }));
  let y = 0;
  const prepended = [];
  for (const m of missing) {
    if (m.type === 'apps') {
      // Slot the tiny apps icon next to brand (top-right corner of the
      // header row) so it doesn't take its own row.
      prepended.push({ ...m, layout: { x: 8, y: 0, ...m.layout } });
    } else if (m.type === 'brand') {
      prepended.push({ ...m, layout: { x: 0, y: 0, ...m.layout } });
      y = Math.max(y, m.layout.h);
    } else {
      prepended.push({ ...m, layout: { x: 0, y, ...m.layout } });
      y += m.layout.h;
    }
  }
  return [...prepended, ...shifted];
}

// Brand is a singleton + non-removable. If somehow the user's stored layout
// has multiple brands or none, normalise it: keep the first instance (or
// inject a default one) and drop duplicates.
function enforceSingletons(widgets) {
  const out = [];
  const seenSingleton = new Set();
  for (const w of widgets) {
    const meta = catalogFor(w.type);
    if (meta?.singleton) {
      if (seenSingleton.has(w.type)) continue;
      seenSingleton.add(w.type);
    }
    out.push(w);
  }
  return out;
}

function loadWidgets() {
  // 1. v6 — current canonical format.
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length) {
        return enforceSingletons(addHomeEssentials(parsed));
      }
    }
  } catch {}
  // 2. Migrate from v5 (12-col grid): scale x/w out to the default 20 cols
  //    and add the new brand essential.
  try {
    const raw = localStorage.getItem(LEGACY_KEY_V5);
    if (raw) {
      const v5 = JSON.parse(raw) || [];
      const scaled = rescaleCols(v5, V5_REFERENCE_COLS, DEFAULT_GRID_COLS);
      const migrated = enforceSingletons(addHomeEssentials(scaled));
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated)); } catch {}
      return migrated;
    }
  } catch {}
  // 3. Migrate from v4: same 12-col grid as v5, layer search/AI/apps/brand
  //    essentials on top.
  try {
    const raw = localStorage.getItem(LEGACY_KEY_V4);
    if (raw) {
      const v4 = JSON.parse(raw) || [];
      const scaled = rescaleCols(v4, V5_REFERENCE_COLS, DEFAULT_GRID_COLS);
      const migrated = enforceSingletons(addHomeEssentials(scaled));
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated)); } catch {}
      return migrated;
    }
  } catch {}
  // 4. Migrate from v3 (same shape, but rowHeight was 80 px — double all `h`
  //    and `y` values so the layout looks identical with the new 40 px row),
  //    then scale to 20 cols and layer essentials.
  try {
    const raw = localStorage.getItem(LEGACY_KEY_V3);
    if (raw) {
      const v3 = JSON.parse(raw) || [];
      const v4ish = v3.map((w) => ({
        ...w,
        layout: w.layout ? {
          x: w.layout.x,
          y: (w.layout.y || 0) * 2,
          w: w.layout.w,
          h: (w.layout.h || 1) * 2,
        } : undefined,
      }));
      const scaled = rescaleCols(v4ish, V5_REFERENCE_COLS, DEFAULT_GRID_COLS);
      const migrated = enforceSingletons(addHomeEssentials(scaled));
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated)); } catch {}
      return migrated;
    }
  } catch {}
  // 3. Migrate from legacy v2 (had `size: 's' | 'm' | 'l' | 'xl'` instead of layout)
  try {
    const raw = localStorage.getItem(LEGACY_KEY_V2);
    if (raw) {
      // h values doubled to match the 40 px rowHeight used since v4.
      const SIZE_TO_LAYOUT = {
        s:  { w: 3,  h: 4 },
        m:  { w: 4,  h: 4 },
        l:  { w: 6,  h: 8 },
        xl: { w: 8,  h: 8 },
      };
      const v2 = JSON.parse(raw) || [];
      let y = 0;
      const migrated = v2.map((w) => {
        const dims = SIZE_TO_LAYOUT[w.size || 'm'] || SIZE_TO_LAYOUT.m;
        const out = { id: w.id, type: w.type, config: w.config || {},
                      layout: { x: 0, y, w: dims.w, h: dims.h } };
        y += dims.h;
        return out;
      });
      // Auto-add a news widget at the bottom so the user sees it.
      if (!migrated.find((w) => w.type === 'news')) {
        migrated.push({ id: 'w-news', type: 'news', config: { section: 'top' },
                        layout: { x: 0, y, w: 12, h: 6 } });
      }
      const scaled = rescaleCols(migrated, V5_REFERENCE_COLS, DEFAULT_GRID_COLS);
      return enforceSingletons(addHomeEssentials(scaled));
    }
  } catch {}
  return DEFAULTS;
}

function loadGridCols() {
  try {
    const raw = localStorage.getItem(GRID_COLS_KEY);
    const n = Number(raw);
    if (Number.isFinite(n) && n >= GRID_COL_MIN && n <= GRID_COL_MAX) return Math.round(n);
  } catch {}
  return DEFAULT_GRID_COLS;
}

// Free-placement vs compact (auto-pack to top) toggle. The user explicitly
// asked to be able to leave intentional gaps between widgets, so we now
// default to FREE placement — widgets stay exactly where they were
// dropped, even if there's empty space above them. The previous behavior
// (auto-compact upward) is still available via the "compact" mode toggle
// for users who want a tight pack.
const LAYOUT_MODE_KEY = 'smartbrowser.widgets.layoutMode.v1';
function loadLayoutMode() {
  try {
    const raw = localStorage.getItem(LAYOUT_MODE_KEY);
    if (raw === 'free' || raw === 'compact') return raw;
  } catch {}
  return 'free';
}

// Grid config — keep in sync with the CSS overrides below.
//
// Row height used to be a constant 40 px regardless of how many columns the
// user picked, which meant the grid "felt" the same at 8 cols vs 30 cols —
// not what the user expects. The new behavior derives the row height from
// the cell width: every grid cell is rendered at a fixed 1:2 height-to-width
// aspect ratio, so cells stay roughly half as tall as they are wide. We
// clamp inside [16 px, 80 px] so dense grids don't end up with single-pixel
// rows and sparse grids don't end up with absurdly tall ones.
const GRID_MARGIN          = 8;        // px between widgets (and around outer edges)
const ROW_HEIGHT_MIN       = 12;
// The 80-px cap used to break the 2:1 width:height ratio at low column
// counts (e.g. at 4 cols on a 1000-px screen, cellWidth=240 but rh was
// pinned to 80 → 3:1). Raised to 240 so the ratio holds at every grid
// size — a 1×1 widget is always exactly twice as wide as it is tall.
const ROW_HEIGHT_MAX       = 240;
const ROW_HEIGHT_RATIO     = 0.5;      // rowHeight = cellWidth × ratio
function computeRowHeight(containerWidth, gridCols) {
  if (!containerWidth || !gridCols) return 40;
  // react-grid-layout cell-width math: (W - margin * (cols + 1)) / cols
  const cellWidth = (containerWidth - GRID_MARGIN * (gridCols + 1)) / gridCols;
  const rh = Math.round(cellWidth * ROW_HEIGHT_RATIO);
  return Math.max(ROW_HEIGHT_MIN, Math.min(ROW_HEIGHT_MAX, rh));
}

export default function Widgets({ onOpen }) {
  const [widgets, setWidgets] = useState(loadWidgets);
  const [gridCols, setGridColsState] = useState(loadGridCols);
  const [layoutMode, setLayoutMode] = useState(loadLayoutMode);
  const [addAnchor, setAddAnchor] = useState(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const containerRef = React.useRef(null);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(widgets)); } catch {}
  }, [widgets]);

  useEffect(() => {
    try { localStorage.setItem(GRID_COLS_KEY, String(gridCols)); } catch {}
  }, [gridCols]);

  useEffect(() => {
    try { localStorage.setItem(LAYOUT_MODE_KEY, layoutMode); } catch {}
  }, [layoutMode]);

  // Saved-layout switcher (Settings → Layouts) fires this custom event
  // after writing the new state into the same localStorage keys we use.
  // Reload our state in-place so the user doesn't need to refresh the
  // page to see the applied layout.
  useEffect(() => {
    return busOn(LAYOUT_CHANGED, (detail) => {
      const next = detail?.widgets;
      const nextCols = Number(detail?.gridCols);
      if (Array.isArray(next)) setWidgets(next);
      if (Number.isFinite(nextCols)) setGridColsState(nextCols);
    });
  }, []);

  // When the user picks a new grid column count, the available NUMBER of
  // cells changes — but widgets keep their absolute (x, w) values, so each
  // widget covers exactly as many cells as it always did. Switching from
  // 20 to 4 cols means a widget with w=8 now overflows the grid, so we
  // CLAMP w (and re-anchor x) so it still fits. Heights / y are untouched.
  // This intentionally differs from the previous behavior (which rescaled
  // proportionally) — the user wants grid changes to add or remove cells,
  // not to rescale every widget at once.
  const setGridCols = (next) => {
    const clamped = Math.max(GRID_COL_MIN, Math.min(GRID_COL_MAX, Math.round(Number(next) || DEFAULT_GRID_COLS)));
    setGridColsState((prev) => {
      if (prev === clamped) return prev;
      setWidgets((all) => all.map((w) => {
        if (!w.layout) return w;
        const newW = Math.max(1, Math.min(w.layout.w || 1, clamped));
        const newX = Math.max(0, Math.min(w.layout.x || 0, clamped - newW));
        if (newW === w.layout.w && newX === w.layout.x) return w;
        return { ...w, layout: { ...w.layout, w: newW, x: newX } };
      }));
      return clamped;
    });
  };

  // Measure available width so the grid can lay out at the right pixel size.
  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const measure = () => setContainerWidth(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Pack new widgets at the bottom-left so they don't collide with existing
  // widgets. react-grid-layout would happily push siblings around for us, but
  // a deterministic placement is friendlier UX.
  const nextDropY = (existing) => {
    if (!existing.length) return 0;
    return Math.max(...existing.map((w) => (w.layout?.y || 0) + (w.layout?.h || 1)));
  };

  const addWidget = (type) => {
    const meta = catalogFor(type);
    setAddAnchor(null);
    // Singletons get a fixed id and may not be added more than once.
    if (meta.singleton && widgets.some((w) => w.type === type)) return;
    let initialConfig = {};
    if (type === 'news')   initialConfig = { section: 'top' };
    if (type === 'apps')   initialConfig = { suite: 'google' };
    if (type === 'header') initialConfig = { text: 'NEW SECTION' };
    const id = meta.persistentId || `w-${type}-${Date.now()}`;
    // Clamp default w to current grid width so 20-col defaults don't
    // overflow when the user is on an 8-col grid.
    const w = Math.min(meta.defaultSize.w, gridCols);
    setWidgets((prev) => [
      ...prev,
      { id, type, config: initialConfig, layout: { x: 0, y: nextDropY(prev), w, h: meta.defaultSize.h } },
    ]);
  };
  const removeWidget = (id) => setWidgets((prev) => prev.filter((w) => {
    if (w.id !== id) return true;
    const meta = catalogFor(w.type);
    return meta?.removable === false;   // keep non-removable widgets in the list
  }));
  // Duplicate a widget — clones type/config/size and drops the copy directly
  // BELOW the original so the user can see it appear without scrolling.
  // Singleton-style widgets (brand, header) can be duplicated since the
  // user explicitly asked for "Duplicate" — there's nothing inherent that
  // prevents multiple copies. Generates a fresh id so React keeps state
  // distinct between the copies.
  const duplicateWidget = (id) => setWidgets((prev) => {
    const src = prev.find((w) => w.id === id);
    if (!src) return prev;
    const newId = `${src.type}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const layout = src.layout || { x: 0, y: 0, w: 4, h: 4 };
    const copy = {
      ...src,
      id: newId,
      // Deep-clone config to avoid the duplicate sharing nested arrays/objects.
      config: structuredClone ? structuredClone(src.config || {}) : JSON.parse(JSON.stringify(src.config || {})),
      layout: { x: layout.x, y: layout.y + layout.h, w: layout.w, h: layout.h },
    };
    return [...prev, copy];
  });
  // Direct programmatic resize — used by the right-click "Half/Double height
  // / width / Reset size" menu actions so the user doesn't have to find and
  // drag a small handle. Clamps to grid bounds and the widget's own minSize.
  const resizeWidget = (id, mut) => setWidgets((prev) => prev.map((w) => {
    if (w.id !== id) return w;
    const meta = catalogFor(w.type);
    const cur = w.layout || { x: 0, y: 0, ...meta.defaultSize };
    const next = mut(cur, meta) || cur;
    const minW = meta.minSize?.w || 1;
    const minH = meta.minSize?.h || 1;
    const clampedW = Math.max(minW, Math.min(gridCols, Math.round(next.w)));
    const clampedH = Math.max(minH, Math.round(next.h));
    const clampedX = Math.max(0, Math.min(gridCols - clampedW, Math.round(next.x ?? cur.x)));
    return { ...w, layout: { ...cur, x: clampedX, w: clampedW, h: clampedH } };
  }));
  const halfHeight   = (id) => resizeWidget(id, (l, m) => ({ ...l, h: Math.max(m.minSize?.h || 1, Math.ceil(l.h / 2)) }));
  const halfWidth    = (id) => resizeWidget(id, (l, m) => ({ ...l, w: Math.max(m.minSize?.w || 1, Math.ceil(l.w / 2)) }));
  const doubleHeight = (id) => resizeWidget(id, (l)    => ({ ...l, h: l.h * 2 }));
  const doubleWidth  = (id) => resizeWidget(id, (l)    => ({ ...l, w: l.w * 2 }));
  const resetSize    = (id) => resizeWidget(id, (_l, m) => ({ ..._l, w: m.defaultSize.w, h: m.defaultSize.h }));
  const updateConfig = (id, patch) =>
    setWidgets((prev) => prev.map((w) => (w.id === id ? { ...w, config: { ...w.config, ...patch } } : w)));

  // react-grid-layout fires onLayoutChange on every drag/resize tick — we
  // just merge the new x/y/w/h back into each widget.
  const onLayoutChange = (next) => {
    setWidgets((prev) => prev.map((w) => {
      const l = next.find((n) => n.i === w.id);
      if (!l) return w;
      const cur = w.layout || {};
      if (cur.x === l.x && cur.y === l.y && cur.w === l.w && cur.h === l.h) return w;
      return { ...w, layout: { x: l.x, y: l.y, w: l.w, h: l.h } };
    }));
  };

  const layout = toLayoutArray(widgets);
  // react-grid-layout uses `compactType` to decide whether to auto-pack
  // widgets upward. In "free" mode we pass null so widgets stay exactly
  // where the user dropped them (and gaps between widgets are preserved).
  // `preventCollision` keeps widgets from overlapping each other.
  const rglCompactType = layoutMode === 'free' ? null : 'vertical';
  const rglPreventCollision = layoutMode === 'free';

  return (
    // Edge-to-edge: the grid fills 100% of its parent (HomePage gives it
    // the full inner width of the new-tab page). Previously it was capped
    // to min(1280px, 96vw) and centered — the user explicitly asked for
    // the dashboard to span the full window width.
    <Box sx={{ width: '100%', mt: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5, px: 0.5, gap: 1, flexWrap: 'wrap' }}>
        <Typography component="div" sx={{ fontFamily: MONO, fontSize: 11, letterSpacing: 2, textTransform: 'uppercase',
          color: '#5b6385', display: 'flex', alignItems: 'center', gap: 1, flex: 1, minWidth: 0 }}>
          drag the dotted handle to move · grab any side/corner pill to resize · right-click for more · min 1×1
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Tooltip title={layoutMode === 'free'
            ? 'Free placement — widgets stay where you put them (click to switch to compact pack)'
            : 'Compact pack — widgets auto-pack toward the top (click to switch to free placement)'}>
            <Button
              size="small" onClick={() => setLayoutMode(layoutMode === 'free' ? 'compact' : 'free')}
              sx={{ fontFamily: MONO, fontSize: 10, letterSpacing: 1, textTransform: 'uppercase',
                color: layoutMode === 'free' ? ACCENT : '#9aa3c7',
                border: `1px solid ${layoutMode === 'free' ? ACCENT : LINE}`,
                px: 1, py: 0.25, minWidth: 0, borderRadius: '4px',
              }}
            >
              {layoutMode === 'free' ? 'FREE' : 'PACK'}
            </Button>
          </Tooltip>
        </Box>
        {/* Grid columns picker was moved to Settings → Dashboard so the
            new-tab header stays focused on per-session actions (add widget,
            free/pack). The current grid count is still displayed read-only
            below for context. */}
        <Typography sx={{ fontFamily: MONO, fontSize: 10, letterSpacing: 1, color: '#5b6385' }}>
          GRID {gridCols} cols
        </Typography>
        <Button
          size="small" startIcon={<AddIcon />}
          onClick={(e) => setAddAnchor(e.currentTarget)}
          sx={{ fontFamily: MONO, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: '#e6e9f5' }}
        >
          Add widget
        </Button>
        <Menu anchorEl={addAnchor} open={!!addAnchor} onClose={() => setAddAnchor(null)}>
          {CATALOG.filter((c) => c.addable !== false).map((c) => (
            <MenuItem key={c.type} onClick={() => addWidget(c.type)}
              sx={{ gap: 1.2, fontFamily: MONO, fontSize: 13 }}>
              {c.icon}{c.label}
            </MenuItem>
          ))}
        </Menu>
      </Box>

      {/* Local CSS overrides for react-grid-layout to match our dark theme.
          The placeholder is the ghost block shown while dragging/resizing.
          All 8 resize handles are styled as semi-transparent pills that
          turn red on hover so the user knows every side is grabbable. */}
      <Box ref={containerRef} sx={{
        '& .react-grid-item.react-grid-placeholder': {
          background: 'rgba(214,69,61,0.18) !important',
          border: `1px dashed ${ACCENT}`,
          borderRadius: '4px', opacity: '1 !important',
        },
        '& .react-grid-item > .react-resizable-handle': {
          backgroundImage: 'none',
          // Was 0.35 → 0.6, now full-opacity-always. User reported they
          // couldn't easily resize tiny widgets (the brand "SB" tile) —
          // bumping visibility removes the guessing about where to grab.
          opacity: 0.9,
          transition: 'opacity 120ms ease, background 120ms ease, transform 120ms ease',
          pointerEvents: 'auto', zIndex: 5,
        },
        // Corners: small filled squares anchored to the corners. Sized up
        // from 12 to 14 so they're easier to grab on small widgets.
        '& .react-grid-item > .react-resizable-handle.react-resizable-handle-se,\
           & .react-grid-item > .react-resizable-handle.react-resizable-handle-sw,\
           & .react-grid-item > .react-resizable-handle.react-resizable-handle-ne,\
           & .react-grid-item > .react-resizable-handle.react-resizable-handle-nw': {
          width: 14, height: 14, background: 'rgba(214,69,61,0.75)',
          borderRadius: 2, border: '1px solid rgba(255,255,255,0.35)',
        },
        '& .react-grid-item > .react-resizable-handle.react-resizable-handle-se': { right: 2, bottom: 2, cursor: 'nwse-resize' },
        '& .react-grid-item > .react-resizable-handle.react-resizable-handle-sw': { left:  2, bottom: 2, cursor: 'nesw-resize' },
        '& .react-grid-item > .react-resizable-handle.react-resizable-handle-ne': { right: 2, top:    2, cursor: 'nesw-resize' },
        '& .react-grid-item > .react-resizable-handle.react-resizable-handle-nw': { left:  2, top:    2, cursor: 'nwse-resize' },
        // Edges: thin pills centered along each side. Sized up from
        // 6×32 to 8×40 for the same easier-to-grab reason as corners.
        '& .react-grid-item > .react-resizable-handle.react-resizable-handle-e,\
           & .react-grid-item > .react-resizable-handle.react-resizable-handle-w': {
          width: 8, height: 40, top: '50%', transform: 'translateY(-50%)',
          background: 'rgba(214,69,61,0.7)', borderRadius: 3,
        },
        '& .react-grid-item > .react-resizable-handle.react-resizable-handle-e': { right: 0, cursor: 'ew-resize' },
        '& .react-grid-item > .react-resizable-handle.react-resizable-handle-w': { left:  0, cursor: 'ew-resize' },
        '& .react-grid-item > .react-resizable-handle.react-resizable-handle-s,\
           & .react-grid-item > .react-resizable-handle.react-resizable-handle-n': {
          width: 40, height: 8, left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(214,69,61,0.7)', borderRadius: 3,
        },
        '& .react-grid-item > .react-resizable-handle.react-resizable-handle-s': { bottom: 0, cursor: 'ns-resize' },
        '& .react-grid-item > .react-resizable-handle.react-resizable-handle-n': { top:    0, cursor: 'ns-resize' },
        // On hover: brighten every handle and glow it red so the user knows
        // they can drag from any side or corner.
        '& .react-grid-item:hover > .react-resizable-handle': { opacity: 1, background: ACCENT },
        '& .react-grid-item > .react-resizable-handle:hover':  { opacity: 1, background: ACCENT, transform: 'scale(1.15)' },
        '& .react-draggable-dragging': { cursor: 'grabbing !important', zIndex: 10 },
        '& .react-grid-item.resizing':  { zIndex: 10, opacity: 0.95 },
      }}>
        {containerWidth > 0 && (
          <GridLayout
            className="sb-grid"
            layout={layout}
            cols={gridCols}
            rowHeight={computeRowHeight(containerWidth, gridCols)}
            width={containerWidth}
            margin={[GRID_MARGIN, GRID_MARGIN]}
            containerPadding={[0, 0]}
            draggableHandle=".sb-drag-handle"
            compactType={rglCompactType}
            preventCollision={rglPreventCollision}
            isBounded={false}
            allowOverlap={false}
            resizeHandles={['s', 'w', 'e', 'n', 'sw', 'nw', 'se', 'ne']}
            onLayoutChange={onLayoutChange}
          >
            {widgets.map((w) => (
              <div key={w.id}>
                <WidgetFrame
                  widget={w}
                  onRemove={() => removeWidget(w.id)}
                  onDuplicate={() => duplicateWidget(w.id)}
                  onHalfHeight={()   => halfHeight(w.id)}
                  onHalfWidth={()    => halfWidth(w.id)}
                  onDoubleHeight={() => doubleHeight(w.id)}
                  onDoubleWidth={()  => doubleWidth(w.id)}
                  onResetSize={()    => resetSize(w.id)}
                  onConfig={(patch) => updateConfig(w.id, patch)}
                  onOpen={onOpen}
                />
              </div>
            ))}
          </GridLayout>
        )}
      </Box>
    </Box>
  );
}

function WidgetFrame({
  widget, onRemove, onDuplicate, onConfig, onOpen,
  onHalfHeight, onHalfWidth, onDoubleHeight, onDoubleWidth, onResetSize,
}) {
  const meta = catalogFor(widget.type);
  // Brand + header widgets are "chromeless" — they own their entire frame
  // and don't show our standard title bar. The frame still has to host
  // the drag handle (so the user can move them) but it's an overlay, not
  // a strip at the top, so the widget content can use the full space.
  const chromeless = widget.type === 'brand' || widget.type === 'header';

  // Right-click → context menu (Duplicate / Remove). Anchored at the
  // pointer position with `anchorReference="anchorPosition"` so it lands
  // exactly where the user clicked, not at a fixed corner of the widget.
  const [ctxPos, setCtxPos] = useState(null);
  const openCtx = (e) => {
    // Inside form controls (text inputs in Notes, ticker input in Stocks,
    // etc.) we want the native browser context menu so copy/paste still
    // works. Skip our own menu when the click target is editable.
    const t = e.target;
    const editable = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
    if (editable) return;
    e.preventDefault();
    setCtxPos({ left: e.clientX + 2, top: e.clientY - 4 });
  };
  const closeCtx = () => setCtxPos(null);
  const ctxDuplicate = () => { closeCtx(); onDuplicate?.(); };
  const ctxRemove    = () => { closeCtx(); onRemove?.(); };

  const headerStrip = (
    <Box className="sb-drag-handle" sx={{
      display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.75,
      cursor: 'grab', userSelect: 'none',
    }}>
      <DragIndicatorIcon sx={{ fontSize: 14, color: '#5b6385' }} />
      <Box sx={{ color: ACCENT, display: 'flex', '& svg': { fontSize: 15 } }}>{meta.icon}</Box>
      <Typography sx={{ flex: 1, fontFamily: MONO, fontSize: 10, letterSpacing: 2,
        textTransform: 'uppercase', color: '#9aa3c7' }}>
        {meta.label}
      </Typography>
      {meta.removable !== false && (
        <Box className="wgt-controls" sx={{ display: 'flex', opacity: 0, transition: 'opacity 140ms ease' }}>
          <Tooltip title="Remove">
            <IconButton size="small" onClick={onRemove}
              onMouseDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
            >
              <CloseIcon sx={{ fontSize: 14 }} />
            </IconButton>
          </Tooltip>
        </Box>
      )}
    </Box>
  );

  // Chromeless frames get a small drag-handle overlay in the top-left
  // corner that only appears on hover, instead of the full title strip.
  const overlayHandle = (
    <Box
      className="sb-drag-handle wgt-controls"
      sx={{
        position: 'absolute', top: 2, left: 2, zIndex: 2,
        display: 'flex', alignItems: 'center', gap: 0.25,
        px: 0.5, py: 0.25, borderRadius: 1,
        background: 'rgba(8,9,14,0.7)',
        cursor: 'grab', userSelect: 'none',
        opacity: 0, transition: 'opacity 140ms ease',
        border: `1px solid ${LINE}`,
      }}>
      <DragIndicatorIcon sx={{ fontSize: 12, color: '#5b6385' }} />
      {meta.removable !== false && (
        <IconButton size="small" onClick={onRemove}
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          sx={{ p: 0.25 }}
        >
          <CloseIcon sx={{ fontSize: 12 }} />
        </IconButton>
      )}
    </Box>
  );

  return (
    <Box
      onContextMenu={openCtx}
      sx={{
      position: 'relative',
      height: '100%', width: '100%', display: 'flex', flexDirection: 'column',
      p: chromeless ? 0.5 : 1.25, borderRadius: '4px',
      background: chromeless ? 'transparent' : SURFACE,
      border: chromeless ? '1px solid transparent' : `1px solid ${LINE}`,
      backgroundImage: chromeless ? 'none' : 'radial-gradient(rgba(255,255,255,0.05) 1px, transparent 1px)',
      backgroundSize: '14px 14px',
      transition: 'border-color 140ms ease, background 140ms ease',
      '&:hover': {
        borderColor: chromeless ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.22)',
        background: chromeless ? 'rgba(8,9,14,0.35)' : SURFACE,
      },
      '&:hover .wgt-controls': { opacity: 1 },
    }}>
      {chromeless ? overlayHandle : headerStrip}
      <Box sx={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
        {widget.type === 'brand' && <BrandWidget layout={widget.layout} />}
        {widget.type === 'header' && <HeaderWidget config={widget.config} onConfig={onConfig} layout={widget.layout} />}
        {widget.type === 'search' && <SearchWidget onOpen={onOpen} />}
        {widget.type === 'aishortcuts' && <AiShortcutsWidget onOpen={onOpen} />}
        {widget.type === 'apps' && <AppsWidget config={widget.config} onConfig={onConfig} onOpen={onOpen} />}
        {widget.type === 'clock' && <ClockWidget layout={widget.layout} />}
        {widget.type === 'calendar' && <CalendarWidget />}
        {widget.type === 'notes' && <NotesWidget config={widget.config} onConfig={onConfig} />}
        {widget.type === 'links' && <LinksWidget config={widget.config} onConfig={onConfig} onOpen={onOpen} />}
        {widget.type === 'worldclock' && <WorldClockWidget config={widget.config} onConfig={onConfig} />}
        {widget.type === 'stocks' && <StockWidget config={widget.config} onConfig={onConfig} layout={widget.layout} />}
        {widget.type === 'ai' && <AiWidget config={widget.config} onConfig={onConfig} onOpen={onOpen} />}
        {widget.type === 'news' && <NewsFeed onOpen={onOpen} compact />}
      </Box>

      {/* Right-click menu — Duplicate clones the widget directly below the
          original; the Resize submenu lets the user halve/double the
          widget without trying to grab the small drag handles (the user
          reported they couldn't easily shrink the brand "SB" tile);
          Remove only renders when the catalog entry allows it. */}
      <Menu
        open={!!ctxPos}
        onClose={closeCtx}
        anchorReference="anchorPosition"
        anchorPosition={ctxPos || undefined}
        slotProps={{ paper: { sx: { minWidth: 180, background: '#0a0e22',
          border: `1px solid ${LINE}`, borderRadius: 1.5 } } }}
      >
        <MenuItem onClick={ctxDuplicate} sx={{ fontFamily: MONO, fontSize: 12, gap: 1 }}>
          Duplicate
        </MenuItem>
        <Divider sx={{ my: 0.5, borderColor: 'rgba(255,255,255,0.06)' }} />
        <MenuItem
          onClick={() => { closeCtx(); onHalfHeight?.(); }}
          sx={{ fontFamily: MONO, fontSize: 12, gap: 1 }}
          // Brand widget's catalog minH is 1, so halving from any height
          // always lands somewhere valid. Disable only when already at 1.
          disabled={(widget.layout?.h || 1) <= 1}
        >
          ½ Height
          <Box sx={{ flex: 1 }} />
          <Typography sx={{ fontSize: 10, color: '#7a82a8' }}>
            {widget.layout?.h}→{Math.max(1, Math.ceil((widget.layout?.h || 1) / 2))}
          </Typography>
        </MenuItem>
        <MenuItem
          onClick={() => { closeCtx(); onHalfWidth?.(); }}
          sx={{ fontFamily: MONO, fontSize: 12, gap: 1 }}
          disabled={(widget.layout?.w || 1) <= 1}
        >
          ½ Width
          <Box sx={{ flex: 1 }} />
          <Typography sx={{ fontSize: 10, color: '#7a82a8' }}>
            {widget.layout?.w}→{Math.max(1, Math.ceil((widget.layout?.w || 1) / 2))}
          </Typography>
        </MenuItem>
        <MenuItem
          onClick={() => { closeCtx(); onDoubleHeight?.(); }}
          sx={{ fontFamily: MONO, fontSize: 12, gap: 1 }}
        >
          2× Height
          <Box sx={{ flex: 1 }} />
          <Typography sx={{ fontSize: 10, color: '#7a82a8' }}>
            {widget.layout?.h}→{(widget.layout?.h || 1) * 2}
          </Typography>
        </MenuItem>
        <MenuItem
          onClick={() => { closeCtx(); onDoubleWidth?.(); }}
          sx={{ fontFamily: MONO, fontSize: 12, gap: 1 }}
        >
          2× Width
          <Box sx={{ flex: 1 }} />
          <Typography sx={{ fontSize: 10, color: '#7a82a8' }}>
            {widget.layout?.w}→{(widget.layout?.w || 1) * 2}
          </Typography>
        </MenuItem>
        <MenuItem
          onClick={() => { closeCtx(); onResetSize?.(); }}
          sx={{ fontFamily: MONO, fontSize: 12, gap: 1 }}
        >
          Reset size
          <Box sx={{ flex: 1 }} />
          <Typography sx={{ fontSize: 10, color: '#7a82a8' }}>
            {meta?.defaultSize?.w}×{meta?.defaultSize?.h}
          </Typography>
        </MenuItem>
        {meta?.removable !== false && (
          <>
            <Divider sx={{ my: 0.5, borderColor: 'rgba(255,255,255,0.06)' }} />
            <MenuItem onClick={ctxRemove} sx={{ fontFamily: MONO, fontSize: 12, gap: 1, color: ACCENT }}>
              Remove
            </MenuItem>
          </>
        )}
      </Menu>
    </Box>
  );
}

// ===========================================================================
// BrandWidget — the SmartBrowser wordmark, made placeable + resizable. Auto-
// sizes its typography to fit the widget's actual pixel size so it looks
// crisp whether it's a tiny 1×1 tile or a hero 12×8 banner.
// ===========================================================================
// Inline SVG logo that uses the same gradient as the "SmartBrowser"
// wordmark. We render this when the widget is too narrow to comfortably
// fit the full wordmark, so the brand is always recognizable regardless
// of how the user has resized the tile.
function BrandIcon({ size = 40 }) {
  const gid = React.useId();   // unique gradient id per instance
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} style={{ display: 'block' }}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%"   stopColor="#7aa2ff" />
          <stop offset="50%"  stopColor="#a78bfa" />
          <stop offset="100%" stopColor="#34d399" />
        </linearGradient>
      </defs>
      <rect x="6" y="6" width="52" height="52" rx="13" ry="13"
        fill="none" stroke={`url(#${gid})`} strokeWidth="3.5" />
      <text x="32" y="42" textAnchor="middle"
        fontFamily="ui-sans-serif, system-ui, -apple-system, Inter, sans-serif"
        fontWeight="800" fontSize="28" letterSpacing="-1.2"
        fill={`url(#${gid})`}>
        SB
      </text>
    </svg>
  );
}

function BrandWidget() {
  // Measure the actual rendered size of the widget so we can decide
  // between "icon only" and "full wordmark" regardless of how many grid
  // columns the user configured (col-width estimates from `layout.w`
  // alone are wrong on dense 50-col grids).
  const rootRef = React.useRef(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  React.useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ~160 px is the minimum width at which the gradient wordmark renders
  // legibly with the default font scaling. Below that we collapse to the
  // SB logo block, which scales gracefully down to a single grid cell.
  const showIconOnly = size.w > 0 && size.w < 160;
  const big          = size.h >= 110 && !showIconOnly;
  const showTagline  = size.h >= 80  && !showIconOnly && size.w >= 220;

  if (showIconOnly) {
    const iconSize = Math.max(20, Math.min(size.h * 0.78, size.w * 0.78, 96));
    return (
      <Box ref={rootRef} sx={{
        width: '100%', height: '100%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <BrandIcon size={iconSize} />
      </Box>
    );
  }

  return (
    <Box ref={rootRef} sx={{
      width: '100%', height: '100%',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      gap: 0.5, px: 1, minWidth: 0,
    }}>
      <Typography sx={{
        fontWeight: 800, letterSpacing: -1.0, textAlign: 'center', lineHeight: 1,
        fontSize: big ? 'clamp(28px, 5.5vw, 60px)' : 'clamp(16px, 3.5vw, 30px)',
        background: 'linear-gradient(90deg,#7aa2ff,#a78bfa,#34d399)',
        WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%',
      }}>
        Smart<span style={{ fontWeight: 400 }}>Browser</span>
      </Typography>
      {showTagline && (
        <Typography sx={{
          display: 'block', textAlign: 'center',
          color: '#9aa3c7', fontFamily: MONO, fontSize: big ? 11 : 9,
          letterSpacing: 2, textTransform: 'uppercase',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%',
        }}>
          Private · Masked · Free
        </Typography>
      )}
    </Box>
  );
}

// ===========================================================================
// HeaderWidget — a section label that can be edited inline. The user can
// add multiple of these to title different zones of the dashboard
// ("DASHBOARD", "OFFICE", "GAMES", "NEWS"). Typography scales with the
// widget height so a tall instance reads like a hero, a tiny one like a
// caption.
// ===========================================================================
function HeaderWidget({ config, onConfig, layout }) {
  const text = (config.text ?? 'NEW SECTION');
  const cells = (layout?.h || 2);
  const px = cells * 40 + (cells - 1) * 8;
  const big = px >= 80;
  const editableRef = React.useRef(null);

  // Sync external `text` changes (e.g. config restored from storage) into
  // the contentEditable DOM. We can't bind `textContent` declaratively in
  // React, so we imperatively set it whenever `text` changes AND the user
  // isn't actively editing (the element doesn't have focus). Without this
  // guard, every keypress would clobber the caret position.
  React.useEffect(() => {
    const el = editableRef.current;
    if (!el) return;
    if (document.activeElement === el) return;
    if (el.textContent !== text) el.textContent = text;
  }, [text]);

  const commit = () => {
    const val = (editableRef.current?.textContent || '').replace(/\s+/g, ' ').trim();
    if (val !== text) onConfig({ text: val });
  };

  // The PREVIOUS implementation put contentEditable on the outer flex box
  // and tried to keep the dot + the text span as React children inside it.
  // The browser's editor inserted each typed character as a sibling text
  // node BETWEEN those spans, and because the outer box was a flex
  // container the new text nodes were laid out as separate flex items
  // (each on its own line) — that's why "sam" rendered as s / a / m
  // stacked vertically. The fix is to keep React's flex container
  // un-editable, and put contentEditable ONLY on the inner text span
  // (which has whiteSpace:nowrap so it always lays out horizontally).
  return (
    <Box sx={{
      width: '100%', height: '100%',
      display: 'flex', alignItems: 'center', gap: 1, px: 1,
    }}>
      <Box component="span" sx={{ width: big ? 8 : 6, height: big ? 8 : 6, borderRadius: '50%',
        background: ACCENT, flexShrink: 0, alignSelf: 'center' }} />
      <Box
        component="span"
        ref={editableRef}
        contentEditable
        suppressContentEditableWarning
        spellCheck={false}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); }
        }}
        sx={{
          flex: 1, minWidth: 0,
          fontFamily: MONO, color: '#cdd3ee',
          fontSize: big ? 'clamp(14px, 1.6vw, 22px)' : 'clamp(11px, 1.1vw, 14px)',
          letterSpacing: big ? 4 : 3, textTransform: 'uppercase',
          overflow: 'hidden', textOverflow: 'ellipsis',
          whiteSpace: 'nowrap', display: 'inline-block',
          cursor: 'text', outline: 'none',
          '&:focus': { background: 'rgba(255,255,255,0.03)', borderRadius: '2px' },
        }}
      >
        {/* initial content; later updates flow through the useEffect above */}
        {text}
      </Box>
    </Box>
  );
}

function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

function ClockWidget({ layout }) {
  const now = useNow();
  const big = (layout?.w || 4) >= 6 || (layout?.h || 2) >= 3;
  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
      <Typography sx={{ fontFamily: MONO, fontWeight: 700, lineHeight: 1,
        fontSize: big ? 'clamp(40px, 8vw, 72px)' : 'clamp(28px, 5vw, 44px)',
        color: '#e6e9f5', fontVariantNumeric: 'tabular-nums' }}>
        {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </Typography>
      <Typography sx={{ fontFamily: MONO, fontSize: 11, letterSpacing: 1, color: '#9aa3c7', mt: 0.5,
        textTransform: 'uppercase' }}>
        {now.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
        {' · '}
        {now.toLocaleTimeString([], { second: '2-digit' })}s
      </Typography>
    </Box>
  );
}

function CalendarWidget() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const today = now.getDate();
  const first = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < first; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <Box sx={{ height: '100%' }}>
      <Typography sx={{ fontFamily: MONO, fontSize: 11, letterSpacing: 1, color: '#e6e9f5',
        textTransform: 'uppercase', mb: 0.5 }}>
        {now.toLocaleDateString([], { month: 'long', year: 'numeric' })}
      </Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 0.25 }}>
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <Typography key={i} sx={{ fontFamily: MONO, fontSize: 9, textAlign: 'center', color: '#5b6385' }}>{d}</Typography>
        ))}
        {cells.map((d, i) => (
          <Box key={i} sx={{
            fontFamily: MONO, textAlign: 'center', fontSize: 10, py: 0.2,
            color: d === today ? '#fff' : '#cdd3ee',
            fontWeight: d === today ? 700 : 400,
            background: d === today ? ACCENT : 'transparent',
            borderRadius: '2px',
          }}>
            {d || ''}
          </Box>
        ))}
      </Box>
    </Box>
  );
}

// Build the same HTML view used by the panel — see NotesPanel.jsx for the
// canonical implementation. Inlined here so the widget doesn't pull in the
// (heavier) panel module.
function widgetNoteToHtml(note) {
  if (!note) return '';
  const raw = note.content || '';
  if (/<\w+/.test(raw)) return raw;
  const esc = (s) => String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const text = raw.split(/\n{2,}/).map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('') || '<p><br></p>';
  const imgs = (note.images || []).map((i) =>
    `<p><img class="sb-note-img" src="${String(i.src).replace(/"/g, '&quot;')}" alt=""></p>`
  ).join('');
  return text + imgs;
}

// Insert an <img> at the current selection inside a contentEditable. Mirror
// of NotesPanel.insertNodeIntoEditor so the widget's paste behavior matches.
function insertInlineImage(editor, src, alt, savedRange) {
  const img = document.createElement('img');
  img.src = src;
  img.alt = alt || '';
  img.draggable = false;
  img.className = 'sb-note-img';
  img.style.maxWidth = '100%';
  img.style.borderRadius = '4px';
  img.style.display = 'inline-block';
  img.style.cursor = 'pointer';
  img.style.margin = '2px 0';
  editor.focus();
  const sel = window.getSelection();
  let range;
  if (sel && sel.rangeCount > 0 && editor.contains(sel.anchorNode)) {
    range = sel.getRangeAt(0);
  } else if (savedRange && editor.contains(savedRange.startContainer)) {
    range = savedRange.cloneRange();
  } else {
    range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
  }
  range.deleteContents();
  range.insertNode(img);
  range.setStartAfter(img);
  range.collapse(true);
  if (sel) { sel.removeAllRanges(); sel.addRange(range); }
}

// Compact "5m ago" / "Mon 14:32" style timestamp for the all-notes menu.
// Anything <60s reads "just now", <60m reads "Xm", <24h reads "Xh", older
// shows weekday + time so the user can spot it at a glance.
function fmtNoteTime(ts) {
  if (!ts) return '';
  const diff = Date.now() - ts;
  if (diff < 60_000)    return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
  const d = new Date(ts);
  return d.toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' });
}

// Plain-text preview of a note for menu rows. Strips HTML and images so the
// row stays one line tall regardless of what's inside.
function previewOfNote(n) {
  if (!n) return '';
  const raw = n.content || '';
  const stripped = raw
    .replace(/<img[^>]*>/gi, ' [image] ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
  return stripped || '(empty)';
}

// NotesWidget mirrors the shared notes store the panel uses. It IS a mini
// editor: contentEditable + inline image insertion at the cursor, exactly
// like the panel. Clicking any inline image opens the full Notes panel
// jumped to this note (the lightbox lives there to keep this widget small).
function NotesWidget({ config, onConfig }) {
  const [notes, setNotes] = useState([]);
  const [dirty, setDirty] = useState(false);
  const [listMenuAnchor, setListMenuAnchor] = useState(null);
  const editorRef = React.useRef(null);
  const saveTimerRef = React.useRef(null);
  const loadedNoteIdRef = React.useRef(null);
  const draftRef = React.useRef('');
  const savedRangeRef = React.useRef(null);

  const noteId = config.noteId || notes[0]?.id || null;
  const note   = notes.find((n) => n.id === noteId) || null;

  const reload = async () => {
    if (!sbAPI?.notes) return [];
    const list = await sbAPI.notes.list();
    setNotes(list);
    return list;
  };

  useEffect(() => { reload(); }, []);

  // Re-fetch periodically so notes added from the full panel show up here
  // without needing a page reload.
  useEffect(() => {
    const id = setInterval(() => { reload().catch(() => {}); }, 5000);
    return () => clearInterval(id);
  }, []);

  // Load HTML into the editor on note-change, OR when the panel edited the
  // same note out-of-band (we re-sync only when our local draft is clean).
  useEffect(() => {
    const el = editorRef.current;
    if (!el || !note) return;
    if (loadedNoteIdRef.current === note.id) {
      if (!dirty && draftRef.current !== (note.content || '')) {
        el.innerHTML = widgetNoteToHtml(note);
        draftRef.current = el.innerHTML;
      }
      return;
    }
    loadedNoteIdRef.current = note.id;
    el.innerHTML = widgetNoteToHtml(note);
    draftRef.current = el.innerHTML;
    setDirty(false);
  }, [note?.id, note?.content, note?.updatedAt]);

  useEffect(() => {
    if (!dirty || !noteId) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      await sbAPI.notes.update(noteId, { content: draftRef.current, images: [] });
      setDirty(false);
      reload();
    }, 700);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [dirty, noteId]);

  const onInput = () => {
    draftRef.current = editorRef.current?.innerHTML || '';
    setDirty(true);
  };
  const saveSelection = () => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && editorRef.current?.contains(sel.anchorNode)) {
      savedRangeRef.current = sel.getRangeAt(0).cloneRange();
    }
  };
  const onPaste = async (e) => {
    if (!sbAPI?.notes || !noteId) return;
    const items = Array.from(e.clipboardData?.items || []);
    const imgs  = items.filter((it) => it.type && it.type.startsWith('image/'));
    if (imgs.length > 0) {
      e.preventDefault();
      for (const it of imgs) {
        const f = it.getAsFile();
        if (!f) continue;
        const src = await new Promise((resolve) => {
          const fr = new FileReader();
          fr.onload = () => resolve(String(fr.result || ''));
          fr.readAsDataURL(f);
        });
        insertInlineImage(editorRef.current, src, f.name, savedRangeRef.current);
      }
      onInput();
      return;
    }
    const text = e.clipboardData?.getData('text/plain');
    if (text) {
      e.preventDefault();
      document.execCommand('insertText', false, text);
      onInput();
    }
  };
  const onEditorClick = (e) => {
    if (e.target.tagName === 'IMG' && e.target.classList.contains('sb-note-img')) {
      window.dispatchEvent(new CustomEvent('sb:open-notes', { detail: { noteId } }));
    }
  };

  const createAndUse = async () => {
    const created = await sbAPI.notes.create({ title: 'Quick note', content: '' });
    await reload();
    loadedNoteIdRef.current = null;
    onConfig({ noteId: created.id });
  };
  const openInPanel = () => {
    window.dispatchEvent(new CustomEvent('sb:open-notes', { detail: { noteId } }));
  };

  if (!sbAPI?.notes) {
    return (
      <InputBase
        multiline
        value={config.text || ''}
        onChange={(e) => onConfig({ text: e.target.value })}
        placeholder="JOT SOMETHING DOWN…"
        sx={{
          width: '100%', height: '100%', alignItems: 'flex-start',
          color: '#e6e9f5', fontFamily: MONO, fontSize: 12, lineHeight: 1.5,
          '& textarea': { height: '100% !important' },
          '& textarea::placeholder': { letterSpacing: 1, opacity: 0.5 },
        }}
      />
    );
  }

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 0.5, minHeight: 0 }}>
      {/* Header row: current note title, prev/next steppers through the
          notes history, a count badge that doubles as a "show all" menu,
          a + button to start a new note, and a → to expand into the
          full Notes panel. */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <Typography sx={{ fontFamily: MONO, fontSize: 10, letterSpacing: 1, color: '#9aa3c7', flex: 1,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {note ? (note.title || 'UNTITLED').toUpperCase() : 'NO NOTE'}
        </Typography>
        {notes.length > 1 && (
          <>
            <Tooltip title="Previous note">
              <IconButton size="small" sx={{ p: 0.25, color: '#9aa3c7' }}
                onClick={() => {
                  const idx = notes.findIndex((n) => n.id === noteId);
                  const prev = notes[idx > 0 ? idx - 1 : notes.length - 1];
                  if (prev) { loadedNoteIdRef.current = null; onConfig({ noteId: prev.id }); }
                }}
              >
                <ChevronLeftIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title={`${notes.length} notes — click for full list`}>
              <Box
                onClick={(e) => setListMenuAnchor(e.currentTarget)}
                sx={{
                  fontFamily: MONO, fontSize: 9, letterSpacing: 1, color: ACCENT,
                  px: 0.6, py: 0.15, borderRadius: 0.75, cursor: 'pointer',
                  border: `1px solid ${ACCENT}55`,
                  '&:hover': { background: `${ACCENT}1a` },
                }}
              >
                {notes.length}
              </Box>
            </Tooltip>
            <Tooltip title="Next note">
              <IconButton size="small" sx={{ p: 0.25, color: '#9aa3c7' }}
                onClick={() => {
                  const idx = notes.findIndex((n) => n.id === noteId);
                  const next = notes[idx >= 0 && idx < notes.length - 1 ? idx + 1 : 0];
                  if (next) { loadedNoteIdRef.current = null; onConfig({ noteId: next.id }); }
                }}
              >
                <ChevronRightIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </>
        )}
        <Tooltip title="New note">
          <IconButton size="small" onClick={createAndUse} sx={{ p: 0.25, color: '#9aa3c7' }}>
            <AddIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Open in Notes panel">
          <IconButton size="small" onClick={openInPanel} sx={{ p: 0.25, color: '#9aa3c7' }}>
            <ChevronRightIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>
      {/* "All notes" dropdown — shows every note with a relative timestamp
          + a small content preview so the user can spot the one they want. */}
      <Menu
        anchorEl={listMenuAnchor} open={!!listMenuAnchor} onClose={() => setListMenuAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        PaperProps={{ sx: { maxHeight: 360, maxWidth: 320, mt: 0.5, background: 'rgba(8,9,14,0.96)',
          border: `1px solid ${LINE}` } }}
      >
        {notes.map((n) => (
          <MenuItem
            key={n.id}
            selected={n.id === noteId}
            onClick={() => { loadedNoteIdRef.current = null; onConfig({ noteId: n.id }); setListMenuAnchor(null); }}
            sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
              gap: 0.25, py: 0.75, borderBottom: `1px solid ${LINE}` }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, width: '100%' }}>
              <Typography sx={{ fontFamily: MONO, fontSize: 12, color: '#e6e9f5', flex: 1,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {n.title || 'Untitled'}
              </Typography>
              <Typography sx={{ fontFamily: MONO, fontSize: 9, color: '#5b6385', letterSpacing: 1 }}>
                {fmtNoteTime(n.updatedAt)}
              </Typography>
            </Box>
            <Typography sx={{ fontFamily: MONO, fontSize: 10, color: '#9aa3c7', maxWidth: 280,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {previewOfNote(n)}
            </Typography>
          </MenuItem>
        ))}
        {notes.length === 0 && (
          <MenuItem disabled sx={{ fontFamily: MONO, fontSize: 11, color: '#5b6385' }}>
            No notes yet
          </MenuItem>
        )}
      </Menu>
      {!note ? (
        <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Button size="small" variant="outlined" onClick={createAndUse}
            sx={{ fontFamily: MONO, letterSpacing: 1, fontSize: 10, color: ACCENT,
              borderColor: ACCENT, '&:hover': { borderColor: ACCENT, background: 'rgba(214,69,61,0.08)' } }}
          >
            + NEW NOTE
          </Button>
        </Box>
      ) : (
        <Box
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          spellCheck={false}
          onInput={onInput}
          onPaste={onPaste}
          onClick={onEditorClick}
          onKeyUp={saveSelection}
          onMouseUp={saveSelection}
          onBlur={saveSelection}
          sx={{
            flex: 1, overflow: 'auto', minHeight: 0,
            outline: 'none',
            color: '#e6e9f5', fontFamily: MONO, fontSize: 12, lineHeight: 1.55,
            '& img': { maxWidth: '100%', borderRadius: '4px', cursor: 'pointer', margin: '2px 0' },
            '& p': { margin: '0 0 4px 0' },
          }}
        />
      )}
    </Box>
  );
}

function LinksWidget({ config, onConfig, onOpen }) {
  const links = config.links || [];
  const [label, setLabel] = useState('');
  const [url, setUrl] = useState('');
  const add = () => {
    if (!label.trim() || !url.trim()) return;
    const full = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    onConfig({ links: [...links, { label: label.trim(), url: full }] });
    setLabel(''); setUrl('');
  };
  const remove = (idx) => onConfig({ links: links.filter((_, i) => i !== idx) });

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 0.5 }}>
      <Box sx={{ flex: 1, overflow: 'auto' }}>
        {links.length === 0 && (
          <Typography sx={{ fontFamily: MONO, fontSize: 10, color: '#5b6385', letterSpacing: 1 }}>
            NO LINKS YET — ADD BELOW
          </Typography>
        )}
        {links.map((l, i) => (
          <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Box component="span" sx={{ color: ACCENT, fontFamily: MONO, fontSize: 11 }}>›</Box>
            <Typography
              onClick={() => onOpen?.(l.url)}
              sx={{ flex: 1, fontFamily: MONO, fontSize: 12, color: '#cdd3ee', cursor: 'pointer',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                '&:hover': { color: '#fff' } }}
            >
              {l.label}
            </Typography>
            <IconButton size="small" onClick={() => remove(i)}><CloseIcon sx={{ fontSize: 12 }} /></IconButton>
          </Box>
        ))}
      </Box>
      <Box sx={{ display: 'flex', gap: 0.5 }}>
        <TextField variant="standard" placeholder="NAME" value={label}
          onChange={(e) => setLabel(e.target.value)}
          sx={{ flex: 1, '& input': { fontFamily: MONO, fontSize: 11, color: '#e6e9f5' } }} />
        <TextField variant="standard" placeholder="URL" value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          sx={{ flex: 1, '& input': { fontFamily: MONO, fontSize: 11, color: '#e6e9f5' } }} />
        <IconButton size="small" onClick={add}><AddIcon sx={{ fontSize: 15, color: ACCENT }} /></IconButton>
      </Box>
    </Box>
  );
}

const ZONES = [
  { label: 'Local', tz: undefined },
  { label: 'New York', tz: 'America/New_York' },
  { label: 'London', tz: 'Europe/London' },
  { label: 'Berlin', tz: 'Europe/Berlin' },
  { label: 'Mumbai', tz: 'Asia/Kolkata' },
  { label: 'Tokyo', tz: 'Asia/Tokyo' },
  { label: 'Sydney', tz: 'Australia/Sydney' },
];

function WorldClockWidget({ config, onConfig }) {
  const now = useNow();
  const zoneLabel = config.zone || 'New York';
  const zone = ZONES.find((z) => z.label === zoneLabel) || ZONES[1];
  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 0.75 }}>
      <Typography sx={{ fontFamily: MONO, fontWeight: 700, fontSize: 'clamp(24px, 4vw, 36px)',
        color: '#e6e9f5', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
        {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: zone.tz })}
      </Typography>
      <Select
        variant="standard" value={zoneLabel}
        onChange={(e) => onConfig({ zone: e.target.value })}
        sx={{ fontFamily: MONO, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: '#9aa3c7',
          '& .MuiSelect-icon': { color: ACCENT } }}
      >
        {ZONES.map((z) => <MenuItem key={z.label} value={z.label} sx={{ fontFamily: MONO, fontSize: 12 }}>{z.label}</MenuItem>)}
      </Select>
    </Box>
  );
}

// Default watchlist — five major US ETFs covering broad market exposure.
const DEFAULT_SYMBOLS = ['SPY', 'QQQ', 'VOO', 'VTI', 'DIA'];

// Hard-coded fallback names for the default ETFs so the widget shows real
// names even when Yahoo's API rate-limits us or trims the meta payload.
const SYMBOL_NAMES = {
  SPY: 'SPDR S&P 500 ETF Trust',
  QQQ: 'Invesco QQQ Trust',
  VOO: 'Vanguard S&P 500 ETF',
  VTI: 'Vanguard Total Stock Market ETF',
  DIA: 'SPDR Dow Jones Industrial Average ETF',
  IWM: 'iShares Russell 2000 ETF',
  AGG: 'iShares Core U.S. Aggregate Bond ETF',
  GLD: 'SPDR Gold Shares',
};

async function fetchQuote(symbol) {
  // Yahoo Finance v8 chart API — key-less, returns last price + previous close.
  // Routed through the local backend `/api/proxy` to bypass CORS.
  // We tack on the optional ?lang=en-US so meta.longName / shortName are
  // populated reliably (Yahoo sometimes omits them on bare requests).
  const upstream = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d&lang=en-US&region=US`;
  const res = await fetch(proxyUrlFor(upstream), { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const meta = data?.chart?.result?.[0]?.meta;
  if (!meta) throw new Error('no data');
  const price = Number(meta.regularMarketPrice);
  const prev  = Number(meta.chartPreviousClose ?? meta.previousClose);
  const change = price - prev;
  const pct = prev ? (change / prev) * 100 : 0;
  const sym = (meta.symbol || symbol).toUpperCase();
  const name = meta.longName || meta.shortName || meta.instrumentName || SYMBOL_NAMES[sym] || '';
  return {
    symbol: sym, name,
    price, change, pct,
    currency: meta.currency || 'USD',
  };
}

function fmtPrice(v, ccy) {
  if (!Number.isFinite(v)) return '—';
  const sym = ccy === 'USD' ? '$' : (ccy === 'INR' ? '₹' : (ccy === 'EUR' ? '€' : (ccy === 'GBP' ? '£' : '')));
  return `${sym}${v.toFixed(2)}`;
}

function StockWidget({ config, onConfig, layout }) {
  const symbols = (config.symbols && config.symbols.length) ? config.symbols : DEFAULT_SYMBOLS;
  const [quotes, setQuotes] = useState(null);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState('');

  const load = React.useCallback(async () => {
    setError('');
    try {
      const results = await Promise.allSettled(symbols.map(fetchQuote));
      setQuotes(results.map((r, i) => r.status === 'fulfilled'
        ? r.value
        : { symbol: symbols[i], error: true }));
    } catch (e) { setError(e.message || 'failed'); }
  }, [symbols]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { const id = setInterval(load, 60000); return () => clearInterval(id); }, [load]);

  const addSymbol = () => {
    const s = adding.trim().toUpperCase();
    if (!s || symbols.includes(s)) { setAdding(''); return; }
    onConfig({ symbols: [...symbols, s] });
    setAdding('');
  };
  const removeSymbol = (s) => onConfig({ symbols: symbols.filter((x) => x !== s) });
  const resetDefaults = () => onConfig({ symbols: DEFAULT_SYMBOLS });

  // "compact" hides the company name column; we now ALWAYS show the name
  // (the user explicitly asked) but in compact mode it goes on a second
  // line under the ticker instead of in its own column, so the price stays
  // visible even on narrow widgets.
  const compact = (layout?.w || 4) < 8;

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
        {!quotes && !error && (
          <Typography sx={{ fontFamily: MONO, fontSize: 10, color: '#5b6385', letterSpacing: 1 }}>
            LOADING QUOTES…
          </Typography>
        )}
        {error && (
          <Typography sx={{ fontFamily: MONO, fontSize: 10, color: '#5b6385', letterSpacing: 1 }}>
            {error.toUpperCase()}
          </Typography>
        )}
        {quotes && quotes.map((q) => {
          const up = q.pct > 0, down = q.pct < 0;
          const color = q.error ? '#5b6385' : (up ? '#34d399' : down ? '#f87171' : '#9aa3c7');
          const displayName = q.name || SYMBOL_NAMES[q.symbol] || '';
          return (
            <Box key={q.symbol} sx={{
              display: 'grid', alignItems: 'center', gap: 1,
              gridTemplateColumns: compact
                ? '1fr auto auto auto'                  // [ticker+name stacked] [price] [pct] [×]
                : '60px minmax(0,1fr) auto auto auto', // [ticker] [name] [price] [pct] [×]
              py: 0.5, borderBottom: `1px solid ${LINE}`,
              '&:hover .stk-x': { opacity: 1 },
            }}>
              <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: '#e6e9f5', lineHeight: 1.2 }}>
                  {q.symbol}
                </Typography>
                {compact && displayName && (
                  <Tooltip title={displayName}>
                    <Typography sx={{ fontFamily: MONO, fontSize: 9.5, color: '#7a82a8',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>
                      {displayName}
                    </Typography>
                  </Tooltip>
                )}
              </Box>
              {!compact && (
                <Tooltip title={displayName}>
                  <Typography sx={{ fontFamily: MONO, fontSize: 11, color: '#9aa3c7',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {displayName || '—'}
                  </Typography>
                </Tooltip>
              )}
              <Typography sx={{ fontFamily: MONO, fontSize: 12, color: '#cdd3ee',
                fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>
                {q.error ? '—' : fmtPrice(q.price, q.currency)}
              </Typography>
              <Typography sx={{ fontFamily: MONO, fontSize: 11, color, fontVariantNumeric: 'tabular-nums',
                minWidth: 56, textAlign: 'right' }}>
                {q.error ? '' : `${up ? '▲' : down ? '▼' : '·'} ${Math.abs(q.pct).toFixed(2)}%`}
              </Typography>
              <IconButton
                className="stk-x" size="small"
                onClick={() => removeSymbol(q.symbol)}
                sx={{ opacity: 0, transition: 'opacity 120ms' }}
              >
                <CloseIcon sx={{ fontSize: 12 }} />
              </IconButton>
            </Box>
          );
        })}
      </Box>
      <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center', mt: 0.5 }}>
        <TextField
          variant="standard" placeholder="ADD TICKER" value={adding}
          onChange={(e) => setAdding(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addSymbol()}
          sx={{ flex: 1, '& input': { fontFamily: MONO, fontSize: 11, color: '#e6e9f5', textTransform: 'uppercase' } }}
        />
        <IconButton size="small" onClick={addSymbol}><AddIcon sx={{ fontSize: 15, color: ACCENT }} /></IconButton>
        <Tooltip title="Reset to default ETFs">
          <Typography
            onClick={resetDefaults}
            sx={{ fontFamily: MONO, fontSize: 9, letterSpacing: 1, color: '#5b6385', cursor: 'pointer',
              '&:hover': { color: '#e6e9f5' } }}
          >
            RESET
          </Typography>
        </Tooltip>
      </Box>
    </Box>
  );
}

// =========================================================================
// AI widget — pick a service (ChatGPT / Gemini / Claude / Perplexity), type
// a prompt, hit "Ask". The widget copies the prompt to the clipboard AND
// opens the service's web UI in a new tab. The user stays signed in via
// that service's own cookies in our persistent session, so there's no API
// key plumbing — exactly how someone using the service in a regular tab
// would work, but with the prompt already on their clipboard ready to paste.
//
// Where supported, we ALSO append the prompt to the service URL so the
// service can pre-fill the input (Claude + Perplexity respect ?q=).
// =========================================================================

// AI providers and what they can do inline.
//   - apiKind: 'openai' / 'gemini' supports inline answers (CORS-friendly).
//   - apiKind: null  → no inline support, falls back to opening the website.
//   - prefill: query-string param the service honors for pre-filling the
//     prompt when we *do* open the site (Chrome's q= trick).
const AI_PROVIDERS = [
  { id: 'chatgpt',    label: 'ChatGPT',    accent: '#10a37f', baseUrl: 'https://chatgpt.com/',           prefill: 'q', apiKind: 'openai' },
  { id: 'gemini',     label: 'Gemini',     accent: '#4285f4', baseUrl: 'https://gemini.google.com/app',  prefill: null, apiKind: 'gemini' },
  { id: 'claude',     label: 'Claude',     accent: '#d97706', baseUrl: 'https://claude.ai/new',          prefill: 'q', apiKind: null   },
  { id: 'perplexity', label: 'Perplexity', accent: '#20808d', baseUrl: 'https://www.perplexity.ai/search', prefill: 'q', apiKind: null },
];

// Run one chat completion against OpenAI's REST API. Returns the answer text
// or throws. Uses the v1/chat/completions endpoint, which is CORS-enabled.
async function callOpenAI({ apiKey, model, prompt }) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: model || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are a helpful, concise assistant. Answer in plain text, no markdown unless essential.' },
        { role: 'user',   content: prompt },
      ],
      temperature: 0.7,
    }),
  });
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.json())?.error?.message || ''; } catch {}
    throw new Error(`OpenAI ${res.status}${detail ? ` — ${detail}` : ''}`);
  }
  const json = await res.json();
  return json.choices?.[0]?.message?.content?.trim() || '(empty response)';
}

// Run one prompt against Google Gemini's generateContent endpoint.
async function callGemini({ apiKey, model, prompt }) {
  const m = model || 'gemini-1.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.7 },
    }),
  });
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.json())?.error?.message || ''; } catch {}
    throw new Error(`Gemini ${res.status}${detail ? ` — ${detail}` : ''}`);
  }
  const json = await res.json();
  const out = json.candidates?.[0]?.content?.parts?.map((p) => p.text).filter(Boolean).join('\n');
  return out?.trim() || '(empty response)';
}

function AiWidget({ config, onConfig, onOpen }) {
  const [prompt, setPrompt] = useState('');
  const [settings, setSettings] = useState(null);
  const [history, setHistory] = useState([]);          // [{role:'user'|'assistant', text, error?}]
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  // Pull settings once so we know about keys + default AI choice.
  useEffect(() => {
    (async () => {
      if (!sbAPI?.settings) return;
      try { setSettings(await sbAPI.settings.get()); } catch {}
    })();
  }, []);

  const serviceId = config.service || settings?.defaultAI || 'chatgpt';
  const service = AI_PROVIDERS.find((p) => p.id === serviceId) || AI_PROVIDERS[0];
  const apiKey  = service.apiKind ? settings?.aiKeys?.[service.apiKind === 'openai' ? 'openai' : 'gemini'] : '';
  const model   = service.apiKind ? settings?.aiModels?.[service.apiKind === 'openai' ? 'openai' : 'gemini'] : '';
  const canInline = Boolean(service.apiKind && apiKey);

  const openOnSite = async (text) => {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {}
    const url = service.prefill
      ? `${service.baseUrl}?${service.prefill}=${encodeURIComponent(text)}`
      : service.baseUrl;
    onOpen(url);
  };

  const ask = async () => {
    const text = prompt.trim();
    if (!text) {
      if (history.length === 0) onOpen(service.baseUrl);
      return;
    }
    setPrompt('');

    // Inline mode: call the API and append both turns to the chat history.
    if (canInline) {
      setHistory((h) => [...h, { role: 'user', text }]);
      setBusy(true);
      try {
        const fn = service.apiKind === 'openai' ? callOpenAI : callGemini;
        const answer = await fn({ apiKey, model, prompt: text });
        setHistory((h) => [...h, { role: 'assistant', text: answer }]);
      } catch (e) {
        setHistory((h) => [...h, { role: 'assistant', text: '', error: e?.message || String(e) }]);
      } finally {
        setBusy(false);
      }
      return;
    }
    // No-key fallback: open the website with the prompt prefilled where
    // possible, and copy it to the clipboard as a safety net.
    openOnSite(text);
  };

  const openSettings = () => onOpen('smartbrowser://settings');
  const clearChat = () => setHistory([]);

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 0.75, minHeight: 0 }}>
      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
        {AI_PROVIDERS.map((p) => {
          const active = p.id === serviceId;
          return (
            <Box
              key={p.id}
              onClick={() => { onConfig({ service: p.id }); setHistory([]); }}
              sx={{
                px: 1, py: 0.4, borderRadius: 1, cursor: 'pointer',
                fontFamily: MONO, fontSize: 10, letterSpacing: 1, textTransform: 'uppercase',
                color: active ? '#fff' : '#9aa3c7',
                background: active ? `${p.accent}33` : 'transparent',
                border: '1px solid', borderColor: active ? `${p.accent}88` : LINE,
                transition: 'all 140ms ease',
                '&:hover': { borderColor: `${p.accent}88`, color: '#e6e9f5' },
              }}
            >
              {p.label}
            </Box>
          );
        })}
        {history.length > 0 && (
          <Box onClick={clearChat}
            sx={{ ml: 'auto', px: 1, py: 0.4, fontFamily: MONO, fontSize: 10, letterSpacing: 1,
              cursor: 'pointer', color: '#9aa3c7', '&:hover': { color: '#e6e9f5' } }}
          >
            CLEAR
          </Box>
        )}
      </Box>

      {/* Chat transcript — shown when we have inline messages. */}
      {history.length > 0 && (
        <Box sx={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 0.75,
          border: `1px solid ${LINE}`, borderRadius: '4px', p: 1, minHeight: 0 }}>
          {history.map((m, i) => (
            <Box key={i} sx={{ display: 'flex', flexDirection: 'column', alignItems: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
              <Typography sx={{ fontFamily: MONO, fontSize: 9, letterSpacing: 1, color: m.role === 'user' ? '#9aa3c7' : service.accent }}>
                {m.role === 'user' ? 'YOU' : service.label.toUpperCase()}
              </Typography>
              <Box sx={{
                px: 1.25, py: 0.75, mt: 0.25, borderRadius: 1, maxWidth: '92%',
                background: m.role === 'user' ? 'rgba(255,255,255,0.04)' : `${service.accent}15`,
                border: `1px solid ${m.role === 'user' ? LINE : `${service.accent}40`}`,
              }}>
                {m.error ? (
                  <Typography sx={{ fontSize: 12, color: '#ef4444' }}>Error: {m.error}</Typography>
                ) : (
                  <Typography sx={{ fontSize: 12.5, color: '#e6e9f5', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                    {m.text}
                  </Typography>
                )}
              </Box>
            </Box>
          ))}
          {busy && (
            <Typography sx={{ fontFamily: MONO, fontSize: 10, color: '#9aa3c7', alignSelf: 'flex-start' }}>
              {service.label.toUpperCase()} IS THINKING…
            </Typography>
          )}
        </Box>
      )}

      {/* Empty-state hints. We surface the key-missing case prominently because
          it's the #1 reason users think "the widget doesn't work". */}
      {history.length === 0 && service.apiKind && !apiKey && (
        <Box sx={{ p: 1, border: `1px dashed ${service.accent}66`, borderRadius: 1, background: `${service.accent}10` }}>
          <Typography sx={{ fontSize: 11.5, color: '#e6e9f5', mb: 0.5 }}>
            Add your {service.apiKind === 'openai' ? 'OpenAI' : 'Google Gemini'} API key to get inline answers in this widget.
          </Typography>
          <Box onClick={openSettings}
            sx={{ display: 'inline-block', mt: 0.25, fontFamily: MONO, fontSize: 10, letterSpacing: 1,
              color: service.accent, cursor: 'pointer', textTransform: 'uppercase',
              '&:hover': { textDecoration: 'underline' } }}
          >
            → OPEN SETTINGS
          </Box>
          <Typography sx={{ fontSize: 10, color: '#9aa3c7', mt: 0.5 }}>
            Without a key, Send will just open {service.label} with your prompt pre-filled where supported.
          </Typography>
        </Box>
      )}
      {history.length === 0 && !service.apiKind && (
        <Typography sx={{ fontSize: 10.5, color: '#9aa3c7' }}>
          {service.label} doesn't expose a browser-callable API. Send will open
          {' '}{service.label} with your prompt pre-filled where supported.
        </Typography>
      )}

      <InputBase
        multiline
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) ask(); }}
        placeholder={canInline
          ? `ASK ${service.label.toUpperCase()} — ANSWERS APPEAR HERE  (Ctrl+Enter)`
          : `ASK ${service.label.toUpperCase()}…  (Ctrl+Enter to open in tab)`}
        sx={{
          alignItems: 'flex-start', p: 0.75,
          color: '#e6e9f5', fontFamily: MONO, fontSize: 12, lineHeight: 1.4,
          border: `1px solid ${LINE}`, borderRadius: '4px',
          minHeight: 60, maxHeight: 140,
          '& textarea': { resize: 'none' },
          '& textarea::placeholder': { letterSpacing: 1, opacity: 0.5 },
        }}
      />
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Typography sx={{ flex: 1, fontFamily: MONO, fontSize: 9, color: '#5b6385', letterSpacing: 1 }}>
          {copied ? 'COPIED → PASTE IN CHAT' :
           canInline ? `INLINE · ${model || ''}`.trim() :
           `OPENS IN NEW TAB · ${service.prefill ? 'AUTO-FILL' : 'CLIPBOARD'}`}
        </Typography>
        <Box
          onClick={busy ? undefined : ask}
          sx={{
            display: 'inline-flex', alignItems: 'center', gap: 0.5,
            px: 1.25, py: 0.5, borderRadius: 1,
            cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.55 : 1,
            fontFamily: MONO, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase',
            color: '#fff', background: service.accent,
            '&:hover': busy ? {} : { filter: 'brightness(1.1)' },
          }}
        >
          <SendIcon sx={{ fontSize: 13 }} /> {busy ? '…' : (canInline ? 'Ask' : 'Open')}
        </Box>
      </Box>
    </Box>
  );
}

// =========================================================================
// SearchWidget — the omnibar lifted out of HomePage and made placeable. It
// uses the user's chosen default search engine via api.settings.searchUrl,
// with a DDG fallback when the IPC isn't available (web preview mode).
// =========================================================================
function SearchWidget({ onOpen }) {
  const [q, setQ] = useState('');
  const submit = async (e) => {
    e?.preventDefault?.();
    const v = q.trim();
    if (!v) return;
    setQ('');
    const isUrl = /^(https?:\/\/|[\w-]+\.[a-z]{2,})/i.test(v);
    if (isUrl) {
      onOpen(v.startsWith('http') ? v : `https://${v}`);
      return;
    }
    let url = `https://duckduckgo.com/?q=${encodeURIComponent(v)}`;
    try {
      if (sbAPI?.settings?.searchUrl) url = await sbAPI.settings.searchUrl(v);
    } catch {}
    onOpen(url);
  };
  return (
    <Box component="form" onSubmit={submit}
      sx={{
        height: '100%', width: '100%',
        display: 'flex', alignItems: 'center', gap: 1,
        px: 1.5, borderRadius: 999,
        background: 'rgba(255,255,255,0.04)',
        border: `1px solid ${LINE}`,
      }}>
      <SearchIcon sx={{ color: '#9aa3c7', fontSize: 18 }} />
      <InputBase
        fullWidth value={q} onChange={(e) => setQ(e.target.value)}
        placeholder="Search the web privately, or paste a URL"
        sx={{ color: '#e6e9f5', fontSize: 14 }}
      />
      <IconButton type="submit" size="small" sx={{ color: ACCENT }}>
        <BoltIcon fontSize="small" />
      </IconButton>
    </Box>
  );
}

// =========================================================================
// AiShortcutsWidget — the row of ChatGPT/Gemini/Claude/Perplexity chips
// from the old hero, placed as a widget. Clicking a chip opens the
// service's web UI in a new tab (just like the standalone shortcuts).
// =========================================================================
const SHORTCUT_SERVICES = [
  { id: 'chatgpt',    label: 'ChatGPT',    url: 'https://chatgpt.com/',                accent: '#10a37f' },
  { id: 'gemini',     label: 'Gemini',     url: 'https://gemini.google.com/app',       accent: '#4285f4' },
  { id: 'claude',     label: 'Claude',     url: 'https://claude.ai/new',               accent: '#d97706' },
  { id: 'perplexity', label: 'Perplexity', url: 'https://www.perplexity.ai/',          accent: '#20808d' },
];

function AiShortcutsWidget({ onOpen }) {
  return (
    <Box sx={{
      height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
      gap: 1, flexWrap: 'wrap',
    }}>
      {SHORTCUT_SERVICES.map((s) => (
        <Box
          key={s.id}
          onClick={() => onOpen(s.url)}
          sx={{
            display: 'inline-flex', alignItems: 'center', gap: 0.75,
            px: 1.5, py: 0.75, borderRadius: 999, cursor: 'pointer',
            fontFamily: MONO, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase',
            color: '#e6e9f5',
            background: 'rgba(8,9,14,0.6)',
            border: `1px solid ${LINE}`,
            transition: 'all 140ms ease',
            '&:hover': {
              background: `${s.accent}1f`, borderColor: `${s.accent}88`, transform: 'translateY(-1px)',
            },
          }}
        >
          <Box sx={{ width: 8, height: 8, borderRadius: '50%', background: s.accent }} />
          {s.label}
        </Box>
      ))}
    </Box>
  );
}

// =========================================================================
// AppsWidget — Google / Microsoft 365 app launcher with a toggle button
// like Edge's "Microsoft 365" pane. Click any tile to open the app in a
// new tab; toggle the suite in the header to flip the whole tile set.
// The choice is persisted in widget config so each AppsWidget instance
// can be set independently (handy when the user wants two side-by-side).
// =========================================================================
const SUITES = {
  google: {
    label: 'Google',
    accent: '#4285f4',
    apps: [
      { id: 'gmail',    label: 'Gmail',    url: 'https://mail.google.com/',      color: '#ea4335' },
      { id: 'drive',    label: 'Drive',    url: 'https://drive.google.com/',     color: '#fbbc04' },
      { id: 'docs',     label: 'Docs',     url: 'https://docs.google.com/',      color: '#4285f4' },
      { id: 'sheets',   label: 'Sheets',   url: 'https://sheets.google.com/',    color: '#34a853' },
      { id: 'slides',   label: 'Slides',   url: 'https://slides.google.com/',    color: '#fbbc04' },
      { id: 'calendar', label: 'Calendar', url: 'https://calendar.google.com/',  color: '#1a73e8' },
      { id: 'meet',     label: 'Meet',     url: 'https://meet.google.com/',      color: '#00897b' },
      { id: 'maps',     label: 'Maps',     url: 'https://maps.google.com/',      color: '#ea4335' },
      { id: 'youtube',  label: 'YouTube',  url: 'https://youtube.com/',          color: '#ff0000' },
      { id: 'photos',   label: 'Photos',   url: 'https://photos.google.com/',    color: '#34a853' },
      { id: 'keep',     label: 'Keep',     url: 'https://keep.google.com/',      color: '#fbbc04' },
      { id: 'contacts', label: 'Contacts', url: 'https://contacts.google.com/',  color: '#1a73e8' },
    ],
  },
  microsoft: {
    label: 'Microsoft',
    accent: '#0078d4',
    apps: [
      { id: 'outlook',  label: 'Outlook',    url: 'https://outlook.live.com/',                 color: '#0078d4' },
      { id: 'onedrive', label: 'OneDrive',   url: 'https://onedrive.live.com/',                color: '#0078d4' },
      { id: 'word',     label: 'Word',       url: 'https://www.office.com/launch/word',        color: '#185abd' },
      { id: 'excel',    label: 'Excel',      url: 'https://www.office.com/launch/excel',       color: '#107c41' },
      { id: 'pp',       label: 'PowerPoint', url: 'https://www.office.com/launch/powerpoint',  color: '#c43e1c' },
      { id: 'onenote',  label: 'OneNote',    url: 'https://www.office.com/launch/onenote',     color: '#80397b' },
      { id: 'teams',    label: 'Teams',      url: 'https://teams.microsoft.com/',              color: '#5059c9' },
      { id: 'mscal',    label: 'Calendar',   url: 'https://outlook.live.com/calendar/',        color: '#0078d4' },
      { id: 'todo',     label: 'To Do',      url: 'https://to-do.live.com/',                   color: '#3b3a8c' },
      { id: 'forms',    label: 'Forms',      url: 'https://forms.office.com/',                 color: '#107c41' },
      { id: 'bing',     label: 'Bing',       url: 'https://www.bing.com/',                     color: '#008272' },
      { id: 'copilot',  label: 'Copilot',    url: 'https://copilot.microsoft.com/',            color: '#00a4ef' },
    ],
  },
  // Mobile-first apps that have decent web versions. These are the launchers
  // most users actually open on their phone homescreens, mirrored back into
  // the browser so the launcher widget can replace a tab strip of pinned
  // sites.
  mobile: {
    label: 'Mobile',
    accent: '#34d399',
    apps: [
      { id: 'whatsapp',  label: 'WhatsApp',  url: 'https://web.whatsapp.com/',           color: '#25d366' },
      { id: 'instagram', label: 'Instagram', url: 'https://www.instagram.com/',          color: '#e1306c' },
      { id: 'telegram',  label: 'Telegram',  url: 'https://web.telegram.org/',           color: '#229ed9' },
      { id: 'messenger', label: 'Messenger', url: 'https://www.messenger.com/',          color: '#00b2ff' },
      { id: 'x',         label: 'X',         url: 'https://x.com/',                      color: '#000000' },
      { id: 'tiktok',    label: 'TikTok',    url: 'https://www.tiktok.com/',             color: '#ff0050' },
      { id: 'snap',      label: 'Snapchat',  url: 'https://web.snapchat.com/',           color: '#fffc00' },
      { id: 'spotify',   label: 'Spotify',   url: 'https://open.spotify.com/',           color: '#1db954' },
      { id: 'netflix',   label: 'Netflix',   url: 'https://www.netflix.com/',            color: '#e50914' },
      { id: 'discord',   label: 'Discord',   url: 'https://discord.com/app',             color: '#5865f2' },
      { id: 'reddit',    label: 'Reddit',    url: 'https://www.reddit.com/',             color: '#ff4500' },
      { id: 'uber',      label: 'Uber',      url: 'https://m.uber.com/',                 color: '#000000' },
      { id: 'pinterest', label: 'Pinterest', url: 'https://www.pinterest.com/',          color: '#e60023' },
      { id: 'linkedin',  label: 'LinkedIn',  url: 'https://www.linkedin.com/',           color: '#0a66c2' },
      { id: 'maps2',     label: 'Maps',      url: 'https://maps.google.com/',            color: '#ea4335' },
      { id: 'twitch',    label: 'Twitch',    url: 'https://www.twitch.tv/',              color: '#9146ff' },
    ],
  },
};
// "All" is a synthesized suite — when the user picks it we render every
// Google + Microsoft tile in a single combined grid (no Mobile, since the
// user asked specifically for a "both" mode that shows productivity apps
// from both Google and Microsoft simultaneously).
SUITES.all = {
  label: 'All',
  accent: '#a78bfa',
  apps: [
    ...SUITES.google.apps.map((a) => ({ ...a, _suite: 'google' })),
    ...SUITES.microsoft.apps.map((a) => ({ ...a, _suite: 'microsoft' })),
  ],
};
const SUITE_ORDER = ['google', 'microsoft', 'all', 'mobile'];

// AppsWidget — collapsed to a single "apps" tile by default (so it lives
// happily in a 1×1 grid cell). Clicking the tile opens a popover with the
// full launcher: a suite cycle button (Google ↔ Microsoft ↔ Mobile) on top,
// app tiles below. The popover holds focus so the widget itself stays
// minimal even when the user is browsing apps.
function AppsWidget({ config, onConfig, onOpen }) {
  const suiteKey = SUITE_ORDER.includes(config.suite) ? config.suite : 'google';
  const suite = SUITES[suiteKey];
  const [anchorEl, setAnchorEl] = useState(null);
  const open = Boolean(anchorEl);
  const close = () => setAnchorEl(null);
  const launch = (url) => { close(); onOpen(url); };
  // Suite-picker dropdown lives inside the popover. Open it with the
  // chevron toggle so the user can jump straight to any suite instead of
  // cycling through them one at a time — was a cycle-only chip before.
  const [suiteMenuAnchor, setSuiteMenuAnchor] = useState(null);
  const suiteMenuOpen = Boolean(suiteMenuAnchor);
  const openSuiteMenu  = (e) => setSuiteMenuAnchor(e.currentTarget);
  const closeSuiteMenu = () => setSuiteMenuAnchor(null);
  const pickSuite = (id) => { onConfig({ suite: id }); closeSuiteMenu(); };

  return (
    <Box sx={{
      height: '100%', width: '100%',
      display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 0,
    }}>
      {/* Collapsed icon — also acts as the popover anchor. The 3x3 dot grid
          is the universally understood "apps" glyph (Google waffle / iOS
          launcher). */}
      <Box
        onClick={(e) => setAnchorEl(e.currentTarget)}
        sx={{
          width: '100%', height: '100%', minHeight: 0,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: 0.5, cursor: 'pointer', borderRadius: 1.25,
          background: 'rgba(255,255,255,0.03)',
          border: `1px solid ${open ? suite.accent : LINE}`,
          transition: 'all 140ms ease',
          '&:hover': { borderColor: `${suite.accent}66`, background: `${suite.accent}10` },
        }}
        title={`${suite.label} apps`}
      >
        <Box sx={{
          display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 0.4,
          width: 22, height: 22,
        }}>
          {Array.from({ length: 9 }).map((_, i) => (
            <Box key={i} sx={{ width: '100%', height: '100%', borderRadius: '50%',
              background: suite.accent, opacity: 0.85 }} />
          ))}
        </Box>
        <Typography sx={{ fontFamily: MONO, fontSize: 9, letterSpacing: 1, color: '#9aa3c7',
          textTransform: 'uppercase', maxWidth: '100%',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {suite.label}
        </Typography>
      </Box>

      <Popover
        open={open} anchorEl={anchorEl} onClose={close}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        // Stop the popover paper from inheriting the widget's drag handle so
        // clicking inside doesn't start a drag through the grid item.
        PaperProps={{
          onMouseDown: (e) => e.stopPropagation(),
          sx: {
            // The combined "All" suite (Google + Microsoft) holds ~24 tiles,
            // so we let the popover grow a bit when needed instead of
            // capping at 360 px and squeezing icons.
            mt: 0.5, p: 1.25, minWidth: 280, maxWidth: 480,
            maxHeight: '70vh', overflow: 'auto',
            background: 'rgba(8,9,14,0.96)',
            border: `1px solid ${suite.accent}55`,
            borderRadius: 1.5,
            backdropFilter: 'blur(8px)',
            backgroundImage: 'radial-gradient(rgba(255,255,255,0.05) 1px, transparent 1px)',
            backgroundSize: '14px 14px',
          },
        }}
      >
        {/* Suite picker row. The right-hand pill shows the CURRENT suite
            with a chevron toggle — clicking opens a small menu of all
            available suites so the user can jump directly to one instead
            of cycling through them. The chevron flips to "up" when the
            menu is open as a hint that another click closes it. */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, mb: 1 }}>
          <Typography sx={{ fontFamily: MONO, fontSize: 10, letterSpacing: 2, color: '#9aa3c7',
            textTransform: 'uppercase' }}>
            {suite.label} Apps
          </Typography>
          <Box
            onClick={suiteMenuOpen ? closeSuiteMenu : openSuiteMenu}
            sx={{
              display: 'inline-flex', alignItems: 'center', gap: 0.25, cursor: 'pointer',
              pl: 1, pr: 0.5, py: 0.4, borderRadius: 999,
              fontFamily: MONO, fontSize: 10, letterSpacing: 1, textTransform: 'uppercase',
              color: '#e6e9f5',
              background: suiteMenuOpen ? `${suite.accent}22` : 'rgba(255,255,255,0.05)',
              border: `1px solid ${suite.accent}88`,
              transition: 'background 140ms ease',
              '&:hover': { background: `${suite.accent}22` },
              userSelect: 'none',
            }}
            title="Switch app suite"
          >
            <span>{suite.label}</span>
            {suiteMenuOpen
              ? <KeyboardArrowUpIcon   sx={{ fontSize: 16, color: suite.accent }} />
              : <KeyboardArrowDownIcon sx={{ fontSize: 16, color: suite.accent }} />}
          </Box>
          <Menu
            anchorEl={suiteMenuAnchor} open={suiteMenuOpen} onClose={closeSuiteMenu}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            transformOrigin={{ vertical: 'top', horizontal: 'right' }}
            // The menu lives inside an already-open Popover. Stop mouseDown
            // bubbling so the parent Popover doesn't treat clicks on menu
            // items as "clicked outside" and close itself.
            slotProps={{ paper: { onMouseDown: (e) => e.stopPropagation(),
              sx: { mt: 0.5, minWidth: 160, background: 'rgba(8,9,14,0.96)',
                border: `1px solid ${suite.accent}55`, borderRadius: 1.5,
                backdropFilter: 'blur(8px)' } } }}
          >
            {SUITE_ORDER.map((id) => {
              const s = SUITES[id];
              const active = id === suiteKey;
              return (
                <MenuItem
                  key={id} dense onClick={() => pickSuite(id)} selected={active}
                  sx={{
                    fontFamily: MONO, fontSize: 11, letterSpacing: 1,
                    textTransform: 'uppercase', color: active ? s.accent : '#e6e9f5',
                    gap: 1,
                    '&.Mui-selected':       { background: `${s.accent}1a` },
                    '&.Mui-selected:hover': { background: `${s.accent}26` },
                  }}
                >
                  {/* Color dot so each suite is visually distinct in the list. */}
                  <Box sx={{ width: 8, height: 8, borderRadius: '50%',
                    background: s.accent, flexShrink: 0 }} />
                  {s.label}
                  <Box sx={{ flex: 1 }} />
                  <Typography sx={{ fontFamily: MONO, fontSize: 9, color: '#7a82a8' }}>
                    {s.apps.length}
                  </Typography>
                </MenuItem>
              );
            })}
          </Menu>
        </Box>

        {/* Tile grid — auto-fits with comfortable touch targets. */}
        <Box sx={{
          display: 'grid', gap: 0.75,
          gridTemplateColumns: 'repeat(4, 1fr)',
        }}>
          {suite.apps.map((app) => (
            <Box
              key={app.id}
              onClick={() => launch(app.url)}
              title={app.label}
              sx={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                gap: 0.5, py: 1, px: 0.5, borderRadius: 1, cursor: 'pointer',
                background: 'rgba(255,255,255,0.03)',
                border: `1px solid ${LINE}`,
                transition: 'all 140ms ease',
                '&:hover': { background: `${app.color}1a`, borderColor: `${app.color}66`, transform: 'translateY(-1px)' },
              }}
            >
              <Box sx={{
                width: 30, height: 30, borderRadius: 0.75,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: app.color, color: '#fff',
                fontFamily: MONO, fontWeight: 700, fontSize: 13,
              }}>
                {app.label.slice(0, 1).toUpperCase()}
              </Box>
              <Typography sx={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: 0.5, color: '#cdd3ee',
                textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                maxWidth: '100%' }}>
                {app.label}
              </Typography>
            </Box>
          ))}
        </Box>
      </Popover>
    </Box>
  );
}
