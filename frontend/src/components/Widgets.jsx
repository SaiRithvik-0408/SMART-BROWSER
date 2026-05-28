import React, { useEffect, useState } from 'react';
import {
  Box, Typography, IconButton, Menu, MenuItem, Button,
  InputBase, Select, TextField, Tooltip,
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
import { motion } from 'framer-motion';
import { proxyUrlFor } from '../api/client';
import GridLayout from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import NewsFeed from './NewsFeed';

const sbAPI = typeof window !== 'undefined' ? window.smartBrowserAPI : null;

// v4 halves the rowHeight (40 px instead of 80) so resize feels smooth — all
// stored `h` values from v3 are doubled on first load so widgets keep the
// same on-screen size.
const STORAGE_KEY        = 'smartbrowser.widgets.v4';
const LEGACY_KEY_V3      = 'smartbrowser.widgets.v3';
const LEGACY_KEY_V2      = 'smartbrowser.widgets.v2';
const LAYOUT_STORAGE_KEY = 'smartbrowser.widgets.layout.v1';

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
const CATALOG = [
  { type: 'clock',     label: 'Clock',       icon: <AccessTimeIcon fontSize="small" />,    defaultSize: { w: 4, h: 4  }, minSize: { w: 2, h: 4 } },
  { type: 'calendar',  label: 'Calendar',    icon: <CalendarMonthIcon fontSize="small" />, defaultSize: { w: 4, h: 8  }, minSize: { w: 3, h: 6 } },
  { type: 'notes',     label: 'Notes',       icon: <StickyNote2Icon fontSize="small" />,   defaultSize: { w: 4, h: 6  }, minSize: { w: 2, h: 4 } },
  { type: 'links',     label: 'Quick Links', icon: <LinkIcon fontSize="small" />,          defaultSize: { w: 4, h: 8  }, minSize: { w: 2, h: 4 } },
  { type: 'worldclock',label: 'World Clock', icon: <PublicIcon fontSize="small" />,        defaultSize: { w: 4, h: 8  }, minSize: { w: 3, h: 4 } },
  { type: 'stocks',    label: 'Stocks',      icon: <TrendingUpIcon fontSize="small" />,    defaultSize: { w: 6, h: 8  }, minSize: { w: 3, h: 6 } },
  { type: 'ai',        label: 'Ask AI',      icon: <AutoAwesomeIcon fontSize="small" />,   defaultSize: { w: 6, h: 8  }, minSize: { w: 3, h: 6 } },
  { type: 'news',      label: 'News',        icon: <NewspaperIcon fontSize="small" />,     defaultSize: { w: 12, h: 12 }, minSize: { w: 4, h: 8 } },
];
const catalogFor = (type) => CATALOG.find((c) => c.type === type) || CATALOG[0];

// Default starting dashboard. Each entry has an `id`, `type`, `config`, and a
// `layout` rect { x, y, w, h } in grid cells. The 12-column grid lets us put
// 3 small widgets across (4 cells each) or 2 medium (6 cells each).
const DEFAULTS = [
  { id: 'w-clock',    type: 'clock',    config: {},                        layout: { x: 0, y: 0,  w: 4,  h: 4  } },
  { id: 'w-ai',       type: 'ai',       config: { service: 'chatgpt' },    layout: { x: 4, y: 0,  w: 4,  h: 8  } },
  { id: 'w-stocks',   type: 'stocks',   config: {},                        layout: { x: 8, y: 0,  w: 4,  h: 8  } },
  { id: 'w-calendar', type: 'calendar', config: {},                        layout: { x: 0, y: 4,  w: 4,  h: 8  } },
  { id: 'w-notes',    type: 'notes',    config: {},                        layout: { x: 4, y: 8,  w: 4,  h: 4  } },
  { id: 'w-news',     type: 'news',     config: { section: 'top' },        layout: { x: 0, y: 12, w: 12, h: 12 } },
];

// Convert the user's saved widgets to the shape react-grid-layout wants.
function toLayoutArray(widgets) {
  return widgets.map((w) => {
    const meta = catalogFor(w.type);
    const l = w.layout || { x: 0, y: Infinity, ...meta.defaultSize };
    return {
      i: w.id,
      x: l.x, y: l.y, w: l.w, h: l.h,
      minW: meta.minSize.w, minH: meta.minSize.h,
    };
  });
}

function loadWidgets() {
  // 1. New v4 store
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length) return parsed;
    }
  } catch {}
  // 2. Migrate from v3 (same shape, but rowHeight was 80 px — double all `h`
  //    and `y` values so the layout looks identical with the new 40 px row).
  try {
    const raw = localStorage.getItem(LEGACY_KEY_V3);
    if (raw) {
      const v3 = JSON.parse(raw) || [];
      const migrated = v3.map((w) => ({
        ...w,
        layout: w.layout ? {
          x: w.layout.x,
          y: (w.layout.y || 0) * 2,
          w: w.layout.w,
          h: (w.layout.h || 1) * 2,
        } : undefined,
      }));
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
      return migrated;
    }
  } catch {}
  return DEFAULTS;
}

// Grid config — keep in sync with the CSS overrides below.
const GRID_COLS    = 12;
const ROW_HEIGHT   = 40;       // px per grid row — smaller = smoother resize
const GRID_MARGIN  = 12;       // px between widgets (and around outer edges)

export default function Widgets({ onOpen }) {
  const [widgets, setWidgets] = useState(loadWidgets);
  const [addAnchor, setAddAnchor] = useState(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const containerRef = React.useRef(null);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(widgets)); } catch {}
  }, [widgets]);

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
    setWidgets((prev) => [
      ...prev,
      {
        id: `w-${type}-${Date.now()}`,
        type, config: type === 'news' ? { section: 'top' } : {},
        layout: { x: 0, y: nextDropY(prev), w: meta.defaultSize.w, h: meta.defaultSize.h },
      },
    ]);
    setAddAnchor(null);
  };
  const removeWidget = (id) => setWidgets((prev) => prev.filter((w) => w.id !== id));
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

  return (
    <Box sx={{ width: 'min(1280px, 96vw)', mt: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5, px: 0.5 }}>
        <Typography sx={{ fontFamily: MONO, fontSize: 12, letterSpacing: 3, textTransform: 'uppercase',
          color: '#9aa3c7', display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box component="span" sx={{ width: 7, height: 7, borderRadius: '50%', background: ACCENT }} />
          Dashboard
          <Typography component="span" sx={{ ml: 1.5, fontSize: 10, color: '#5b6385', letterSpacing: 1 }}>
            — grab the dotted handle to move, drag the red corner or side pills to resize
          </Typography>
        </Typography>
        <Button
          size="small" startIcon={<AddIcon />}
          onClick={(e) => setAddAnchor(e.currentTarget)}
          sx={{ fontFamily: MONO, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: '#e6e9f5' }}
        >
          Add widget
        </Button>
        <Menu anchorEl={addAnchor} open={!!addAnchor} onClose={() => setAddAnchor(null)}>
          {CATALOG.map((c) => (
            <MenuItem key={c.type} onClick={() => addWidget(c.type)}
              sx={{ gap: 1.2, fontFamily: MONO, fontSize: 13 }}>
              {c.icon}{c.label}
            </MenuItem>
          ))}
        </Menu>
      </Box>

      {/* Local CSS overrides for react-grid-layout to match our dark theme.
          The placeholder is the ghost block shown while dragging/resizing. */}
      <Box ref={containerRef} sx={{
        '& .react-grid-item.react-grid-placeholder': {
          background: 'rgba(214,69,61,0.18) !important',
          border: `1px dashed ${ACCENT}`,
          borderRadius: '4px', opacity: '1 !important',
        },
        '& .react-grid-item > .react-resizable-handle': {
          backgroundImage: 'none',                    // wipe react-resizable's PNG
          opacity: 0.45,
          transition: 'opacity 120ms ease, background 120ms ease',
        },
        '& .react-grid-item:hover > .react-resizable-handle': { opacity: 1 },
        // South-east corner: a chunky red triangle so the user can't miss it.
        '& .react-grid-item > .react-resizable-handle.react-resizable-handle-se': {
          width: 22, height: 22, right: 2, bottom: 2,
          borderRight:  `3px solid ${ACCENT}`,
          borderBottom: `3px solid ${ACCENT}`,
          borderBottomRightRadius: 4,
        },
        // East edge: vertical pill in the middle of the right border.
        '& .react-grid-item > .react-resizable-handle.react-resizable-handle-e': {
          width: 6, height: 36, right: 0, top: '50%', transform: 'translateY(-50%)',
          background: 'rgba(255,255,255,0.18)', borderRadius: 3,
          cursor: 'ew-resize',
        },
        // South edge: horizontal pill in the middle of the bottom border.
        '& .react-grid-item > .react-resizable-handle.react-resizable-handle-s': {
          width: 36, height: 6, left: '50%', bottom: 0, transform: 'translateX(-50%)',
          background: 'rgba(255,255,255,0.18)', borderRadius: 3,
          cursor: 'ns-resize',
        },
        '& .react-grid-item:hover > .react-resizable-handle.react-resizable-handle-e, & .react-grid-item:hover > .react-resizable-handle.react-resizable-handle-s': {
          background: ACCENT,
        },
        '& .react-draggable-dragging': { cursor: 'grabbing !important', zIndex: 10 },
        '& .react-grid-item.resizing':  { zIndex: 10, opacity: 0.95 },
      }}>
        {containerWidth > 0 && (
          <GridLayout
            className="sb-grid"
            layout={layout}
            cols={GRID_COLS}
            rowHeight={ROW_HEIGHT}
            width={containerWidth}
            margin={[GRID_MARGIN, GRID_MARGIN]}
            containerPadding={[0, 0]}
            draggableHandle=".sb-drag-handle"
            compactType="vertical"
            preventCollision={false}
            isBounded={false}
            resizeHandles={['se', 'e', 's']}
            onLayoutChange={onLayoutChange}
          >
            {widgets.map((w) => (
              <div key={w.id}>
                <WidgetFrame
                  widget={w}
                  onRemove={() => removeWidget(w.id)}
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

function WidgetFrame({ widget, onRemove, onConfig, onOpen }) {
  const meta = catalogFor(widget.type);
  return (
    <Box sx={{
      height: '100%', width: '100%', display: 'flex', flexDirection: 'column',
      p: 1.25, borderRadius: '4px',
      background: SURFACE,
      border: `1px solid ${LINE}`,
      backgroundImage: 'radial-gradient(rgba(255,255,255,0.05) 1px, transparent 1px)',
      backgroundSize: '14px 14px',
      transition: 'border-color 140ms ease',
      '&:hover': { borderColor: 'rgba(255,255,255,0.22)' },
      '&:hover .wgt-controls': { opacity: 1 },
    }}>
      {/* Header is the drag handle — only this strip starts a drag, so
          inputs and buttons inside the widget body stay fully interactive. */}
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
      </Box>
      <Box sx={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
        {widget.type === 'clock' && <ClockWidget layout={widget.layout} />}
        {widget.type === 'calendar' && <CalendarWidget />}
        {widget.type === 'notes' && <NotesWidget config={widget.config} onConfig={onConfig} />}
        {widget.type === 'links' && <LinksWidget config={widget.config} onConfig={onConfig} onOpen={onOpen} />}
        {widget.type === 'worldclock' && <WorldClockWidget config={widget.config} onConfig={onConfig} />}
        {widget.type === 'stocks' && <StockWidget config={widget.config} onConfig={onConfig} layout={widget.layout} />}
        {widget.type === 'ai' && <AiWidget config={widget.config} onConfig={onConfig} onOpen={onOpen} />}
        {widget.type === 'news' && <NewsFeed onOpen={onOpen} compact />}
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

// NotesWidget shows ONE note from the shared notes store (the same data the
// Notes panel manages). The widget config stores `noteId`; if none is set, we
// fall back to the most recently updated note. Editing here writes through
// the IPC API, so changes show up in the panel and vice versa.
//
// Image strategy:
//   • Paste an image from the clipboard → it's added to the note's images
//     array as a data: URI and rendered as a thumbnail strip below the text.
//   • The "Open in Notes" button pops the full panel jumped to this note for
//     image management, larger editing surface, etc.
function NotesWidget({ config, onConfig }) {
  const [notes, setNotes] = useState([]);
  const [text, setText] = useState('');
  const [savedTick, setSavedTick] = useState(0);
  const saveTimerRef = React.useRef(null);
  const inflightIdRef = React.useRef(null);

  // Pick which note the widget edits. Falls back to most recent.
  const noteId = config.noteId || notes[0]?.id || null;
  const note   = notes.find((n) => n.id === noteId) || null;

  const reload = async () => {
    if (!sbAPI?.notes) return null;
    const list = await sbAPI.notes.list();
    setNotes(list);
    return list;
  };

  useEffect(() => { reload(); }, []);

  // Whenever the chosen note changes (different id, or someone else edited
  // it via the panel), pull its text back into the local input.
  useEffect(() => {
    if (note && inflightIdRef.current !== note.id) {
      setText(note.content || '');
    }
  }, [note?.id, note?.updatedAt]);

  // Debounced write-through to the shared store.
  const queueSave = (next) => {
    if (!noteId) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    inflightIdRef.current = noteId;
    saveTimerRef.current = setTimeout(async () => {
      await sbAPI.notes.update(noteId, { content: next });
      inflightIdRef.current = null;
      setSavedTick((t) => t + 1);
      reload();
    }, 600);
  };

  const createAndUse = async () => {
    const created = await sbAPI.notes.create({ title: 'Quick note', content: '' });
    await reload();
    onConfig({ noteId: created.id });
  };

  const handlePaste = async (e) => {
    if (!sbAPI?.notes || !noteId) return;
    const items = Array.from(e.clipboardData?.items || []);
    const imgs  = items.filter((it) => it.type && it.type.startsWith('image/'));
    if (!imgs.length) return;
    e.preventDefault();
    const dataUrls = await Promise.all(imgs.map((it) => new Promise((resolve) => {
      const f = it.getAsFile();
      if (!f) return resolve(null);
      const fr = new FileReader();
      fr.onload = () => resolve({ id: `img-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, src: String(fr.result || ''), alt: f.name || 'image' });
      fr.readAsDataURL(f);
    })));
    const newImgs = dataUrls.filter(Boolean);
    if (!newImgs.length) return;
    const next = [...(note?.images || []), ...newImgs];
    await sbAPI.notes.update(noteId, { images: next });
    reload();
  };

  const openInPanel = () => {
    window.dispatchEvent(new CustomEvent('sb:open-notes', { detail: { noteId } }));
  };

  if (!sbAPI?.notes) {
    // Browser dev mode (no Electron) — fall back to local-only buffer so the
    // widget still works in the dev server.
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
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <Typography sx={{ fontFamily: MONO, fontSize: 10, letterSpacing: 1, color: '#9aa3c7', flex: 1,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {note ? (note.title || 'UNTITLED').toUpperCase() : 'NO NOTE'}
        </Typography>
        {notes.length > 0 && (
          <Select
            value={noteId || ''}
            variant="standard" disableUnderline
            onChange={(e) => onConfig({ noteId: e.target.value })}
            sx={{ fontSize: 10, color: ACCENT, fontFamily: MONO, '& .MuiSelect-icon': { color: ACCENT } }}
          >
            {notes.map((n) => (
              <MenuItem key={n.id} value={n.id} sx={{ fontSize: 12 }}>
                {n.title || 'Untitled'}
              </MenuItem>
            ))}
          </Select>
        )}
        <Tooltip title="Open in Notes panel">
          <IconButton size="small" onClick={openInPanel} sx={{ p: 0.25, color: '#9aa3c7' }}>
            <ChevronRightIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>
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
        <>
          <InputBase
            multiline
            value={text}
            onChange={(e) => { setText(e.target.value); queueSave(e.target.value); }}
            onPaste={handlePaste}
            placeholder="JOT SOMETHING DOWN — PASTE IMAGES TOO…"
            sx={{
              flex: 1, alignItems: 'flex-start',
              color: '#e6e9f5', fontFamily: MONO, fontSize: 12, lineHeight: 1.5,
              '& textarea': { height: '100% !important' },
              '& textarea::placeholder': { letterSpacing: 1, opacity: 0.5 },
            }}
          />
          {(note.images || []).length > 0 && (
            <Box sx={{ display: 'flex', gap: 0.5, overflowX: 'auto', pt: 0.5,
              borderTop: `1px dashed ${LINE}` }}>
              {note.images.slice(0, 6).map((img) => (
                <Box key={img.id} component="img" src={img.src} alt={img.alt}
                  onClick={openInPanel}
                  sx={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 0.5,
                    cursor: 'pointer', flexShrink: 0, opacity: 0.85,
                    '&:hover': { opacity: 1 } }}
                />
              ))}
              {note.images.length > 6 && (
                <Box onClick={openInPanel}
                  sx={{ width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'rgba(255,255,255,0.04)', color: '#9aa3c7',
                    fontFamily: MONO, fontSize: 11, borderRadius: 0.5, cursor: 'pointer' }}
                >
                  +{note.images.length - 6}
                </Box>
              )}
            </Box>
          )}
        </>
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

async function fetchQuote(symbol) {
  // Yahoo Finance v8 chart API — key-less, returns last price + previous close.
  // Routed through the local backend `/api/proxy` to bypass CORS.
  const upstream = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`;
  const res = await fetch(proxyUrlFor(upstream), { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const meta = data?.chart?.result?.[0]?.meta;
  if (!meta) throw new Error('no data');
  const price = Number(meta.regularMarketPrice);
  const prev  = Number(meta.chartPreviousClose ?? meta.previousClose);
  const change = price - prev;
  const pct = prev ? (change / prev) * 100 : 0;
  return { symbol: meta.symbol || symbol.toUpperCase(), price, change, pct, currency: meta.currency || 'USD' };
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

  const compact = (layout?.w || 4) < 6;

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
          return (
            <Box key={q.symbol} sx={{
              display: 'grid', alignItems: 'center', gap: 1,
              gridTemplateColumns: compact ? '1fr auto auto auto' : '64px 1fr auto auto auto',
              py: 0.4, borderBottom: `1px solid ${LINE}`,
              '&:hover .stk-x': { opacity: 1 },
            }}>
              <Typography sx={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: '#e6e9f5' }}>
                {q.symbol}
              </Typography>
              {!compact && (
                <Box />
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
