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
import { motion } from 'framer-motion';
import { proxyUrlFor } from '../api/client';

const STORAGE_KEY = 'smartbrowser.widgets.v2';

// Nothing-UI-inspired tokens: monospace, uppercase, flat black surfaces,
// a single red accent, dotted grid texture.
const MONO = "'JetBrains Mono', 'SFMono-Regular', ui-monospace, Menlo, monospace";
const ACCENT = '#d6453d';            // Nothing red
const SURFACE = 'rgba(8,9,14,0.72)';
const LINE = 'rgba(255,255,255,0.10)';

const CATALOG = [
  { type: 'clock',     label: 'Clock',       icon: <AccessTimeIcon fontSize="small" /> },
  { type: 'calendar',  label: 'Calendar',    icon: <CalendarMonthIcon fontSize="small" /> },
  { type: 'notes',     label: 'Notes',       icon: <StickyNote2Icon fontSize="small" /> },
  { type: 'links',     label: 'Quick Links', icon: <LinkIcon fontSize="small" /> },
  { type: 'worldclock',label: 'World Clock', icon: <PublicIcon fontSize="small" /> },
  { type: 'stocks',    label: 'Stocks',      icon: <TrendingUpIcon fontSize="small" /> },
];

// Resize presets — cycled by the resize button. col/row are grid spans.
const SIZES = ['s', 'm', 'l', 'xl'];
const SIZE_SPAN = {
  s:  { col: 1, row: 1 },
  m:  { col: 2, row: 1 },
  l:  { col: 2, row: 2 },
  xl: { col: 3, row: 2 },
};
const nextSize = (s) => SIZES[(SIZES.indexOf(s) + 1) % SIZES.length];

const DEFAULTS = [
  { id: 'w-clock',    type: 'clock',    size: 'm', config: {} },
  { id: 'w-stocks',   type: 'stocks',   size: 'l', config: {} },
  { id: 'w-calendar', type: 'calendar', size: 'm', config: {} },
  { id: 'w-notes',    type: 'notes',    size: 'm', config: { text: '' } },
];

function loadWidgets() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return DEFAULTS;
}

export default function Widgets({ onOpen }) {
  const [widgets, setWidgets] = useState(loadWidgets);
  const [addAnchor, setAddAnchor] = useState(null);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(widgets)); } catch {}
  }, [widgets]);

  const addWidget = (type) => {
    setWidgets((prev) => [...prev, { id: `w-${type}-${Date.now()}`, type, size: 'm', config: {} }]);
    setAddAnchor(null);
  };
  const removeWidget = (id) => setWidgets((prev) => prev.filter((w) => w.id !== id));
  const resizeWidget = (id) =>
    setWidgets((prev) => prev.map((w) => (w.id === id ? { ...w, size: nextSize(w.size || 'm') } : w)));
  const moveWidget = (id, dir) => setWidgets((prev) => {
    const idx = prev.findIndex((w) => w.id === id);
    const next = idx + dir;
    if (idx < 0 || next < 0 || next >= prev.length) return prev;
    const copy = [...prev];
    [copy[idx], copy[next]] = [copy[next], copy[idx]];
    return copy;
  });
  const updateConfig = (id, patch) =>
    setWidgets((prev) => prev.map((w) => (w.id === id ? { ...w, config: { ...w.config, ...patch } } : w)));

  return (
    <Box sx={{ width: 'min(1100px, 95vw)', mt: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5, px: 0.5 }}>
        <Typography sx={{ fontFamily: MONO, fontSize: 12, letterSpacing: 3, textTransform: 'uppercase',
          color: '#9aa3c7', display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box component="span" sx={{ width: 7, height: 7, borderRadius: '50%', background: ACCENT }} />
          Dashboard
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

      <Box sx={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gridAutoRows: '116px',
        gap: 1.5,
        '@media (max-width: 720px)': { gridTemplateColumns: 'repeat(2, 1fr)' },
      }}>
        {widgets.map((w, i) => {
          const span = SIZE_SPAN[w.size || 'm'] || SIZE_SPAN.m;
          return (
            <motion.div
              key={w.id} layout
              initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
              style={{ gridColumn: `span ${span.col}`, gridRow: `span ${span.row}` }}
            >
              <WidgetFrame
                widget={w}
                isFirst={i === 0}
                isLast={i === widgets.length - 1}
                onRemove={() => removeWidget(w.id)}
                onResize={() => resizeWidget(w.id)}
                onMove={(dir) => moveWidget(w.id, dir)}
                onConfig={(patch) => updateConfig(w.id, patch)}
                onOpen={onOpen}
              />
            </motion.div>
          );
        })}
      </Box>
    </Box>
  );
}

function WidgetFrame({ widget, isFirst, isLast, onRemove, onResize, onMove, onConfig, onOpen }) {
  const meta = CATALOG.find((c) => c.type === widget.type) || { label: widget.type, icon: null };
  return (
    <Box sx={{
      height: '100%', display: 'flex', flexDirection: 'column',
      p: 1.25, borderRadius: '4px',
      background: SURFACE,
      border: `1px solid ${LINE}`,
      backgroundImage: 'radial-gradient(rgba(255,255,255,0.05) 1px, transparent 1px)',
      backgroundSize: '14px 14px',
      transition: 'border-color 140ms ease',
      '&:hover': { borderColor: 'rgba(255,255,255,0.22)' },
      '&:hover .wgt-controls': { opacity: 1 },
    }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.75 }}>
        <Box sx={{ color: ACCENT, display: 'flex', '& svg': { fontSize: 15 } }}>{meta.icon}</Box>
        <Typography sx={{ flex: 1, fontFamily: MONO, fontSize: 10, letterSpacing: 2,
          textTransform: 'uppercase', color: '#9aa3c7' }}>
          {meta.label}
        </Typography>
        <Box className="wgt-controls" sx={{ display: 'flex', opacity: 0, transition: 'opacity 140ms ease' }}>
          <Tooltip title="Resize">
            <IconButton size="small" onClick={onResize}><AspectRatioIcon sx={{ fontSize: 14 }} /></IconButton>
          </Tooltip>
          <Tooltip title="Move left">
            <span><IconButton size="small" disabled={isFirst} onClick={() => onMove(-1)}>
              <ChevronLeftIcon sx={{ fontSize: 15 }} />
            </IconButton></span>
          </Tooltip>
          <Tooltip title="Move right">
            <span><IconButton size="small" disabled={isLast} onClick={() => onMove(1)}>
              <ChevronRightIcon sx={{ fontSize: 15 }} />
            </IconButton></span>
          </Tooltip>
          <Tooltip title="Remove">
            <IconButton size="small" onClick={onRemove}><CloseIcon sx={{ fontSize: 14 }} /></IconButton>
          </Tooltip>
        </Box>
      </Box>
      <Box sx={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
        {widget.type === 'clock' && <ClockWidget size={widget.size} />}
        {widget.type === 'calendar' && <CalendarWidget />}
        {widget.type === 'notes' && <NotesWidget config={widget.config} onConfig={onConfig} />}
        {widget.type === 'links' && <LinksWidget config={widget.config} onConfig={onConfig} onOpen={onOpen} />}
        {widget.type === 'worldclock' && <WorldClockWidget config={widget.config} onConfig={onConfig} />}
        {widget.type === 'stocks' && <StockWidget config={widget.config} onConfig={onConfig} size={widget.size} />}
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

function ClockWidget({ size }) {
  const now = useNow();
  const big = size === 'l' || size === 'xl';
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

function StockWidget({ config, onConfig, size }) {
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

  const compact = size === 's' || size === 'm';

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
