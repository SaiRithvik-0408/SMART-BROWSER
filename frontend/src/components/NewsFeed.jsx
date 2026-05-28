import React, { useEffect, useState } from 'react';
import { Box, Typography, Skeleton, IconButton, Tooltip } from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import { motion } from 'framer-motion';

// Free, key-less, CORS-enabled source. No tracking, fits the privacy-first ethos.
const TOP_STORIES = 'https://hacker-news.firebaseio.com/v0/topstories.json';
const ITEM = (id) => `https://hacker-news.firebaseio.com/v0/item/${id}.json`;
const COUNT = 12;

const MONO = "'JetBrains Mono', 'SFMono-Regular', ui-monospace, Menlo, monospace";
const ACCENT = '#d6453d';
const SURFACE = 'rgba(8,9,14,0.72)';
const LINE = 'rgba(255,255,255,0.10)';

function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return 'news.ycombinator.com'; }
}
function ago(ts) {
  const s = Math.floor(Date.now() / 1000 - ts);
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

export default function NewsFeed({ onOpen }) {
  const [items, setItems] = useState(null);
  const [error, setError] = useState(false);

  const load = async () => {
    setError(false);
    setItems(null);
    try {
      const ids = await fetch(TOP_STORIES).then((r) => r.json());
      const top = ids.slice(0, COUNT);
      const stories = await Promise.all(top.map((id) => fetch(ITEM(id)).then((r) => r.json())));
      setItems(stories.filter(Boolean));
    } catch {
      setError(true);
    }
  };

  useEffect(() => { load(); }, []);

  return (
    <Box sx={{ width: 'min(1100px, 95vw)', mt: 8, pb: 6 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5, px: 0.5 }}>
        <Typography sx={{ fontFamily: MONO, fontSize: 12, letterSpacing: 3, textTransform: 'uppercase',
          color: '#9aa3c7', display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box component="span" sx={{ width: 7, height: 7, borderRadius: '50%', background: ACCENT }} />
          Top Stories
        </Typography>
        <Tooltip title="Refresh">
          <IconButton size="small" onClick={load} sx={{ color: '#9aa3c7' }}>
            <RefreshIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>
      </Box>

      {error && (
        <Typography sx={{ fontFamily: MONO, fontSize: 12, color: '#5b6385', letterSpacing: 1, px: 0.5 }}>
          COULDN'T LOAD NEWS — CHECK YOUR CONNECTION OR REFRESH.
        </Typography>
      )}

      <Box sx={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 1.5,
        '@media (max-width: 900px)': { gridTemplateColumns: 'repeat(2, 1fr)' },
        '@media (max-width: 600px)': { gridTemplateColumns: '1fr' },
      }}>
        {!items && !error && Array.from({ length: COUNT }).map((_, i) => (
          <Skeleton key={i} variant="rounded" height={96}
            sx={{ bgcolor: 'rgba(255,255,255,0.04)', borderRadius: '4px' }} />
        ))}

        {items && items.map((s, i) => {
          const url = s.url || `https://news.ycombinator.com/item?id=${s.id}`;
          return (
            <motion.div key={s.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.03, 0.3) }}>
              <Box
                onClick={() => onOpen?.(url)}
                sx={{
                  height: '100%', p: 1.5, borderRadius: '4px', cursor: 'pointer',
                  background: SURFACE, border: `1px solid ${LINE}`,
                  display: 'flex', flexDirection: 'column', gap: 0.75,
                  transition: 'border-color 140ms ease, transform 140ms ease',
                  '&:hover': { borderColor: ACCENT, transform: 'translateY(-2px)' },
                }}
              >
                <Typography sx={{ fontFamily: MONO, fontSize: 10, letterSpacing: 1, color: ACCENT,
                  textTransform: 'uppercase' }}>
                  {String(i + 1).padStart(2, '0')} · {hostOf(url)}
                </Typography>
                <Typography sx={{ flex: 1, fontSize: 13.5, lineHeight: 1.35, color: '#e6e9f5', fontWeight: 600,
                  display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                  {s.title}
                </Typography>
                <Typography sx={{ fontFamily: MONO, fontSize: 10, letterSpacing: 1, color: '#5b6385' }}>
                  ▲ {s.score ?? 0} · {s.descendants ?? 0} comments · {ago(s.time)}
                </Typography>
              </Box>
            </motion.div>
          );
        })}
      </Box>
    </Box>
  );
}
