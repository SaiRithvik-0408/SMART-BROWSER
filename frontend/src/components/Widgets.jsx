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

// Bumped to v3 because the layout shape changed (no more `size`; we now store
// `layout` separately). Old v2 entries are auto-migrated on first load.
const STORAGE_KEY        = 'smartbrowser.widgets.v3';
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
const CATALOG = [
  { type: 'clock',     label: 'Clock',       icon: <AccessTimeIcon fontSize="small" />,    defaultSize: { w: 4, h: 2 }, minSize: { w: 2, h: 2 } },
  { type: 'calendar',  label: 'Calendar',    icon: <CalendarMonthIcon fontSize="small" />, defaultSize: { w: 4, h: 4 }, minSize: { w: 3, h: 3 } },
  { type: 'notes',     label: 'Notes',       icon: <StickyNote2Icon fontSize="small" />,   defaultSize: { w: 4, h: 3 }, minSize: { w: 2, h: 2 } },
  { type: 'links',     label: 'Quick Links', icon: <LinkIcon fontSize="small" />,          defaultSize: { w: 4, h: 4 }, minSize: { w: 2, h: 2 } },
  { type: 'worldclock',label: 'World Clock', icon: <PublicIcon fontSize="small" />,        defaultSize: { w: 4, h: 4 }, minSize: { w: 3, h: 2 } },
  { type: 'stocks',    label: 'Stocks',      icon: <TrendingUpIcon fontSize="small" />,    defaultSize: { w: 6, h: 4 }, minSize: { w: 3, h: 3 } },
  { type: 'ai',        label: 'Ask AI',      icon: <AutoAwesomeIcon fontSize="small" />,   defaultSize: { w: 6, h: 4 }, minSize: { w: 3, h: 3 } },
  { type: 'news',      label: 'News',        icon: <NewspaperIcon fontSize="small" />,     defaultSize: { w: 12, h: 6 }, minSize: { w: 4, h: 4 } },
];
const catalogFor = (type) => CATALOG.find((c) => c.type === type) || CATALOG[0];

// Default starting dashboard. Each entry has an `id`, `type`, `config`, and a
// `layout` rect { x, y, w, h } in grid cells. The 12-column grid lets us put
// 3 small widgets across (4 cells each) or 2 medium (6 cells each).
const DEFAULTS = [
  { id: 'w-clock',    type: 'clock',    config: {},                        layout: { x: 0, y: 0, w: 4, h: 2 } },
  { id: 'w-ai',       type: 'ai',       config: { service: 'chatgpt' },    layout: { x: 4, y: 0, w: 4, h: 4 } },
  { id: 'w-stocks',   type: 'stocks',   config: {},                        layout: { x: 8, y: 0, w: 4, h: 4 } },
  { id: 'w-calendar', type: 'calendar', config: {},                        layout: { x: 0, y: 2, w: 4, h: 4 } },
  { id: 'w-notes',    type: 'notes',    config: { text: '' },              layout: { x: 4, y: 4, w: 4, h: 2 } },
  { id: 'w-news',     type: 'news',     config: { section: 'top' },        layout: { x: 0, y: 6, w: 12, h: 6 } },
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
  // 1. New v3 store
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length) return parsed;
    }
  } catch {}
  // 2. Migrate from legacy v2 (had `size: 's' | 'm' | 'l' | 'xl'` instead of layout)
  try {
    const raw = localStorage.getItem(LEGACY_KEY_V2);
    if (raw) {
      const SIZE_TO_LAYOUT = {
        s:  { w: 3,  h: 2 },
        m:  { w: 4,  h: 2 },
        l:  { w: 6,  h: 4 },
        xl: { w: 8,  h: 4 },
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
const ROW_HEIGHT   = 80;       // px per grid row
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
            — drag header to move, drag corner to resize
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
          background: 'rgba(122,162,255,0.15) !important',
          border: '1px dashed rgba(122,162,255,0.5)',
          borderRadius: '4px', opacity: '1 !important',
        },
        '& .react-grid-item > .react-resizable-handle': {
          width: 16, height: 16, opacity: 0.4,
          backgroundImage: 'none',
          borderRight: '2px solid rgba(255,255,255,0.5)',
          borderBottom: '2px solid rgba(255,255,255,0.5)',
          borderBottomRightRadius: 2,
        },
        '& .react-grid-item:hover > .react-resizable-handle': { opacity: 1 },
        '& .react-draggable-dragging': { cursor: 'grabbing !important', zIndex: 10 },
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

function NotesWidget({ config, onConfig }) {
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

const AI_PROVIDERS = [
  { id: 'chatgpt',    label: 'ChatGPT',    accent: '#10a37f', baseUrl: 'https://chatgpt.com/',           prefill: null },
  { id: 'gemini',     label: 'Gemini',     accent: '#4285f4', baseUrl: 'https://gemini.google.com/app',  prefill: null },
  { id: 'claude',     label: 'Claude',     accent: '#d97706', baseUrl: 'https://claude.ai/new',          prefill: 'q' },
  { id: 'perplexity', label: 'Perplexity', accent: '#20808d', baseUrl: 'https://www.perplexity.ai/search', prefill: 'q' },
];

function AiWidget({ config, onConfig, onOpen }) {
  const [prompt, setPrompt] = useState('');
  const [copied, setCopied] = useState(false);

  // Use the user's default AI from settings if the widget hasn't been
  // configured yet; fall back to ChatGPT.
  const [defaultFromSettings, setDefaultFromSettings] = useState(null);
  useEffect(() => {
    (async () => {
      if (!sbAPI?.settings) return;
      try {
        const s = await sbAPI.settings.get();
        if (s && s.defaultAI) setDefaultFromSettings(s.defaultAI);
      } catch {}
    })();
  }, []);

  const serviceId = config.service || defaultFromSettings || 'chatgpt';
  const service = AI_PROVIDERS.find((p) => p.id === serviceId) || AI_PROVIDERS[0];

  const ask = async () => {
    const text = prompt.trim();
    if (!text) {
      onOpen(service.baseUrl);
      return;
    }
    // Always copy to clipboard so the user can paste immediately on landing.
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }
    catch {}
    // Append ?q= where the service is known to honor it.
    const url = service.prefill
      ? `${service.baseUrl}?${service.prefill}=${encodeURIComponent(text)}`
      : service.baseUrl;
    onOpen(url);
    setPrompt('');
  };

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 0.75 }}>
      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
        {AI_PROVIDERS.map((p) => {
          const active = p.id === serviceId;
          return (
            <Box
              key={p.id}
              onClick={() => onConfig({ service: p.id })}
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
      </Box>
      <InputBase
        multiline
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) ask(); }}
        placeholder={`ASK ${service.label.toUpperCase()}…  (Ctrl+Enter to send)`}
        sx={{
          flex: 1, alignItems: 'flex-start', p: 0.5,
          color: '#e6e9f5', fontFamily: MONO, fontSize: 12, lineHeight: 1.4,
          border: `1px solid ${LINE}`, borderRadius: '4px',
          '& textarea': { height: '100% !important' },
          '& textarea::placeholder': { letterSpacing: 1, opacity: 0.5 },
        }}
      />
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Typography sx={{ flex: 1, fontFamily: MONO, fontSize: 9, color: '#5b6385', letterSpacing: 1 }}>
          {copied ? 'COPIED → PASTE IN CHAT' : `OPENS IN NEW TAB · ${service.prefill ? 'AUTO-FILL' : 'CLIPBOARD'}`}
        </Typography>
        <Box
          onClick={ask}
          sx={{
            display: 'inline-flex', alignItems: 'center', gap: 0.5,
            px: 1.25, py: 0.5, borderRadius: 1, cursor: 'pointer',
            fontFamily: MONO, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase',
            color: '#fff', background: service.accent,
            '&:hover': { filter: 'brightness(1.1)' },
          }}
        >
          <SendIcon sx={{ fontSize: 13 }} /> Ask
        </Box>
      </Box>
    </Box>
  );
}
