import React, { useEffect, useState } from 'react';
import { Box } from '@mui/material';
import Widgets from './Widgets';
import Favorites from './Favorites';
import { loadBackground, loadBackgroundOpacity, onBackgroundChanged } from '../lib/background';

// Home page is now nothing but the favorites bar + the widget grid. The
// SmartBrowser wordmark itself is a singleton widget (see Widgets.jsx →
// BrandWidget) so it can be repositioned and resized like everything else.
//
// Optional background: the user can upload an image or video in
// Settings → Appearance. We render it as a fixed-position layer behind
// the widgets at a configurable opacity so the dotted starfield + widget
// chrome still read cleanly on top.
export default function HomePage({ onOpen }) {
  const [bg, setBg]           = useState(null);
  const [bgOpacity, setBgOp]  = useState(() => loadBackgroundOpacity());

  // Load on mount and whenever Settings fires a background-changed event.
  // Revokes the previous blob URL each time to avoid leaking handles.
  useEffect(() => {
    let cancelled = false;
    let lastUrl = null;
    const refresh = async () => {
      const next = await loadBackground();
      if (cancelled) return;
      if (lastUrl) { try { URL.revokeObjectURL(lastUrl); } catch {} }
      lastUrl = next?.url || null;
      setBg(next);
      setBgOp(loadBackgroundOpacity());
    };
    refresh();
    const off = onBackgroundChanged(() => refresh());
    return () => {
      cancelled = true;
      off();
      if (lastUrl) { try { URL.revokeObjectURL(lastUrl); } catch {} }
    };
  }, []);

  return (
    <Box sx={{
      position: 'relative', minHeight: '100%', display: 'flex',
      flexDirection: 'column', alignItems: 'stretch', justifyContent: 'flex-start',
      pt: 1, pb: 6, color: '#e6e9f5', width: '100%',
    }}>
      {/* User-uploaded background sits absolutely behind everything else.
          `pointerEvents:none` so it never intercepts clicks meant for the
          widgets layered on top. */}
      {bg && (
        <Box sx={{
          position: 'fixed', inset: 0, zIndex: 0,
          pointerEvents: 'none', overflow: 'hidden',
          opacity: bgOpacity,
        }}>
          {bg.kind === 'image' ? (
            <Box component="img" src={bg.url} alt=""
              sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <Box component="video" src={bg.url}
              autoPlay loop muted playsInline
              sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          )}
        </Box>
      )}

      <Box sx={{ position: 'relative', zIndex: 1 }}>
        <Favorites onOpen={onOpen} />
      </Box>
      {/* True edge-to-edge — zero horizontal padding so widgets (including
          a widget pinned at x=0) really touch the screen edge. The dotted
          background and individual widget chrome give enough visual breathing
          room without an outer gutter. */}
      <Box sx={{ width: '100%', px: 0, boxSizing: 'border-box', position: 'relative', zIndex: 1 }}>
        <Widgets onOpen={onOpen} />
      </Box>
    </Box>
  );
}
