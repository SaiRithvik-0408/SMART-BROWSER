import React, { useState } from 'react';
import {
  Box, Stack, Typography, Paper, InputBase, IconButton, Grid, Chip,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import ShieldIcon from '@mui/icons-material/Shield';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import RouterIcon from '@mui/icons-material/Router';
import BoltIcon from '@mui/icons-material/Bolt';
import { motion } from 'framer-motion';

const SHORTCUTS = [
  { label: 'YouTube',    url: 'https://www.youtube.com', color: '#ff4757' },
  { label: 'Wikipedia',  url: 'https://en.wikipedia.org', color: '#9aa3c7' },
  { label: 'GitHub',     url: 'https://github.com', color: '#e6e9f5' },
  { label: 'Reddit',     url: 'https://old.reddit.com', color: '#ff7043' },
  { label: 'X / Twitter',url: 'https://x.com', color: '#7aa2ff' },
  { label: 'DuckDuckGo', url: 'https://duckduckgo.com', color: '#fbbf24' },
];

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
      flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      px: 3, py: 6, color: '#e6e9f5',
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

      <Grid container spacing={1.5} sx={{ mt: 4, maxWidth: 720, justifyContent: 'center' }}>
        {SHORTCUTS.map(s => (
          <Grid item key={s.url}>
            <Chip
              clickable
              onClick={() => onOpen(s.url)}
              label={s.label}
              sx={{
                px: 1.5, py: 2.2, fontSize: 14,
                border: `1px solid ${s.color}55`,
                background: `${s.color}18`,
                color: '#e6e9f5',
                '&:hover': { background: `${s.color}30` },
              }}
            />
          </Grid>
        ))}
      </Grid>

      <Grid container spacing={2} sx={{ mt: 6, maxWidth: 920 }} justifyContent="center">
        <FeatureCard icon={<ShieldIcon />} title="Built-in VPN"
          desc="Outbound traffic flows through a SOCKS/HTTPS tunnel. The destination only sees the exit node's IP." />
        <FeatureCard icon={<VisibilityOffIcon />} title="Website masking"
          desc="The network never sees youtube.com or any real host — only this SmartBrowser server." />
        <FeatureCard icon={<RouterIcon />} title="One unified host"
          desc="Every request, image, script and websocket is rewritten to /api/proxy?url= on this domain." />
      </Grid>
    </Box>
  );
}

function FeatureCard({ icon, title, desc }) {
  return (
    <Grid item xs={12} sm={6} md={4}>
      <Paper sx={{ p: 2.5, height: '100%' }}>
        <Stack direction="row" spacing={1.5} alignItems="center" mb={1}>
          <Box sx={{
            width: 36, height: 36, borderRadius: 2,
            display: 'grid', placeItems: 'center',
            background: 'linear-gradient(135deg,#7aa2ff44,#a78bfa44)',
            border: '1px solid rgba(122,162,255,0.35)', color: '#7aa2ff',
          }}>{icon}</Box>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>{title}</Typography>
        </Stack>
        <Typography variant="body2" color="text.secondary">{desc}</Typography>
      </Paper>
    </Grid>
  );
}
