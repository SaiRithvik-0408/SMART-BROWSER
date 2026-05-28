import React, { useState } from 'react';
import {
  Box, IconButton, Typography, Tooltip,
  Menu, MenuItem, ListItemIcon, ListItemText, Divider,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import PublicIcon from '@mui/icons-material/Public';
import AddIcon from '@mui/icons-material/Add';
import RefreshIcon from '@mui/icons-material/Refresh';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import PushPinIcon from '@mui/icons-material/PushPin';
import VolumeMuteIcon from '@mui/icons-material/VolumeMute';
import RestoreIcon from '@mui/icons-material/Restore';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';

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

export default function TabsBar({
  tabs, activeId, onSelect, onClose, onNewTab,
  // Context-menu actions (all optional — TabsBar degrades gracefully).
  onReload, onDuplicate, onNewTabRightOf,
  onCloseOthers, onCloseRight, onCloseDuplicates,
  onReopenLastClosed, canReopen,
}) {
  // ctx = { x, y, tabId } | null. We render a single MUI Menu positioned at
  // the cursor on right-click, instead of one menu per tab — simpler and
  // matches Chrome's behavior.
  const [ctx, setCtx] = useState(null);
  const [pinned, setPinned] = useState(() => new Set());

  const openCtx = (e, tabId) => {
    e.preventDefault();
    setCtx({ x: e.clientX, y: e.clientY, tabId });
  };
  const closeCtx = () => setCtx(null);

  const ctxTab = ctx ? tabs.find((t) => t.id === ctx.tabId) : null;
  const ctxIdx = ctx ? tabs.findIndex((t) => t.id === ctx.tabId) : -1;
  const tabsToRight = ctxIdx >= 0 ? tabs.length - ctxIdx - 1 : 0;
  const otherCount  = ctxTab ? tabs.length - 1 : 0;

  const togglePin = (id) => {
    setPinned((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

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
      {tabs.map((t) => {
        const active   = t.id === activeId;
        const isPinned = pinned.has(t.id);
        return (
          <Box
            key={t.id}
            role="tab"
            aria-selected={active}
            onClick={() => onSelect(t.id)}
            onContextMenu={(e) => openCtx(e, t.id)}
            // Middle-click closes the tab (Chrome convention). Pinned tabs
            // are immune so users don't lose them by accident.
            onAuxClick={(e) => { if (e.button === 1 && !isPinned) { e.preventDefault(); onClose(t.id); } }}
            style={NO_DRAG}
            sx={{
              flexGrow:   isPinned ? 0 : (active ? 1.6 : 1),
              flexShrink: isPinned ? 0 : (active ? 0.6 : 1),
              flexBasis:  isPinned ? 'auto' : 0,
              minWidth:  isPinned ? 40 : (active ? ACTIVE_MIN_WIDTH : TAB_MIN_WIDTH),
              maxWidth:  isPinned ? 40 : (active ? ACTIVE_MAX_WIDTH : TAB_MAX_WIDTH),
              width:     isPinned ? 40 : undefined,
              mr: 0.25,
              height: 34,
              display: 'flex', alignItems: 'center',
              gap: isPinned ? 0 : 1,
              px: isPinned ? 0.5 : 1.25,
              justifyContent: isPinned ? 'center' : 'flex-start',
              cursor: 'pointer', userSelect: 'none',
              borderRadius: '10px 10px 0 0',
              position: 'relative',
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
              '&::after': active ? {
                content: '""',
                position: 'absolute', left: 6, right: 6, bottom: -1,
                height: 2, borderRadius: 2,
                background: 'linear-gradient(90deg,#7aa2ff,#a78bfa,#34d399)',
              } : {},
            }}
            title={isPinned ? (t.title || 'New tab') : undefined}
          >
            {isPinned
              ? <PushPinIcon sx={{ fontSize: 16, transform: 'rotate(45deg)', color: active ? '#f1f3ff' : '#cfd5f0' }} />
              : <PublicIcon sx={{ fontSize: 16, opacity: active ? 0.9 : 0.6, flexShrink: 0 }} />}
            {!isPinned && (
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
            )}
            {!isPinned && (
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
            )}
          </Box>
        );
      })}

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

      <Box sx={{ flex: '1 1 0', alignSelf: 'stretch', minWidth: 0 }} style={DRAG} />

      {/* Right-click context menu — anchored at cursor coords. */}
      <Menu
        open={!!ctx}
        onClose={closeCtx}
        anchorReference="anchorPosition"
        anchorPosition={ctx ? { top: ctx.y, left: ctx.x } : undefined}
        PaperProps={{ sx: { minWidth: 240 } }}
      >
        <MenuItem onClick={() => { closeCtx(); onNewTabRightOf?.(ctx.tabId); }}>
          <ListItemIcon><AddIcon fontSize="small" /></ListItemIcon>
          <ListItemText>New tab to the right</ListItemText>
        </MenuItem>
        <Divider />
        <MenuItem onClick={() => { closeCtx(); onReload?.(ctx.tabId); }}>
          <ListItemIcon><RefreshIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Reload</ListItemText>
          <Typography variant="caption" sx={{ color: '#9aa3c7', ml: 2 }}>Ctrl+R</Typography>
        </MenuItem>
        <MenuItem onClick={() => { closeCtx(); onDuplicate?.(ctx.tabId); }}>
          <ListItemIcon><ContentCopyIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Duplicate</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => { closeCtx(); togglePin(ctx.tabId); }}>
          <ListItemIcon><PushPinIcon fontSize="small" /></ListItemIcon>
          <ListItemText>{ctx && pinned.has(ctx.tabId) ? 'Unpin' : 'Pin'}</ListItemText>
        </MenuItem>
        <MenuItem disabled>
          <ListItemIcon><VolumeMuteIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Mute tab</ListItemText>
        </MenuItem>
        <Divider />
        <MenuItem disabled={!ctx || pinned.has(ctx.tabId)}
          onClick={() => { const id = ctx.tabId; closeCtx(); onClose(id); }}>
          <ListItemIcon><CloseIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Close</ListItemText>
          <Typography variant="caption" sx={{ color: '#9aa3c7', ml: 2 }}>Ctrl+W</Typography>
        </MenuItem>
        <MenuItem disabled={otherCount === 0}
          onClick={() => { const id = ctx.tabId; closeCtx(); onCloseOthers?.(id); }}>
          <ListItemText inset>Close other tabs</ListItemText>
        </MenuItem>
        <MenuItem disabled={tabsToRight === 0}
          onClick={() => { const id = ctx.tabId; closeCtx(); onCloseRight?.(id); }}>
          <ListItemIcon><ArrowForwardIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Close tabs to the right ({tabsToRight})</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => { closeCtx(); onCloseDuplicates?.(); }}>
          <ListItemText inset>Close duplicate tabs</ListItemText>
        </MenuItem>
        <Divider />
        <MenuItem disabled={!canReopen}
          onClick={() => { closeCtx(); onReopenLastClosed?.(); }}>
          <ListItemIcon><RestoreIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Reopen closed tab</ListItemText>
          <Typography variant="caption" sx={{ color: '#9aa3c7', ml: 2 }}>Ctrl+Shift+T</Typography>
        </MenuItem>
      </Menu>
    </Box>
  );
}
