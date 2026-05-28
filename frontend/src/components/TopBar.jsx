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
import AddIcon from '@mui/icons-material/Add';
import LaunchIcon from '@mui/icons-material/Launch';
import ZoomInIcon from '@mui/icons-material/ZoomIn';
import ZoomOutIcon from '@mui/icons-material/ZoomOut';
import ZoomOutMapIcon from '@mui/icons-material/ZoomOutMap';
import FindInPageIcon from '@mui/icons-material/FindInPage';
import PrintIcon from '@mui/icons-material/Print';
import SaveAltIcon from '@mui/icons-material/SaveAlt';
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep';
import LogoutIcon from '@mui/icons-material/Logout';
import StarIcon from '@mui/icons-material/Star';

const api = typeof window !== 'undefined' ? window.smartBrowserAPI : null;

export default function TopBar({
  url, onNavigate, onBack, onForward, onReload, onHome,
  vpnOn, onToggleVpnPanel, activeServerLabel,
  notesOpen, onToggleNotesPanel,
  onNewTab, onOpenInternal,
  // Zoom only works on native tab content; when the user is on the home
  // page (no WebContentsView) we apply zoom as a CSS scale via React state
  // owned by App.jsx. These three props let TopBar route the menu's zoom
  // buttons through the right path and show an accurate percentage badge.
  isHomeActive = false, homeZoom = 1, onHomeZoom,
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

  const [zoomLevel, setZoomLevel] = useState(0);
  const closeMenu = () => setMenuAnchor(null);
  const goTo = (url) => { closeMenu(); onNavigate(url); };
  const run = (fn) => () => { closeMenu(); try { fn?.(); } catch {} };
  // Open one of the internal pages (history / downloads / settings / etc)
  // as a floating popup over the current tab instead of navigating the
  // current tab to a smartbrowser:// URL — that used to wipe whatever
  // website the user was reading.
  const openInternal = (name) => () => {
    closeMenu();
    if (onOpenInternal) onOpenInternal(name);
    else onNavigate(`smartbrowser://${name}`);   // fallback for web-mode
  };
  const clearAllData = async () => {
    closeMenu();
    try {
      if (api?.browser?.clearData) await api.browser.clearData({ history: true, downloads: true, cache: true, cookies: false });
    } catch {}
  };
  // Zoom does NOT close the menu — the user usually clicks zoom multiple
  // times to dial in a comfortable size, and a menu-closing-per-click UX
  // forces them to reopen the menu between every step. We do swallow the
  // mouseDown event so MUI's "click outside" handler doesn't kill it.
  //
  // Two paths:
  //   - On the home page (isHomeActive): route the request to React's
  //     homeZoom state via the onHomeZoom callback. The home page renders
  //     with a CSS scale based on this value (see BrowserView).
  //   - On any real tab: invoke main's `browser:zoom`, which sets the
  //     native WebContentsView's zoom level.
  // Without this split, zoom was completely broken on the home tab because
  // there was no native view to zoom — the click silently no-op'd.
  const zoom = (dir) => async (e) => {
    e?.stopPropagation?.();
    try {
      if (isHomeActive) {
        onHomeZoom?.(dir);
        return;
      }
      const res = api?.browser?.zoom ? await api.browser.zoom(dir) : null;
      if (typeof res === 'number') setZoomLevel(res);
      // res may be `{ noTab: true }` if main couldn't find an active tab
      // (e.g. tab just navigated to home) — main fires `home:zoom` for us
      // in that case, App.jsx catches it and updates homeZoom, which flows
      // back into this component via the homeZoom prop.
    } catch {}
  };
  // Refresh the displayed zoom level when the menu opens so the user sees
  // the current zoom of the active tab, not a stale 0.
  React.useEffect(() => {
    if (!menuAnchor || !api?.browser?.zoom || isHomeActive) return;
    (async () => {
      try { const r = await api.browser.zoom('query'); if (typeof r === 'number') setZoomLevel(r); } catch {}
    })();
  }, [menuAnchor, isHomeActive]);
  // Percentage badge for the menu: real-tab zoom uses Chrome's log curve
  // (100% × 1.2^level); home zoom is a direct scale factor.
  const zoomPct = isHomeActive
    ? Math.round(homeZoom * 100)
    : Math.round(Math.pow(1.2, zoomLevel) * 100);

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
        <IconButton
          data-sb-vpn-toggle
          onClick={onToggleVpnPanel}
          sx={{ color: vpnOn ? '#34d399' : '#9aa3c7' }}
        >
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
        anchorEl={menuAnchor} open={!!menuAnchor} onClose={closeMenu}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        PaperProps={{ sx: { minWidth: 260, mt: 0.5 } }}
      >
        {/* --- New tab / new window ------------------------------------ */}
        <MenuItem onClick={run(onNewTab)}>
          <ListItemIcon><AddIcon fontSize="small" /></ListItemIcon>
          <ListItemText>New tab</ListItemText>
          <Typography variant="caption" sx={{ color: 'text.secondary', ml: 2 }}>Ctrl+T</Typography>
        </MenuItem>
        <MenuItem onClick={run(() => api?.window?.newWindow?.())}>
          <ListItemIcon><LaunchIcon fontSize="small" /></ListItemIcon>
          <ListItemText>New window</ListItemText>
          <Typography variant="caption" sx={{ color: 'text.secondary', ml: 2 }}>Ctrl+N</Typography>
        </MenuItem>
        <MenuItem onClick={run(() => onToggleVpnPanel?.())}>
          <ListItemIcon><ShieldIcon fontSize="small" sx={{ color: vpnOn ? '#34d399' : undefined }} /></ListItemIcon>
          <ListItemText>{vpnOn ? `VPN — ${activeServerLabel || 'connected'}` : 'VPN — configure'}</ListItemText>
        </MenuItem>

        <Divider />

        {/* --- Library: history / downloads / passwords / bookmarks ----
            All of these now open as floating popups (InternalOverlay)
            instead of replacing the current tab's page. */}
        <MenuItem onClick={openInternal('history')}>
          <ListItemIcon><HistoryIcon fontSize="small" /></ListItemIcon>
          <ListItemText>History</ListItemText>
        </MenuItem>
        <MenuItem onClick={openInternal('downloads')}>
          <ListItemIcon><DownloadIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Downloads</ListItemText>
          <Typography variant="caption" sx={{ color: 'text.secondary', ml: 2 }}>Ctrl+J</Typography>
        </MenuItem>
        <MenuItem onClick={openInternal('passwords')}>
          <ListItemIcon><KeyIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Passwords and autofill</ListItemText>
        </MenuItem>
        <MenuItem onClick={run(() => onToggleNotesPanel?.())}>
          <ListItemIcon><StickyNote2Icon fontSize="small" /></ListItemIcon>
          <ListItemText>Notes</ListItemText>
        </MenuItem>
        <MenuItem onClick={openInternal('extensions')}>
          <ListItemIcon><ExtensionIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Extensions</ListItemText>
        </MenuItem>
        <MenuItem onClick={clearAllData}>
          <ListItemIcon><DeleteSweepIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Delete browsing data…</ListItemText>
        </MenuItem>

        <Divider />

        {/* --- Page actions: zoom / find / save / print ----------------
            Zoom buttons intentionally DON'T close the menu so the user can
            click +/− multiple times in a row to dial in a comfortable size. */}
        <Box
          onMouseDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            px: 2, py: 0.75, gap: 1 }}
        >
          <Typography variant="body2" sx={{ flex: 1 }}>Zoom</Typography>
          <Tooltip title="Zoom out (Ctrl+−)">
            <IconButton size="small" onClick={zoom('out')}><ZoomOutIcon fontSize="small" /></IconButton>
          </Tooltip>
          <Box
            onClick={zoom('reset')}
            sx={{
              minWidth: 42, px: 0.75, py: 0.25, textAlign: 'center', cursor: 'pointer',
              borderRadius: 1, fontSize: 12, color: 'text.secondary',
              '&:hover': { background: 'rgba(255,255,255,0.06)' },
            }}
          >
            {zoomPct}%
          </Box>
          <Tooltip title="Zoom in (Ctrl+=)">
            <IconButton size="small" onClick={zoom('in')}><ZoomInIcon fontSize="small" /></IconButton>
          </Tooltip>
          <Tooltip title="Fullscreen">
            <IconButton size="small" onClick={run(() => {
              if (document.fullscreenElement) document.exitFullscreen();
              else document.documentElement.requestFullscreen?.();
            })}>
              <ZoomOutMapIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
        <MenuItem onClick={run(() => {
          const q = window.prompt('Find in page');
          if (q != null) api?.browser?.find?.(q);
        })}>
          <ListItemIcon><FindInPageIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Find in page…</ListItemText>
          <Typography variant="caption" sx={{ color: 'text.secondary', ml: 2 }}>Ctrl+F</Typography>
        </MenuItem>
        <MenuItem onClick={run(() => api?.browser?.savePage?.())}>
          <ListItemIcon><SaveAltIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Save page as…</ListItemText>
          <Typography variant="caption" sx={{ color: 'text.secondary', ml: 2 }}>Ctrl+S</Typography>
        </MenuItem>
        <MenuItem onClick={run(() => api?.browser?.print?.())}>
          <ListItemIcon><PrintIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Print…</ListItemText>
          <Typography variant="caption" sx={{ color: 'text.secondary', ml: 2 }}>Ctrl+P</Typography>
        </MenuItem>

        <Divider />

        {/* --- Settings + navigation footers --------------------------- */}
        <MenuItem onClick={openInternal('settings')}>
          <ListItemIcon><SettingsIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Settings</ListItemText>
        </MenuItem>
        <MenuItem onClick={run(onHome)}>
          <ListItemIcon><HomeIcon fontSize="small" /></ListItemIcon>
          <ListItemText>New tab page</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => goTo('https://github.com/SaiRithvik-0408/SMART-BROWSER')}>
          <ListItemIcon><OpenInNewIcon fontSize="small" /></ListItemIcon>
          <ListItemText>SmartBrowser on GitHub</ListItemText>
        </MenuItem>
        <MenuItem onClick={run(() => window.close())}>
          <ListItemIcon><LogoutIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Exit</ListItemText>
        </MenuItem>
      </Menu>
    </Paper>
  );
}
