import React, { useEffect, useState } from 'react';
import { Box, Paper, IconButton, Typography } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import NotesPanel from './components/NotesPanel';
import VpnPanel from './components/VpnPanel';
import SettingsPage from './components/SettingsPage';
import HistoryPage from './components/HistoryPage';
import DownloadsPage from './components/DownloadsPage';
import PasswordsPage from './components/PasswordsPage';
import ExtensionsPage from './components/ExtensionsPage';

const api = typeof window !== 'undefined' ? window.smartBrowserAPI : null;

// =========================================================================
// PanelHost — the renderer for the floating overlay view
// (index.html?overlay=1). It fills its native view (a narrow strip docked
// on the right edge of the window, positioned by the main process) and
// renders whichever panel the main window asked for.
//
// The overlay view floats ABOVE the page view, so the website underneath
// stays full-size and the visible-left portion remains interactive. This
// is what makes the panels behave like Brave's side panel instead of
// reflowing the page.
// =========================================================================

const INTERNAL_TITLES = {
  settings:   'Settings',
  history:    'History',
  downloads:  'Downloads',
  passwords:  'Passwords',
  extensions: 'Extensions',
};

export default function PanelHost() {
  const [panel, setPanel]     = useState(null);   // 'notes' | 'vpn' | 'settings' | ...
  const [payload, setPayload] = useState(null);

  // Tell main we're mounted, then subscribe to show/hide.
  useEffect(() => {
    if (!api?.overlay) return;
    api.overlay.ready();
    const offShow = api.overlay.onShow(({ panel: p, payload: pl }) => {
      setPanel(p);
      setPayload(pl || null);
    });
    const offHide = api.overlay.onHide(() => setPanel(null));
    return () => { offShow?.(); offHide?.(); };
  }, []);

  const close = () => { setPanel(null); api?.overlay?.close(); };

  // Internal pages call onOpen(url) (e.g. clicking a History entry). The
  // overlay can't drive tab navigation itself, so we ask main to forward
  // the URL to the main window's navigate handler, then close.
  const navigateAndClose = (url) => {
    setPanel(null);
    if (url) api?.overlay?.navigate(url);
    else api?.overlay?.close();
  };

  // Esc closes the overlay from within.
  useEffect(() => {
    if (!panel) return;
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [panel]);

  if (!panel) {
    // Nothing to show — render a transparent placeholder. The native view
    // is hidden by main in this state anyway.
    return <Box sx={{ width: '100vw', height: '100vh', background: 'transparent' }} />;
  }

  // Notes / VPN render their own chrome (header, close button) in docked
  // mode, so host them directly.
  if (panel === 'notes') {
    return (
      <Box sx={{ width: '100vw', height: '100vh', position: 'relative', background: '#0a0e22' }}>
        <NotesPanel open docked onClose={close} initialNoteId={payload?.initialNoteId ?? null} />
      </Box>
    );
  }
  if (panel === 'vpn') {
    return (
      <Box sx={{ width: '100vw', height: '100vh', position: 'relative', background: '#0a0e22' }}>
        <VpnPanel open docked onClose={close} />
      </Box>
    );
  }

  // Internal pages get a shared header bar + the page body.
  return (
    <Paper sx={{
      width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column',
      borderRadius: 0, overflow: 'hidden', background: 'rgba(8,9,14,0.98)',
    }}>
      <Box sx={{
        display: 'flex', alignItems: 'center', gap: 1,
        px: 2, py: 1.25, borderBottom: '1px solid rgba(255,255,255,0.08)',
        flexShrink: 0,
      }}>
        <Typography sx={{ flex: 1, fontWeight: 600, color: '#e6e9f5' }}>
          {INTERNAL_TITLES[panel] || panel}
        </Typography>
        <IconButton size="small" onClick={close} sx={{ color: '#9aa3c7' }}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>
      <Box sx={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
        {panel === 'settings'   && <SettingsPage   onOpen={navigateAndClose} />}
        {panel === 'history'    && <HistoryPage    onOpen={navigateAndClose} />}
        {panel === 'downloads'  && <DownloadsPage  onOpen={navigateAndClose} />}
        {panel === 'passwords'  && <PasswordsPage  onOpen={navigateAndClose} />}
        {panel === 'extensions' && <ExtensionsPage onOpen={navigateAndClose} />}
      </Box>
    </Paper>
  );
}
