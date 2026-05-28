import React from 'react';
import { Box, Tabs, Tab, IconButton, Stack, Typography, Tooltip } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import PublicIcon from '@mui/icons-material/Public';
import AddIcon from '@mui/icons-material/Add';

// Native title bar is hidden (Electron `titleBarStyle: 'hidden'`), so this
// component IS the title bar. The whole strip is a drag region; individual
// tabs / buttons opt out via `WebkitAppRegion: 'no-drag'`.
//
// Right padding reserves space for the OS-drawn min/max/close overlay on
// Windows + Linux (≈140 px). On macOS the traffic lights live on the LEFT,
// so we pad-left there instead.
const isMac = typeof navigator !== 'undefined' &&
              /Mac|iPhone|iPad/.test(navigator.platform);
const OVERLAY_PAD_RIGHT = isMac ? 0   : 148;
const OVERLAY_PAD_LEFT  = isMac ? 78  : 8;

const DRAG     = { WebkitAppRegion: 'drag' };
const NO_DRAG  = { WebkitAppRegion: 'no-drag' };

export default function TabsBar({ tabs, activeId, onSelect, onClose, onNewTab }) {
  return (
    <Box
      sx={{
        pl: `${OVERLAY_PAD_LEFT}px`,
        pr: `${OVERLAY_PAD_RIGHT}px`,
        pt: 0.75,
        display: 'flex', alignItems: 'flex-end', gap: 0.25,
        position: 'relative', zIndex: 5,
        background: '#05060f',
      }}
      style={DRAG}
    >
      <Tabs
        value={activeId} onChange={(_, v) => onSelect(v)}
        variant="scrollable" scrollButtons="auto"
        sx={{
          flex: 1, minHeight: 38,
          '& .MuiTabs-indicator': { background: 'linear-gradient(90deg,#7aa2ff,#a78bfa)', height: 3, borderRadius: 2 },
        }}
        style={NO_DRAG}
      >
        {tabs.map(t => (
          <Tab
            key={t.id} value={t.id}
            style={NO_DRAG}
            sx={{ minHeight: 38, py: 0.5, px: 1.5, mr: 0.5,
              borderRadius: '12px 12px 0 0',
              backgroundColor: t.id === activeId ? 'rgba(122,162,255,0.10)' : 'transparent' }}
            label={
              <Stack direction="row" alignItems="center" spacing={1} sx={{ maxWidth: 220 }} style={NO_DRAG}>
                <PublicIcon fontSize="small" sx={{ opacity: 0.7 }} />
                <Typography variant="body2" noWrap sx={{ maxWidth: 150 }}>
                  {t.title || 'New tab'}
                </Typography>
                <IconButton
                  size="small"
                  style={NO_DRAG}
                  onClick={(e) => { e.stopPropagation(); onClose(t.id); }}
                  sx={{ ml: 0.5 }}
                >
                  <CloseIcon sx={{ fontSize: 14 }} />
                </IconButton>
              </Stack>
            }
          />
        ))}
      </Tabs>
      {onNewTab && (
        <Tooltip title="New tab (Ctrl+T)">
          <IconButton
            size="small" onClick={onNewTab}
            style={NO_DRAG}
            sx={{
              mb: 0.5, mx: 0.5,
              color: '#9aa3c7',
              '&:hover': { color: '#e6e9f5', background: 'rgba(122,162,255,0.10)' },
            }}
          >
            <AddIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
    </Box>
  );
}
