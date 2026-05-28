import React, { useEffect, useState } from 'react';
import { Box, Typography, Skeleton, IconButton, Tooltip, ToggleButtonGroup, ToggleButton,
  Select, MenuItem } from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import { motion } from 'framer-motion';
import { proxyUrlFor } from '../api/client';

// =========================================================================
// News sources. Each source publishes one or more RSS / Atom feeds; none of
// them ship CORS headers so we route every fetch through the local backend
// `/api/proxy` (which strips CORS / CSP). To add a new source, add an
// object to SOURCES with at least { id, label, sections: { key: url } }.
// =========================================================================
const SOURCES = [
  {
    id: 'et', label: 'Economic Times',
    sections: {
      top:     'https://economictimes.indiatimes.com/rssfeedstopstories.cms',
      markets: 'https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms',
      tech:    'https://economictimes.indiatimes.com/tech/rssfeeds/13357270.cms',
      world:   'https://economictimes.indiatimes.com/news/international/rssfeeds/1898271.cms',
    },
  },
  {
    id: 'bbc', label: 'BBC News',
    sections: {
      top:     'https://feeds.bbci.co.uk/news/rss.xml',
      world:   'https://feeds.bbci.co.uk/news/world/rss.xml',
      tech:    'https://feeds.bbci.co.uk/news/technology/rss.xml',
      markets: 'https://feeds.bbci.co.uk/news/business/rss.xml',
    },
  },
  {
    id: 'reuters', label: 'Reuters',
    // Reuters killed their public RSS feeds in 2020 but Google News fronts
    // them with a stable RSS endpoint per query, which is the same trick
    // most aggregators (Feedly, NetNewsWire) use today.
    sections: {
      top:     'https://news.google.com/rss/search?q=site:reuters.com&hl=en-US&gl=US&ceid=US:en',
      world:   'https://news.google.com/rss/search?q=site:reuters.com+world&hl=en-US&gl=US&ceid=US:en',
      tech:    'https://news.google.com/rss/search?q=site:reuters.com+technology&hl=en-US&gl=US&ceid=US:en',
      markets: 'https://news.google.com/rss/search?q=site:reuters.com+markets&hl=en-US&gl=US&ceid=US:en',
    },
  },
  {
    id: 'hn', label: 'Hacker News',
    sections: {
      top:     'https://hnrss.org/frontpage',
      markets: 'https://hnrss.org/newest?q=startup+OR+market+OR+economy',
      tech:    'https://hnrss.org/show',
      world:   'https://hnrss.org/best',
    },
  },
  {
    id: 'tc', label: 'TechCrunch',
    sections: {
      top:     'https://techcrunch.com/feed/',
      tech:    'https://techcrunch.com/category/artificial-intelligence/feed/',
      markets: 'https://techcrunch.com/category/venture/feed/',
      world:   'https://techcrunch.com/category/startups/feed/',
    },
  },
  {
    id: 'verge', label: 'The Verge',
    sections: {
      top:     'https://www.theverge.com/rss/index.xml',
      tech:    'https://www.theverge.com/rss/tech/index.xml',
      world:   'https://www.theverge.com/rss/world/index.xml',
      markets: 'https://www.theverge.com/rss/business/index.xml',
    },
  },
  {
    id: 'gnews', label: 'Google News',
    sections: {
      top:     'https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en',
      world:   'https://news.google.com/rss/headlines/section/topic/WORLD?hl=en-US&gl=US&ceid=US:en',
      tech:    'https://news.google.com/rss/headlines/section/topic/TECHNOLOGY?hl=en-US&gl=US&ceid=US:en',
      markets: 'https://news.google.com/rss/headlines/section/topic/BUSINESS?hl=en-US&gl=US&ceid=US:en',
    },
  },
];

const SECTIONS = [
  { key: 'top',     label: 'Top' },
  { key: 'world',   label: 'World' },
  { key: 'markets', label: 'Markets' },
  { key: 'tech',    label: 'Tech' },
];

function resolveFeedUrl(sourceId, sectionKey) {
  const src = SOURCES.find((s) => s.id === sourceId) || SOURCES[0];
  return src.sections[sectionKey] || src.sections.top || Object.values(src.sections)[0];
}

const COUNT = 12;

const MONO = "'JetBrains Mono', 'SFMono-Regular', ui-monospace, Menlo, monospace";
const ACCENT = '#d6453d';
const SURFACE = 'rgba(8,9,14,0.72)';
const LINE = 'rgba(255,255,255,0.10)';

function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
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

  // Support both RSS 2.0 (<item>) and Atom (<entry>) feeds — some sources
  // (BBC, ET, HN) ship RSS 2.0; others (some Google News variants, custom
  // CDNs) ship Atom. We normalize both into the same { title, url,
  // summary, pubDate, image } shape.
  const isAtom = doc.documentElement.tagName.toLowerCase() === 'feed';
  const itemTag = isAtom ? 'entry' : 'item';
  return Array.from(doc.getElementsByTagName(itemTag)).slice(0, COUNT).map((it) => {
    let url = '';
    if (isAtom) {
      // Atom: <link rel="alternate" href="…"/> — prefer rel=alternate, fall
      // back to the first <link>.
      const links = Array.from(it.getElementsByTagName('link'));
      const alt = links.find((l) => (l.getAttribute('rel') || 'alternate') === 'alternate') || links[0];
      url = alt?.getAttribute('href') || '';
    } else {
      url = (it.getElementsByTagName('link')[0]?.textContent || '').trim();
    }
    const enclosure = it.getElementsByTagName('enclosure')[0];
    const mediaContent = it.getElementsByTagName('media:content')[0]
      || it.getElementsByTagName('content')[0];
    const image = enclosure?.getAttribute('url')
      || mediaContent?.getAttribute('url')
      || null;
    const dateEl = it.getElementsByTagName('pubDate')[0]
      || it.getElementsByTagName('published')[0]
      || it.getElementsByTagName('updated')[0]
      || it.getElementsByTagName('dc:date')[0];
    const descEl = it.getElementsByTagName('description')[0]
      || it.getElementsByTagName('summary')[0]
      || it.getElementsByTagName('content')[0];
    return {
      title:   stripTags(it.getElementsByTagName('title')[0]?.textContent),
      url,
      summary: stripTags(descEl?.textContent).slice(0, 220),
      pubDate: dateEl?.textContent || '',
      image,
    };
  });
}

const SOURCE_STORAGE_KEY = 'smartbrowser.news.source.v1';

export default function NewsFeed({ onOpen, compact }) {
  const [section, setSection] = useState('top');
  const [sourceId, setSourceId] = useState(() => {
    try {
      const saved = localStorage.getItem(SOURCE_STORAGE_KEY);
      if (saved && SOURCES.some((s) => s.id === saved)) return saved;
    } catch {}
    return 'et';
  });
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => { try { localStorage.setItem(SOURCE_STORAGE_KEY, sourceId); } catch {} }, [sourceId]);

  const load = async (which = section, srcId = sourceId) => {
    setError(''); setItems(null);
    try { setItems(await loadFeed(resolveFeedUrl(srcId, which))); }
    catch (e) { setError(e.message || 'failed'); }
  };

  const currentSource = SOURCES.find((s) => s.id === sourceId) || SOURCES[0];

  // If the picked source doesn't have the current section, snap back to
  // "top" instead of silently showing nothing.
  useEffect(() => {
    if (!currentSource.sections[section]) setSection('top');
  }, [currentSource, section]);

  useEffect(() => { load(section, sourceId); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [section, sourceId]);

  // Compact mode = embedded in a widget grid cell; ditch outer width/padding
  // and let the parent (WidgetFrame) own its sizing and overflow.
  const outerSx = compact
    ? { width: '100%', height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }
    : { width: 'min(1100px, 95vw)', mt: 3, pb: 6 };

  return (
    <Box sx={outerSx}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5, px: 0.5,
        flexWrap: 'wrap', gap: 1 }}>
        {/* The source label is now a dropdown so the user can pick between
            Economic Times / BBC / Reuters / Hacker News / TechCrunch /
            The Verge / Google News on the fly. The selection is persisted
            in localStorage. */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
          <Box component="span" sx={{ width: 7, height: 7, borderRadius: '50%', background: ACCENT }} />
          <Select
            value={sourceId} onChange={(e) => setSourceId(e.target.value)}
            variant="standard" disableUnderline
            sx={{ fontFamily: MONO, fontSize: 12, letterSpacing: 3, textTransform: 'uppercase',
              color: '#9aa3c7',
              '& .MuiSelect-select': { p: 0, pr: '20px !important' },
              '& .MuiSelect-icon': { color: ACCENT },
            }}
          >
            {SOURCES.map((s) => (
              <MenuItem key={s.id} value={s.id}
                sx={{ fontFamily: MONO, fontSize: 12, letterSpacing: 2, textTransform: 'uppercase' }}>
                {s.label}
              </MenuItem>
            ))}
          </Select>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
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
            {SECTIONS.filter((s) => currentSource.sections[s.key]).map((s) => (
              <ToggleButton key={s.key} value={s.key}>{s.label}</ToggleButton>
            ))}
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
        gap: 1.25,
        // In compact (widget) mode let the widget scroll internally — its
        // parent gives it a fixed height. Outside the widget mode we let the
        // page scroll instead.
        ...(compact ? { flex: 1, overflow: 'auto', minHeight: 0, pr: 0.5 } : {}),
        gridTemplateColumns: compact ? 'repeat(auto-fill, minmax(220px, 1fr))' : 'repeat(3, 1fr)',
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
