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
// (index.html?overlay=1). The overlay view is TRANSPARENT and covers the
// whole content area, floating ABOVE the page view. PanelHost paints a dim
// backdrop (clicking it closes the panel — "click anywhere outside") plus a
// floating popup card holding whichever panel the main window asked for.
//
// The website/home page underneath is never resized or replaced — it just
// shows through the dim backdrop, exactly like a modal popup.
// =========================================================================

const INTERNAL_TITLES = {
  settings:   'Settings',
  history:    'History',
  downloads:  'Downloads',
  passwords:  'Passwords',
  extensions: 'Extensions',
};

// Popup width per panel. Notes needs room for the list + editor; the VPN
// panel is narrow; the rest sit comfortably around 480.
const PANEL_WIDTH = {
  notes: 640,
  vpn:   360,
};
const widthFor = (p) => PANEL_WIDTH[p] || 420;

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
    // Nothing to show — fully transparent (the native view is hidden by main
    // in this state anyway).
    return <Box sx={{ width: '100vw', height: '100vh', background: 'transparent' }} />;
  }

  const isSheet = panel === 'notes' || panel === 'vpn';

  // The floating card. It's anchored to the right edge with a small margin so
  // it reads as a Brave-style side popup, fills (almost) the full height, and
  // can never be clipped by the window because its width is CSS-driven inside
  // the full-width overlay view.
  const card = (
    <Paper
      elevation={16}
      onMouseDown={(e) => e.stopPropagation()}
      sx={{
        position: 'absolute',
        top: 96, right: 16, bottom: 'auto',
        width: `min(${widthFor(panel)}px, calc(100vw - 32px))`,
        maxHeight: 'calc(100vh - 112px)',
        display: 'flex', flexDirection: 'column',
        borderRadius: 3, overflow: 'hidden',
        background: 'rgba(10,14,34,0.98)',
        border: '1px solid rgba(255,255,255,0.10)',
        boxShadow: '0 24px 80px rgba(0,0,0,0.55)',
      }}
    >
      {isSheet ? (
        // Notes / VPN render their own header + close button in docked mode.
        <Box sx={{ position: 'relative', flex: 1, minHeight: 0 }}>
          {panel === 'notes' && (
            <NotesPanel open docked onClose={close} initialNoteId={payload?.initialNoteId ?? null} />
          )}
          {panel === 'vpn' && <VpnPanel open docked onClose={close} />}
        </Box>
      ) : (
        <>
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
        </>
      )}
    </Paper>
  );

  return (
    <Box
      onMouseDown={close}                /* click anywhere on the backdrop closes */
      sx={{
        position: 'fixed', inset: 0,
        background: 'transparent',
      }}
    >
      {card}
    </Box>
  );
}
