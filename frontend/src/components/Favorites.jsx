import React, { useEffect, useRef, useState } from 'react';
import { Box, Typography, IconButton, InputBase, Tooltip, Popover, Button } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';
import StarIcon from '@mui/icons-material/Star';
import { motion } from 'framer-motion';

const STORAGE_KEY = 'smartbrowser.favorites.v1';
const MONO = "'JetBrains Mono', 'SFMono-Regular', ui-monospace, Menlo, monospace";
const ACCENT = '#d6453d';
const LINE = 'rgba(255,255,255,0.10)';

const DEFAULTS = [
  { label: 'YouTube',   url: 'https://www.youtube.com' },
  { label: 'GitHub',    url: 'https://github.com' },
  { label: 'Reddit',    url: 'https://www.reddit.com' },
  { label: 'Wikipedia', url: 'https://en.wikipedia.org' },
];

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return DEFAULTS;
}

function faviconFor(url) {
  try {
    const host = new URL(url).hostname;
    return `https://www.google.com/s2/favicons?domain=${host}&sz=64`;
  } catch { return null; }
}
function initialOf(label) { return (label || '?').trim().charAt(0).toUpperCase(); }

export default function Favorites({ onOpen }) {
  const [favs, setFavs] = useState(load);
  const [anchor, setAnchor] = useState(null);
  const [label, setLabel] = useState('');
  const [url, setUrl] = useState('');
  const labelRef = useRef(null);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(favs)); } catch {}
  }, [favs]);

  const openAdd = (e) => { setAnchor(e.currentTarget); setTimeout(() => labelRef.current?.focus(), 50); };
  const closeAdd = () => { setAnchor(null); setLabel(''); setUrl(''); };
  const add = () => {
    const u = url.trim();
    if (!u) return;
    const full = /^https?:\/\//i.test(u) ? u : `https://${u}`;
    let name = label.trim();
    if (!name) { try { name = new URL(full).hostname.replace(/^www\./, ''); } catch { name = full; } }
    setFavs((prev) => [...prev, { label: name, url: full }]);
    closeAdd();
  };
  const remove = (idx) => setFavs((prev) => prev.filter((_, i) => i !== idx));

  return (
    <Box sx={{
      // Edge-to-edge: zero horizontal padding so the first favorite tile
      // starts flush against the left edge and the last one runs to the
      // right edge, matching the rest of the dashboard.
      width: '100%', display: 'flex', alignItems: 'center', gap: 1.5,
      px: 0.5, py: 1, mb: 1,
      borderBottom: `1px solid ${LINE}`,
      overflowX: 'auto',
      '&::-webkit-scrollbar': { height: 0 },
    }}>
      <Typography sx={{ fontFamily: MONO, fontSize: 10, letterSpacing: 2, textTransform: 'uppercase',
        color: '#5b6385', display: 'flex', alignItems: 'center', gap: 0.75, flexShrink: 0 }}>
        <StarIcon sx={{ fontSize: 13, color: ACCENT }} /> Favorites
      </Typography>

      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
        {favs.map((f, i) => (
          <motion.div key={`${f.url}-${i}`} layout initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}>
            <Box
              onClick={() => onOpen?.(f.url)}
              sx={{
                position: 'relative', display: 'flex', alignItems: 'center', gap: 0.75,
                px: 1.25, py: 0.6, borderRadius: '4px', cursor: 'pointer', flexShrink: 0,
                border: `1px solid ${LINE}`, background: 'rgba(255,255,255,0.03)',
                transition: 'border-color 140ms ease',
                '&:hover': { borderColor: ACCENT },
                '&:hover .fav-x': { opacity: 1 },
              }}
            >
              <FavIcon fav={f} />
              <Typography sx={{ fontFamily: MONO, fontSize: 12, color: '#e6e9f5', whiteSpace: 'nowrap', maxWidth: 140,
                overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {f.label}
              </Typography>
              <IconButton
                className="fav-x" size="small"
                onClick={(e) => { e.stopPropagation(); remove(i); }}
                sx={{ opacity: 0, transition: 'opacity 120ms', p: 0.25, ml: 0.25 }}
              >
                <CloseIcon sx={{ fontSize: 12 }} />
              </IconButton>
            </Box>
          </motion.div>
        ))}

        <Tooltip title="Add favorite">
          <IconButton size="small" onClick={openAdd}
            sx={{ flexShrink: 0, border: `1px dashed ${LINE}`, borderRadius: '4px', color: '#9aa3c7',
              '&:hover': { borderColor: ACCENT, color: '#fff' } }}>
            <AddIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>
      </Box>

      <Popover
        open={!!anchor} anchorEl={anchor} onClose={closeAdd}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        slotProps={{ paper: { sx: { p: 1.5, width: 280, background: '#0b0d16', border: `1px solid ${LINE}` } } }}
      >
        <Typography sx={{ fontFamily: MONO, fontSize: 10, letterSpacing: 2, textTransform: 'uppercase',
          color: '#9aa3c7', mb: 1 }}>
          Add Favorite
        </Typography>
        <InputBase
          inputRef={labelRef} value={label} onChange={(e) => setLabel(e.target.value)}
          placeholder="NAME (OPTIONAL)"
          sx={{ width: '100%', fontFamily: MONO, fontSize: 12, color: '#e6e9f5', mb: 1,
            px: 1, py: 0.6, border: `1px solid ${LINE}`, borderRadius: '4px' }}
        />
        <InputBase
          value={url} onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder="URL"
          sx={{ width: '100%', fontFamily: MONO, fontSize: 12, color: '#e6e9f5', mb: 1.25,
            px: 1, py: 0.6, border: `1px solid ${LINE}`, borderRadius: '4px' }}
        />
        <Button fullWidth size="small" onClick={add}
          sx={{ fontFamily: MONO, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase',
            color: '#fff', background: ACCENT, '&:hover': { background: '#b83a33' } }}>
          Add
        </Button>
      </Popover>
    </Box>
  );
}

function FavIcon({ fav }) {
  const [broken, setBroken] = useState(false);
  const src = faviconFor(fav.url);
  if (broken || !src) {
    return (
      <Box sx={{ width: 16, height: 16, borderRadius: '3px', flexShrink: 0,
        display: 'grid', placeItems: 'center', background: ACCENT,
        fontFamily: MONO, fontSize: 10, fontWeight: 700, color: '#fff' }}>
        {initialOf(fav.label)}
      </Box>
    );
  }
  return (
    <Box component="img" src={src} alt="" onError={() => setBroken(true)}
      sx={{ width: 16, height: 16, borderRadius: '3px', flexShrink: 0, objectFit: 'cover' }} />
  );
}
