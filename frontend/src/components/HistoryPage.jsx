import React, { useEffect, useMemo, useState } from 'react';
import {
  Box, Typography, TextField, IconButton, Tooltip, Stack, Divider, Button,
  Menu, MenuItem, ListItemButton, ListItemText, InputAdornment,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import DeleteIcon from '@mui/icons-material/Delete';
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep';
import HistoryIcon from '@mui/icons-material/History';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';

const api = typeof window !== 'undefined' ? window.smartBrowserAPI : null;

function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}
function fmtTime(ts) {
  const d = new Date(ts);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return sameDay
    ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function dayKey(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

export default function HistoryPage({ onOpen }) {
  const [query, setQuery] = useState('');
  const [items, setItems] = useState([]);
  const [clearMenu, setClearMenu] = useState(null);

  const reload = async () => {
    if (!api?.history) return;
    setItems(await api.history.list({ query, limit: 800 }));
  };
  useEffect(() => { reload(); }, [query]);

  const grouped = useMemo(() => {
    const map = new Map();
    for (const it of items) {
      const k = dayKey(it.timestamp);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(it);
    }
    return Array.from(map.entries());
  }, [items]);

  const remove = async (ts) => {
    await api?.history?.remove(ts);
    setItems((prev) => prev.filter((it) => it.timestamp !== ts));
  };
  const clear = async (since) => {
    setClearMenu(null);
    await api?.history?.clear(since ? { since } : {});
    reload();
  };

  return (
    <Box sx={{ p: 2.5, width: '100%', color: '#e6e9f5' }}>
      <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 3 }}>
        <HistoryIcon sx={{ fontSize: 32, color: '#7aa2ff' }} />
        <Typography variant="h4" sx={{ fontWeight: 700, flex: 1 }}>History</Typography>
        <Button
          variant="outlined" size="small" color="error" startIcon={<DeleteSweepIcon />}
          onClick={(e) => setClearMenu(e.currentTarget)}
        >
          Clear...
        </Button>
        <Menu anchorEl={clearMenu} open={!!clearMenu} onClose={() => setClearMenu(null)}>
          <MenuItem onClick={() => clear(Date.now() - 3600e3)}>Last hour</MenuItem>
          <MenuItem onClick={() => clear(Date.now() - 86400e3)}>Last 24 hours</MenuItem>
          <MenuItem onClick={() => clear(Date.now() - 7 * 86400e3)}>Last 7 days</MenuItem>
          <Divider />
          <MenuItem onClick={() => clear(0)} sx={{ color: '#ef4444' }}>All history</MenuItem>
        </Menu>
      </Stack>

      <TextField
        fullWidth size="small" autoFocus
        value={query} onChange={(e) => setQuery(e.target.value)}
        placeholder="Search history"
        InputProps={{
          startAdornment: (
            <InputAdornment position="start"><SearchIcon sx={{ color: '#9aa3c7' }} /></InputAdornment>
          ),
        }}
        sx={{ mb: 3 }}
      />

      {grouped.length === 0 && (
        <Typography sx={{ color: '#9aa3c7', textAlign: 'center', mt: 8 }}>
          {query ? 'No matches.' : 'No history yet — browse a bit and it will show up here.'}
        </Typography>
      )}

      {grouped.map(([day, entries]) => (
        <Box key={day} sx={{ mb: 3 }}>
          <Typography sx={{
            fontSize: 12, textTransform: 'uppercase', letterSpacing: 2,
            color: '#9aa3c7', mb: 1, px: 1,
          }}>{day}</Typography>
          <Box sx={{ border: '1px solid rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
            {entries.map((it) => (
              <Box key={it.timestamp} sx={{
                display: 'flex', alignItems: 'center', gap: 1,
                px: 1.25, py: 0.75,
                borderBottom: '1px solid rgba(255,255,255,0.04)',
                '&:hover': { background: 'rgba(122,162,255,0.06)' },
              }}>
                <Box component="img"
                  src={it.favicon || `https://www.google.com/s2/favicons?domain=${hostOf(it.url)}&sz=32`}
                  alt="" sx={{ width: 18, height: 18, borderRadius: 0.5, opacity: 0.9 }}
                  onError={(e) => { e.target.style.visibility = 'hidden'; }}
                />
                <Typography sx={{ minWidth: 64, fontVariantNumeric: 'tabular-nums', color: '#9aa3c7', fontSize: 12 }}>
                  {fmtTime(it.timestamp)}
                </Typography>
                <ListItemButton
                  onClick={() => onOpen(it.url)}
                  sx={{ flex: 1, py: 0.25, minWidth: 0, borderRadius: 1 }}
                >
                  <ListItemText
                    primary={it.title || it.url}
                    secondary={hostOf(it.url)}
                    primaryTypographyProps={{ noWrap: true, sx: { color: '#e6e9f5' } }}
                    secondaryTypographyProps={{ noWrap: true, sx: { color: '#9aa3c7', fontSize: 12 } }}
                  />
                </ListItemButton>
                <Tooltip title="Open in new tab">
                  <IconButton size="small" onClick={() => onOpen(it.url)}>
                    <OpenInNewIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Remove">
                  <IconButton size="small" onClick={() => remove(it.timestamp)}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Box>
            ))}
          </Box>
        </Box>
      ))}
    </Box>
  );
}
