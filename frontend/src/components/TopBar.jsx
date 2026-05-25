import React, { useState } from 'react';
import {
  Box, Stack, IconButton, InputBase, Paper, Tooltip, Chip, Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import RefreshIcon from '@mui/icons-material/Refresh';
import HomeIcon from '@mui/icons-material/Home';
import ShieldIcon from '@mui/icons-material/Shield';
import LockIcon from '@mui/icons-material/Lock';
import SettingsIcon from '@mui/icons-material/Settings';
import AddIcon from '@mui/icons-material/Add';

export default function TopBar({
  url, onNavigate, onBack, onForward, onReload, onHome, onNewTab,
  vpnOn, onToggleVpnPanel, activeServerLabel,
}) {
  const [input, setInput] = useState(url || '');

  React.useEffect(() => { setInput(url || ''); }, [url]);

  const submit = (e) => {
    e.preventDefault();
    let v = input.trim();
    if (!v) return;
    const isUrl = /^(https?:\/\/|[\w-]+\.[a-z]{2,})/i.test(v);
    if (!isUrl) v = `https://duckduckgo.com/?q=${encodeURIComponent(v)}`;
    else if (!/^https?:\/\//i.test(v)) v = 'https://' + v;
    onNavigate(v);
  };

  return (
    <Paper
      elevation={6}
      sx={{
        position: 'relative', zIndex: 5,
        m: 1, mb: 0.5, px: 1.25, py: 0.75,
        display: 'flex', alignItems: 'center', gap: 1, borderRadius: 3,
      }}
    >
      <Stack direction="row" spacing={0.25} alignItems="center">
        <IconButton size="small" onClick={onBack}><ArrowBackIcon fontSize="small" /></IconButton>
        <IconButton size="small" onClick={onForward}><ArrowForwardIcon fontSize="small" /></IconButton>
        <IconButton size="small" onClick={onReload}><RefreshIcon fontSize="small" /></IconButton>
        <IconButton size="small" onClick={onHome}><HomeIcon fontSize="small" /></IconButton>
      </Stack>

      <Box
        component="form" onSubmit={submit}
        sx={{
          flex: 1, display: 'flex', alignItems: 'center', gap: 1,
          px: 1.25, py: 0.6, mx: 0.5,
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(122,162,255,0.18)',
          borderRadius: 999,
        }}
      >
        <LockIcon fontSize="small" sx={{ color: vpnOn ? '#34d399' : '#9aa3c7' }} />
        <Typography variant="caption" sx={{ color: '#9aa3c7', userSelect: 'none' }}>
          smartbrowser://proxy/
        </Typography>
        <InputBase
          fullWidth value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Search DuckDuckGo or type a URL"
          sx={{ color: 'text.primary', fontSize: 14 }}
        />
        <Chip
          size="small" variant="outlined"
          color={vpnOn ? 'success' : 'default'}
          label={vpnOn ? 'masked' : 'direct'}
        />
      </Box>

      <Tooltip title={vpnOn ? `VPN: ${activeServerLabel || 'connected'}` : 'VPN off — click to configure'}>
        <IconButton onClick={onToggleVpnPanel} sx={{ color: vpnOn ? '#34d399' : '#9aa3c7' }}>
          <ShieldIcon />
        </IconButton>
      </Tooltip>
      <IconButton onClick={onNewTab}><AddIcon /></IconButton>
      <IconButton><SettingsIcon /></IconButton>
    </Paper>
  );
}
