import React, { useEffect, useState } from 'react';
import { Box, Typography, Skeleton, IconButton, Tooltip, ToggleButtonGroup, ToggleButton } from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import { motion } from 'framer-motion';
import { proxyUrlFor } from '../api/client';

// Economic Times publishes free RSS feeds. They don't ship CORS headers, so we
// fetch them through the local backend `/api/proxy` (which strips CORS / CSP).
const ET_FEEDS = {
  top:      'https://economictimes.indiatimes.com/rssfeedstopstories.cms',
  markets:  'https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms',
  tech:     'https://economictimes.indiatimes.com/tech/rssfeeds/13357270.cms',
};
const COUNT = 12;

const MONO = "'JetBrains Mono', 'SFMono-Regular', ui-monospace, Menlo, monospace";
const ACCENT = '#d6453d';
const SURFACE = 'rgba(8,9,14,0.72)';
const LINE = 'rgba(255,255,255,0.10)';

function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return 'economictimes.indiatimes.com'; }
}
function ago(dateStr) {
  const t = Date.parse(dateStr);
  if (!t) return '';
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 60)    return 'just now';
  if (s < 3600)  return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}
function stripTags(s) { return (s || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim(); }

async function loadFeed(feedUrl) {
  const res = await fetch(proxyUrlFor(feedUrl), { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  const doc = new DOMParser().parseFromString(text, 'text/xml');
  if (doc.querySelector('parsererror')) throw new Error('parse error');
  return Array.from(doc.querySelectorAll('item')).slice(0, COUNT).map((it) => {
    const enclosure = it.querySelector('enclosure');
    return {
      title:   stripTags(it.querySelector('title')?.textContent),
      url:     (it.querySelector('link')?.textContent || '').trim(),
      summary: stripTags(it.querySelector('description')?.textContent).slice(0, 220),
      pubDate: it.querySelector('pubDate')?.textContent || '',
      image:   enclosure?.getAttribute('url') || null,
    };
  });
}

export default function NewsFeed({ onOpen }) {
  const [section, setSection] = useState('top');
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');

  const load = async (which = section) => {
    setError(''); setItems(null);
    try { setItems(await loadFeed(ET_FEEDS[which])); }
    catch (e) { setError(e.message || 'failed'); }
  };

  useEffect(() => { load(section); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [section]);

  return (
    <Box sx={{ width: 'min(1100px, 95vw)', mt: 8, pb: 6 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5, px: 0.5,
        flexWrap: 'wrap', gap: 1 }}>
        <Typography sx={{ fontFamily: MONO, fontSize: 12, letterSpacing: 3, textTransform: 'uppercase',
          color: '#9aa3c7', display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box component="span" sx={{ width: 7, height: 7, borderRadius: '50%', background: ACCENT }} />
          Economic Times
        </Typography>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <ToggleButtonGroup
            exclusive size="small" value={section}
            onChange={(_e, v) => v && setSection(v)}
            sx={{
              '& .MuiToggleButton-root': {
                fontFamily: MONO, fontSize: 10, letterSpacing: 1, textTransform: 'uppercase',
                px: 1.25, py: 0.25, border: `1px solid ${LINE}`, color: '#9aa3c7',
                '&.Mui-selected': { color: '#fff', background: ACCENT, borderColor: ACCENT,
                  '&:hover': { background: '#b83a33' } },
              },
            }}
          >
            <ToggleButton value="top">Top</ToggleButton>
            <ToggleButton value="markets">Markets</ToggleButton>
            <ToggleButton value="tech">Tech</ToggleButton>
          </ToggleButtonGroup>
          <Tooltip title="Refresh">
            <IconButton size="small" onClick={() => load()} sx={{ color: '#9aa3c7' }}>
              <RefreshIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {error && (
        <Typography sx={{ fontFamily: MONO, fontSize: 12, color: '#5b6385', letterSpacing: 1, px: 0.5 }}>
          COULDN'T LOAD FEED — {error.toUpperCase()}
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
          <Skeleton key={i} variant="rounded" height={120}
            sx={{ bgcolor: 'rgba(255,255,255,0.04)', borderRadius: '4px' }} />
        ))}

        {items && items.map((s, i) => (
          <motion.div key={`${s.url}-${i}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(i * 0.03, 0.3) }}>
            <Box
              onClick={() => onOpen?.(s.url)}
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
                {String(i + 1).padStart(2, '0')} · {hostOf(s.url)}
              </Typography>
              <Typography sx={{ fontSize: 13.5, lineHeight: 1.35, color: '#e6e9f5', fontWeight: 600,
                display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                {s.title}
              </Typography>
              {s.summary && (
                <Typography sx={{ fontSize: 11.5, lineHeight: 1.45, color: '#9aa3c7',
                  display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                  {s.summary}
                </Typography>
              )}
              <Typography sx={{ fontFamily: MONO, fontSize: 10, letterSpacing: 1, color: '#5b6385', mt: 'auto' }}>
                {ago(s.pubDate)}
              </Typography>
            </Box>
          </motion.div>
        ))}
      </Box>
    </Box>
  );
}
