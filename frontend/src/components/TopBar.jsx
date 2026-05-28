import React, { useState } from 'react';
import {
  Box, Stack, IconButton, InputBase, Paper, Tooltip, Chip, Typography,
  Menu, MenuItem, ListItemIcon, ListItemText, Divider,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import RefreshIcon from '@mui/icons-material/Refresh';
import HomeIcon from '@mui/icons-material/Home';
import ShieldIcon from '@mui/icons-material/Shield';
import StickyNote2Icon from '@mui/icons-material/StickyNote2';
import LockIcon from '@mui/icons-material/Lock';
import MenuIcon from '@mui/icons-material/Menu';
import HistoryIcon from '@mui/icons-material/History';
import DownloadIcon from '@mui/icons-material/Download';
import KeyIcon from '@mui/icons-material/Key';
import ExtensionIcon from '@mui/icons-material/Extension';
import SettingsIcon from '@mui/icons-material/Settings';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';

const api = typeof window !== 'undefined' ? window.smartBrowserAPI : null;

export default function TopBar({
  url, onNavigate, onBack, onForward, onReload, onHome,
  vpnOn, onToggleVpnPanel, activeServerLabel,
  notesOpen, onToggleNotesPanel,
}) {
  const [input, setInput] = useState(url || '');
  const [menuAnchor, setMenuAnchor] = useState(null);

  React.useEffect(() => { setInput(url || ''); }, [url]);

  const submit = async (e) => {
    e.preventDefault();
    let v = input.trim();
    if (!v) return;
    const isUrl = /^(https?:\/\/|[\w-]+\.[a-z]{2,})/i.test(v);
    if (!isUrl) {
      // Use the user's chosen default search engine (falls back to DDG).
      try {
        v = api?.settings ? await api.settings.searchUrl(v)
                          : `https://duckduckgo.com/?q=${encodeURIComponent(v)}`;
      } catch { v = `https://duckduckgo.com/?q=${encodeURIComponent(v)}`; }
    } else if (!/^https?:\/\//i.test(v)) v = 'https://' + v;
    onNavigate(v);
  };

  const goTo = (url) => { setMenuAnchor(null); onNavigate(url); };
  const MENU = [
    { key: 'history',    label: 'History',    icon: <HistoryIcon fontSize="small" />,    url: 'smartbrowser://history' },
    { key: 'downloads',  label: 'Downloads',  icon: <DownloadIcon fontSize="small" />,   url: 'smartbrowser://downloads' },
    { key: 'extensions', label: 'Extensions', icon: <ExtensionIcon fontSize="small" />,  url: 'smartbrowser://extensions' },
    { key: 'passwords',  label: 'Passwords',  icon: <KeyIcon fontSize="small" />,        url: 'smartbrowser://passwords' },
    { key: 'settings',   label: 'Settings',   icon: <SettingsIcon fontSize="small" />,   url: 'smartbrowser://settings' },
  ];

  return (
    <Paper
      elevation={6}
      sx={{
        position: 'relative', zIndex: 5,
        mx: 1, mt: 0.5, mb: 0.5, px: 1.25, py: 0.75,
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

      <Tooltip title={notesOpen ? 'Close notes' : 'Open notes'}>
        <IconButton
          data-sb-notes-toggle
          onClick={onToggleNotesPanel}
          sx={{ color: notesOpen ? '#fbbf24' : '#9aa3c7' }}
        >
          <StickyNote2Icon />
        </IconButton>
      </Tooltip>

      <Tooltip title="Menu">
        <IconButton onClick={(e) => setMenuAnchor(e.currentTarget)}>
          <MenuIcon />
        </IconButton>
      </Tooltip>
      <Menu
        anchorEl={menuAnchor} open={!!menuAnchor} onClose={() => setMenuAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        PaperProps={{ sx: { minWidth: 220, mt: 0.5 } }}
      >
        {MENU.map((m) => (
          <MenuItem key={m.key} onClick={() => goTo(m.url)}>
            <ListItemIcon>{m.icon}</ListItemIcon>
            <ListItemText>{m.label}</ListItemText>
          </MenuItem>
        ))}
        <Divider />
        <MenuItem onClick={() => { setMenuAnchor(null); onHome(); }}>
          <ListItemIcon><HomeIcon fontSize="small" /></ListItemIcon>
          <ListItemText>New tab page</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => goTo('https://github.com/SaiRithvik-0408/SMART-BROWSER')}>
          <ListItemIcon><OpenInNewIcon fontSize="small" /></ListItemIcon>
          <ListItemText>SmartBrowser on GitHub</ListItemText>
        </MenuItem>
      </Menu>
    </Paper>
  );
}
