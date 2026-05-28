import React, { useEffect, useRef, useState } from 'react';
import {
  Box, Paper, Stack, Typography, IconButton, Menu, MenuItem, Button,
  InputBase, Select, TextField, Tooltip, Divider,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import StickyNote2Icon from '@mui/icons-material/StickyNote2';
import LinkIcon from '@mui/icons-material/Link';
import PublicIcon from '@mui/icons-material/Public';
import { motion } from 'framer-motion';

const STORAGE_KEY = 'smartbrowser.widgets.v1';

// Catalogue of widget types available to add.
const CATALOG = [
  { type: 'clock',     label: 'Clock',       icon: <AccessTimeIcon fontSize="small" /> },
  { type: 'calendar',  label: 'Calendar',    icon: <CalendarMonthIcon fontSize="small" /> },
  { type: 'notes',     label: 'Notes',       icon: <StickyNote2Icon fontSize="small" /> },
  { type: 'links',     label: 'Quick Links', icon: <LinkIcon fontSize="small" /> },
  { type: 'worldclock',label: 'World Clock', icon: <PublicIcon fontSize="small" /> },
];

const DEFAULTS = [
  { id: 'w-clock',    type: 'clock',    config: {} },
  { id: 'w-calendar', type: 'calendar', config: {} },
  { id: 'w-notes',    type: 'notes',    config: { text: '' } },
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
    setWidgets((prev) => [...prev, { id: `w-${type}-${Date.now()}`, type, config: {} }]);
    setAddAnchor(null);
  };
  const removeWidget = (id) => setWidgets((prev) => prev.filter((w) => w.id !== id));
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
    <Box sx={{ width: 'min(1040px, 94vw)', mt: 7 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.5, px: 0.5 }}>
        <Typography variant="subtitle2" sx={{ color: '#9aa3c7', letterSpacing: 0.5, textTransform: 'uppercase' }}>
          Dashboard
        </Typography>
        <Button
          size="small" startIcon={<AddIcon />}
          onClick={(e) => setAddAnchor(e.currentTarget)}
          sx={{ color: '#7aa2ff', textTransform: 'none' }}
        >
          Add widget
        </Button>
        <Menu anchorEl={addAnchor} open={!!addAnchor} onClose={() => setAddAnchor(null)}>
          {CATALOG.map((c) => (
            <MenuItem key={c.type} onClick={() => addWidget(c.type)} sx={{ gap: 1.2 }}>
              {c.icon}{c.label}
            </MenuItem>
          ))}
        </Menu>
      </Stack>

      <Box sx={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
        gap: 2,
      }}>
        {widgets.map((w, i) => (
          <motion.div key={w.id} layout initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
            <WidgetFrame
              widget={w}
              isFirst={i === 0}
              isLast={i === widgets.length - 1}
              onRemove={() => removeWidget(w.id)}
              onMove={(dir) => moveWidget(w.id, dir)}
              onConfig={(patch) => updateConfig(w.id, patch)}
              onOpen={onOpen}
            />
          </motion.div>
        ))}
      </Box>
    </Box>
  );
}

function WidgetFrame({ widget, isFirst, isLast, onRemove, onMove, onConfig, onOpen }) {
  const meta = CATALOG.find((c) => c.type === widget.type) || { label: widget.type, icon: null };
  return (
    <Paper sx={{ p: 1.5, height: 220, display: 'flex', flexDirection: 'column', borderRadius: 3 }}>
      <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mb: 0.5 }}>
        <Box sx={{ color: '#7aa2ff', display: 'flex' }}>{meta.icon}</Box>
        <Typography variant="caption" sx={{ flex: 1, color: '#9aa3c7', fontWeight: 600 }}>
          {meta.label}
        </Typography>
        <Tooltip title="Move left">
          <span><IconButton size="small" disabled={isFirst} onClick={() => onMove(-1)}>
            <ChevronLeftIcon sx={{ fontSize: 16 }} />
          </IconButton></span>
        </Tooltip>
        <Tooltip title="Move right">
          <span><IconButton size="small" disabled={isLast} onClick={() => onMove(1)}>
            <ChevronRightIcon sx={{ fontSize: 16 }} />
          </IconButton></span>
        </Tooltip>
        <Tooltip title="Remove">
          <IconButton size="small" onClick={onRemove}>
            <CloseIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>
      </Stack>
      <Divider sx={{ borderColor: 'rgba(122,162,255,0.12)', mb: 1 }} />
      <Box sx={{ flex: 1, overflow: 'hidden' }}>
        {widget.type === 'clock' && <ClockWidget />}
        {widget.type === 'calendar' && <CalendarWidget />}
        {widget.type === 'notes' && <NotesWidget config={widget.config} onConfig={onConfig} />}
        {widget.type === 'links' && <LinksWidget config={widget.config} onConfig={onConfig} onOpen={onOpen} />}
        {widget.type === 'worldclock' && <WorldClockWidget config={widget.config} onConfig={onConfig} />}
      </Box>
    </Paper>
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

function ClockWidget() {
  const now = useNow();
  return (
    <Stack alignItems="center" justifyContent="center" sx={{ height: '100%' }}>
      <Typography sx={{ fontSize: 40, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: '#e6e9f5' }}>
        {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
      </Typography>
      <Typography variant="body2" sx={{ color: '#9aa3c7' }}>
        {now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
      </Typography>
    </Stack>
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
      <Typography variant="caption" sx={{ color: '#e6e9f5', fontWeight: 700 }}>
        {now.toLocaleDateString([], { month: 'long', year: 'numeric' })}
      </Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 0.25, mt: 0.5 }}>
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <Typography key={i} sx={{ fontSize: 9, textAlign: 'center', color: '#6b7299' }}>{d}</Typography>
        ))}
        {cells.map((d, i) => (
          <Box key={i} sx={{
            textAlign: 'center', fontSize: 10, py: 0.2, borderRadius: 1,
            color: d === today ? '#05060f' : '#cdd3ee',
            fontWeight: d === today ? 800 : 400,
            background: d === today ? '#7aa2ff' : 'transparent',
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
      placeholder="Jot something down…"
      sx={{
        width: '100%', height: '100%', alignItems: 'flex-start',
        color: '#e6e9f5', fontSize: 13,
        '& textarea': { height: '100% !important' },
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
    <Stack sx={{ height: '100%' }} spacing={0.5}>
      <Box sx={{ flex: 1, overflow: 'auto' }}>
        {links.length === 0 && (
          <Typography variant="caption" sx={{ color: '#6b7299' }}>No links yet — add one below.</Typography>
        )}
        {links.map((l, i) => (
          <Stack key={i} direction="row" alignItems="center" spacing={0.5}>
            <Typography
              onClick={() => onOpen?.(l.url)}
              sx={{ flex: 1, fontSize: 12, color: '#7aa2ff', cursor: 'pointer', overflow: 'hidden',
                    textOverflow: 'ellipsis', whiteSpace: 'nowrap', '&:hover': { textDecoration: 'underline' } }}
            >
              {l.label}
            </Typography>
            <IconButton size="small" onClick={() => remove(i)}><CloseIcon sx={{ fontSize: 13 }} /></IconButton>
          </Stack>
        ))}
      </Box>
      <Stack direction="row" spacing={0.5}>
        <TextField variant="standard" placeholder="Name" value={label}
          onChange={(e) => setLabel(e.target.value)} sx={{ flex: 1, '& input': { fontSize: 11, color: '#e6e9f5' } }} />
        <TextField variant="standard" placeholder="url" value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          sx={{ flex: 1, '& input': { fontSize: 11, color: '#e6e9f5' } }} />
        <IconButton size="small" onClick={add}><AddIcon sx={{ fontSize: 15, color: '#7aa2ff' }} /></IconButton>
      </Stack>
    </Stack>
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
    <Stack alignItems="center" justifyContent="center" sx={{ height: '100%' }} spacing={1}>
      <Typography sx={{ fontSize: 30, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: '#e6e9f5' }}>
        {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: zone.tz })}
      </Typography>
      <Select
        variant="standard" value={zoneLabel}
        onChange={(e) => onConfig({ zone: e.target.value })}
        sx={{ fontSize: 12, color: '#9aa3c7', '& .MuiSelect-icon': { color: '#9aa3c7' } }}
      >
        {ZONES.map((z) => <MenuItem key={z.label} value={z.label} sx={{ fontSize: 12 }}>{z.label}</MenuItem>)}
      </Select>
    </Stack>
  );
}
