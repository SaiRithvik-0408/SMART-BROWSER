import React from 'react';
import { Box, IconButton, Typography, Tooltip } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import PublicIcon from '@mui/icons-material/Public';
import AddIcon from '@mui/icons-material/Add';

// Native title bar is hidden (Electron `titleBarStyle: 'hidden'`), so this
// component IS the title bar. The whole strip is a drag region; individual
// tabs / buttons opt out via `WebkitAppRegion: 'no-drag'`.
//
// Right padding reserves space for the OS-drawn min/max/close overlay on
// Windows + Linux (~148 px). On macOS the traffic lights live on the LEFT.
const isMac = typeof navigator !== 'undefined' &&
              /Mac|iPhone|iPad/.test(navigator.platform);
const OVERLAY_PAD_RIGHT = isMac ? 0  : 148;
const OVERLAY_PAD_LEFT  = isMac ? 78 : 8;

const DRAG    = { WebkitAppRegion: 'drag' };
const NO_DRAG = { WebkitAppRegion: 'no-drag' };

// Chrome/Brave-style sizing.
//   - flex-basis 0 + flex-grow lets tabs share leftover space proportionally
//   - max-width caps how wide a tab can get when there are few tabs
//   - min-width keeps tabs readable when there are many (icon + a few chars)
//   - Active tab has 1.6× grow and 0.6× shrink, so it's always visibly wider
const TAB_MIN_WIDTH    = 80;
const TAB_MAX_WIDTH    = 240;
const ACTIVE_MIN_WIDTH = 140;
const ACTIVE_MAX_WIDTH = 320;

export default function TabsBar({ tabs, activeId, onSelect, onClose, onNewTab }) {
  return (
    <Box
      sx={{
        pl: `${OVERLAY_PAD_LEFT}px`,
        pr: `${OVERLAY_PAD_RIGHT}px`,
        pt: 0.5,
        display: 'flex', alignItems: 'flex-end',
        position: 'relative', zIndex: 5,
        background: '#05060f',
        minHeight: 40,
      }}
      style={DRAG}
    >
      {/* Tabs are direct flex children of the strip so they share the row
          with the filler. Each tab has flex-grow proportional to its size
          (active = 1.6, inactive = 1) but is CAPPED by max-width — once a
          tab hits its max, leftover space cascades to the next flexible
          sibling (ultimately the filler). Few tabs grow wide, many tabs
          squeeze together, just like Chrome/Brave. */}
      {tabs.map((t) => {
        const active = t.id === activeId;
        return (
          <Box
            key={t.id}
            role="tab"
            aria-selected={active}
            onClick={() => onSelect(t.id)}
            onAuxClick={(e) => { if (e.button === 1) { e.preventDefault(); onClose(t.id); } }}
            style={NO_DRAG}
            sx={{
              flexGrow:   active ? 1.6 : 1,
              flexShrink: active ? 0.6 : 1,
              flexBasis:  0,
              minWidth:  active ? ACTIVE_MIN_WIDTH : TAB_MIN_WIDTH,
              maxWidth:  active ? ACTIVE_MAX_WIDTH : TAB_MAX_WIDTH,
              mr: 0.25,
              height: 34,
              display: 'flex', alignItems: 'center',
              gap: 1, px: 1.25,
              cursor: 'pointer', userSelect: 'none',
              borderRadius: '10px 10px 0 0',
              position: 'relative',
              // Active = lifted, lit-up surface. Inactive = flat / muted.
              background: active
                ? 'linear-gradient(180deg, rgba(122,162,255,0.22) 0%, rgba(122,162,255,0.10) 100%)'
                : 'transparent',
              color: active ? '#f1f3ff' : '#9aa3c7',
              border: '1px solid',
              borderColor: active ? 'rgba(122,162,255,0.32)' : 'transparent',
              borderBottom: 'none',
              transition: 'flex-grow 180ms ease, background 140ms ease, color 140ms ease',
              '&:hover': {
                background: active
                  ? 'linear-gradient(180deg, rgba(122,162,255,0.28) 0%, rgba(122,162,255,0.14) 100%)'
                  : 'rgba(255,255,255,0.04)',
                color: '#e6e9f5',
              },
              // Bottom accent gradient — only on the active tab.
              '&::after': active ? {
                content: '""',
                position: 'absolute', left: 6, right: 6, bottom: -1,
                height: 2, borderRadius: 2,
                background: 'linear-gradient(90deg,#7aa2ff,#a78bfa,#34d399)',
              } : {},
            }}
          >
            <PublicIcon sx={{ fontSize: 16, opacity: active ? 0.9 : 0.6, flexShrink: 0 }} />
            <Typography
              variant="body2"
              noWrap
              title={t.title || 'New tab'}
              sx={{
                flex: 1, minWidth: 0,
                fontSize: 13,
                fontWeight: active ? 600 : 500,
                letterSpacing: 0.1,
              }}
            >
              {t.title || 'New tab'}
            </Typography>
            <IconButton
              size="small"
              aria-label="Close tab"
              style={NO_DRAG}
              onClick={(e) => { e.stopPropagation(); onClose(t.id); }}
              sx={{
                p: 0.25, ml: 0.25,
                color: active ? '#cfd5f0' : '#7d86a8',
                flexShrink: 0,
                '&:hover': { color: '#fff', background: 'rgba(255,255,255,0.08)' },
              }}
            >
              <CloseIcon sx={{ fontSize: 13 }} />
            </IconButton>
          </Box>
        );
      })}

      {/* + button sits IMMEDIATELY after the last tab (Chrome/Brave layout),
          not at the far right of the strip. Never grows or shrinks. */}
      {onNewTab && (
        <Tooltip title="New tab (Ctrl+T)">
          <IconButton
            size="small"
            onClick={onNewTab}
            style={NO_DRAG}
            sx={{
              width: 30, height: 30, ml: 0.5, mb: 0.25,
              color: '#9aa3c7', flexShrink: 0, flexGrow: 0,
              borderRadius: 1.5,
              '&:hover': { color: '#e6e9f5', background: 'rgba(122,162,255,0.12)' },
            }}
          >
            <AddIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
      )}

      {/* Filler: takes the leftover when tabs hit their max width, and stays
          a drag region so the user can grab any empty area to move the window. */}
      <Box sx={{ flex: '1 1 0', alignSelf: 'stretch', minWidth: 0 }} style={DRAG} />
    </Box>
  );
}
