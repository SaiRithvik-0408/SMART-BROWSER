import React, { useState } from 'react';
import { Box, Typography, Paper, InputBase, IconButton } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import BoltIcon from '@mui/icons-material/Bolt';
import { motion } from 'framer-motion';
import Widgets from './Widgets';
import Favorites from './Favorites';
import AiShortcuts from './AiShortcuts';

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
        {/* Compact hero — logo + tagline + omnibar. Tuned so widgets + news
            are visible in the SAME viewport on a 1080p display, no scrolling
            required for "above the fold". */}
        <Box sx={{
          width: '100%',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          pt: { xs: 3, md: 5 }, pb: { xs: 2, md: 3 },
        }}>
          <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.6 }}>
            <Typography variant="h3" sx={{
              fontWeight: 800, letterSpacing: -1.2, textAlign: 'center',
              background: 'linear-gradient(90deg,#7aa2ff,#a78bfa,#34d399)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            }}>
              Smart<span style={{ fontWeight: 400 }}>Browser</span>
            </Typography>
            <Typography variant="body2" sx={{ textAlign: 'center', color: '#9aa3c7', mt: 0.5 }}>
              Private. Masked. Free.
            </Typography>
          </motion.div>

          <Paper
            component="form" onSubmit={go}
            sx={{
              mt: 2.5, width: 'min(680px, 92vw)',
              display: 'flex', alignItems: 'center', gap: 1,
              px: 2, py: 1, borderRadius: 999,
            }}
          >
            <SearchIcon />
            <InputBase
              fullWidth value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="Search the web privately, or paste a URL"
              sx={{ color: 'text.primary', fontSize: 15 }}
            />
            <IconButton type="submit" color="primary" size="small"><BoltIcon /></IconButton>
          </Paper>

          <AiShortcuts onOpen={onOpen} />
        </Box>

        <Widgets onOpen={onOpen} />
      </Box>
    </Box>
  );
}
