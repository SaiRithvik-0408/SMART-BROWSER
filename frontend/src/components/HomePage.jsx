import React, { useState } from 'react';
import { Box, Typography, Paper, InputBase, IconButton } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import BoltIcon from '@mui/icons-material/Bolt';
import { motion } from 'framer-motion';
import Widgets from './Widgets';
import NewsFeed from './NewsFeed';
import Favorites from './Favorites';

export default function HomePage({ onOpen }) {
  const [q, setQ] = useState('');

  const go = (e) => {
    e.preventDefault();
    if (!q.trim()) return;
    const v = q.trim();
    const isUrl = /^(https?:\/\/|[\w-]+\.[a-z]{2,})/i.test(v);
    onOpen(isUrl ? (v.startsWith('http') ? v : 'https://' + v)
                 : `https://duckduckgo.com/?q=${encodeURIComponent(v)}`);
  };

  return (
    <Box sx={{
      position: 'relative', minHeight: '100%', display: 'flex',
      flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start',
      pb: 6, color: '#e6e9f5',
    }}>
      <Favorites onOpen={onOpen} />

      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', px: 3, width: '100%' }}>
        {/* Hero section: roughly fills the first viewport, search sits about
            a third of the way down — same vibe as Chrome / Brave's new tab. */}
        <Box sx={{
          width: '100%',
          minHeight: 'calc(100vh - 220px)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          pt: { xs: 4, md: 6 },
        }}>
          <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.6 }}>
            <Typography variant="h2" sx={{
              fontWeight: 800, letterSpacing: -1.5, textAlign: 'center',
              background: 'linear-gradient(90deg,#7aa2ff,#a78bfa,#34d399)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            }}>
              Smart<span style={{ fontWeight: 400 }}>Browser</span>
            </Typography>
            <Typography variant="h6" sx={{ textAlign: 'center', color: '#9aa3c7', mt: 1 }}>
              Private. Masked. Free. — every site routes through one secure tunnel.
            </Typography>
          </motion.div>

          <Paper
            component="form" onSubmit={go}
            sx={{
              mt: 5, width: 'min(680px, 92vw)',
              display: 'flex', alignItems: 'center', gap: 1,
              px: 2, py: 1.25, borderRadius: 999,
            }}
          >
            <SearchIcon />
            <InputBase
              fullWidth value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="Search the web privately, or paste a URL"
              sx={{ color: 'text.primary', fontSize: 16 }}
            />
            <IconButton type="submit" color="primary"><BoltIcon /></IconButton>
          </Paper>
        </Box>

        <Widgets onOpen={onOpen} />

        <NewsFeed onOpen={onOpen} />
      </Box>
    </Box>
  );
}
