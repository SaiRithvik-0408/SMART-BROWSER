import React, { useEffect, useState } from 'react';
import {
  Box, Paper, Typography, Stack, IconButton, Divider, Tooltip,
  List, ListItemButton, ListItemIcon, ListItemText,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import LaunchIcon from '@mui/icons-material/Launch';
import ShieldIcon from '@mui/icons-material/Shield';
import HistoryIcon from '@mui/icons-material/History';
import DownloadIcon from '@mui/icons-material/Download';
import KeyIcon from '@mui/icons-material/Key';
import StickyNote2Icon from '@mui/icons-material/StickyNote2';
import ExtensionIcon from '@mui/icons-material/Extension';
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep';
import ZoomOutIcon from '@mui/icons-material/ZoomOut';
import ZoomInIcon from '@mui/icons-material/ZoomIn';
import ZoomOutMapIcon from '@mui/icons-material/ZoomOutMap';
import FindInPageIcon from '@mui/icons-material/FindInPage';
import SaveAltIcon from '@mui/icons-material/SaveAlt';
import PrintIcon from '@mui/icons-material/Print';
import SettingsIcon from '@mui/icons-material/Settings';
import HomeIcon from '@mui/icons-material/Home';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import LogoutIcon from '@mui/icons-material/Logout';
import CloseIcon from '@mui/icons-material/Close';

import { VpnApi } from '../api/client';

const api = typeof window !== 'undefined' ? window.smartBrowserAPI : null;

export default function MenuPanel({ onClose, onOpen, onOpenPanel }) {
  const [zoomLevel, setZoomLevel] = useState(0);
  const [isHome, setIsHome] = useState(false);
  const [vpnStatus, setVpnStatus] = useState({ enabled: false, activeServer: null });

  // Load VPN status
  useEffect(() => {
    VpnApi.status().then(setVpnStatus).catch(() => {});
    const id = setInterval(() => VpnApi.status().then(setVpnStatus).catch(() => {}), 5000);
    return () => clearInterval(id);
  }, []);

  // Load Zoom Level
  useEffect(() => {
    if (!api?.browser?.zoom) return;
    api.browser.zoom('query').then((res) => {
      if (typeof res === 'number') {
        setZoomLevel(res);
        setIsHome(false);
      } else if (res && res.noTab) {
        setIsHome(true);
      }
    }).catch(() => {});
  }, []);

  const handleZoom = async (dir) => {
    if (!api?.browser?.zoom) return;
    const res = await api.browser.zoom(dir);
    if (typeof res === 'number') {
      setZoomLevel(res);
      setIsHome(false);
    } else if (res && res.noTab) {
      setIsHome(true);
    }
  };

  const handleClearData = async () => {
    onClose?.();
    try {
      if (api?.browser?.clearData) {
        await api.browser.clearData({ history: true, downloads: true, cache: true, cookies: false });
      }
    } catch {}
  };

  const handleFind = () => {
    onClose?.();
    setTimeout(() => {
      const q = window.prompt('Find in page');
      if (q != null) api?.browser?.find?.(q);
    }, 100);
  };

  const zoomPct = isHome
    ? 100
    : Math.round(Math.pow(1.2, zoomLevel) * 100);

  const handleAction = (fn) => () => {
    onClose?.();
    try { fn?.(); } catch {}
  };

  const handleOpenNav = (panelName) => () => {
    onOpenPanel?.(panelName);
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <Box sx={{
        display: 'flex', alignItems: 'center', px: 2, py: 1.5,
        borderBottom: '1px solid rgba(255,255,255,0.06)'
      }}>
        <Typography sx={{ flex: 1, fontWeight: 600, color: '#e6e9f5', fontSize: 15 }}>
          Menu
        </Typography>
        <IconButton size="small" onClick={onClose} sx={{ color: '#9aa3c7' }}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>

      {/* Menu Options */}
      <Box sx={{ flex: 1, overflowY: 'auto', minHeight: 0, py: 0.5 }}>
        <List dense sx={{ p: 0 }}>
          {/* New tab / new window */}
          <ListItemButton onClick={handleAction(() => api?.tab?.create?.(String(Date.now()), 'home'))}>
            <ListItemIcon sx={{ minWidth: 32 }}><AddIcon fontSize="small" /></ListItemIcon>
            <ListItemText primary="New tab" />
            <Typography variant="caption" sx={{ color: 'text.secondary', ml: 2 }}>Ctrl+T</Typography>
          </ListItemButton>

          <ListItemButton onClick={handleAction(() => api?.window?.newWindow?.())}>
            <ListItemIcon sx={{ minWidth: 32 }}><LaunchIcon fontSize="small" /></ListItemIcon>
            <ListItemText primary="New window" />
            <Typography variant="caption" sx={{ color: 'text.secondary', ml: 2 }}>Ctrl+N</Typography>
          </ListItemButton>

          <ListItemButton onClick={handleOpenNav('vpn')}>
            <ListItemIcon sx={{ minWidth: 32 }}>
              <ShieldIcon fontSize="small" sx={{ color: vpnStatus.enabled ? '#34d399' : undefined }} />
            </ListItemIcon>
            <ListItemText primary={vpnStatus.enabled ? `VPN — ${vpnStatus.activeServer?.label || 'connected'}` : 'VPN — configure'} />
          </ListItemButton>

          <Divider sx={{ my: 0.5, borderColor: 'rgba(255,255,255,0.06)' }} />

          {/* Library pages */}
          <ListItemButton onClick={handleOpenNav('history')}>
            <ListItemIcon sx={{ minWidth: 32 }}><HistoryIcon fontSize="small" /></ListItemIcon>
            <ListItemText primary="History" />
          </ListItemButton>

          <ListItemButton onClick={handleOpenNav('downloads')}>
            <ListItemIcon sx={{ minWidth: 32 }}><DownloadIcon fontSize="small" /></ListItemIcon>
            <ListItemText primary="Downloads" />
            <Typography variant="caption" sx={{ color: 'text.secondary', ml: 2 }}>Ctrl+J</Typography>
          </ListItemButton>

          <ListItemButton onClick={handleOpenNav('passwords')}>
            <ListItemIcon sx={{ minWidth: 32 }}><KeyIcon fontSize="small" /></ListItemIcon>
            <ListItemText primary="Passwords and autofill" />
          </ListItemButton>

          <ListItemButton onClick={handleOpenNav('notes')}>
            <ListItemIcon sx={{ minWidth: 32 }}><StickyNote2Icon fontSize="small" /></ListItemIcon>
            <ListItemText primary="Notes" />
          </ListItemButton>

          <ListItemButton onClick={handleOpenNav('extensions')}>
            <ListItemIcon sx={{ minWidth: 32 }}><ExtensionIcon fontSize="small" /></ListItemIcon>
            <ListItemText primary="Extensions" />
          </ListItemButton>

          <ListItemButton onClick={handleClearData}>
            <ListItemIcon sx={{ minWidth: 32 }}><DeleteSweepIcon fontSize="small" /></ListItemIcon>
            <ListItemText primary="Delete browsing data…" />
          </ListItemButton>

          <Divider sx={{ my: 0.5, borderColor: 'rgba(255,255,255,0.06)' }} />

          {/* Zoom & Page Actions */}
          <Box
            onMouseDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              px: 2, py: 0.5, gap: 1 }}
          >
            <Typography variant="body2" sx={{ flex: 1, color: '#e6e9f5', fontSize: 13 }}>Zoom</Typography>
            <Tooltip title="Zoom out">
              <IconButton size="small" onClick={() => handleZoom('out')} sx={{ color: '#9aa3c7' }}>
                <ZoomOutIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Box
              onClick={() => handleZoom('reset')}
              sx={{
                minWidth: 42, px: 0.75, py: 0.25, textAlign: 'center', cursor: 'pointer',
                borderRadius: 1, fontSize: 12, color: 'text.secondary',
                '&:hover': { background: 'rgba(255,255,255,0.06)' },
              }}
            >
              {zoomPct}%
            </Box>
            <Tooltip title="Zoom in">
              <IconButton size="small" onClick={() => handleZoom('in')} sx={{ color: '#9aa3c7' }}>
                <ZoomInIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="Fullscreen">
              <IconButton size="small" sx={{ color: '#9aa3c7' }} onClick={handleAction(() => {
                if (document.fullscreenElement) document.exitFullscreen();
                else document.documentElement.requestFullscreen?.();
              })}>
                <ZoomOutMapIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>

          <ListItemButton onClick={handleFind}>
            <ListItemIcon sx={{ minWidth: 32 }}><FindInPageIcon fontSize="small" /></ListItemIcon>
            <ListItemText primary="Find in page…" />
            <Typography variant="caption" sx={{ color: 'text.secondary', ml: 2 }}>Ctrl+F</Typography>
          </ListItemButton>

          <ListItemButton onClick={handleAction(() => api?.browser?.savePage?.())}>
            <ListItemIcon sx={{ minWidth: 32 }}><SaveAltIcon fontSize="small" /></ListItemIcon>
            <ListItemText primary="Save page as…" />
            <Typography variant="caption" sx={{ color: 'text.secondary', ml: 2 }}>Ctrl+S</Typography>
          </ListItemButton>

          <ListItemButton onClick={handleAction(() => api?.browser?.print?.())}>
            <ListItemIcon sx={{ minWidth: 32 }}><PrintIcon fontSize="small" /></ListItemIcon>
            <ListItemText primary="Print…" />
            <Typography variant="caption" sx={{ color: 'text.secondary', ml: 2 }}>Ctrl+P</Typography>
          </ListItemButton>

          <Divider sx={{ my: 0.5, borderColor: 'rgba(255,255,255,0.06)' }} />

          {/* Footer actions */}
          <ListItemButton onClick={handleOpenNav('settings')}>
            <ListItemIcon sx={{ minWidth: 32 }}><SettingsIcon fontSize="small" /></ListItemIcon>
            <ListItemText primary="Settings" />
          </ListItemButton>

          <ListItemButton onClick={handleAction(() => onOpen?.('home'))}>
            <ListItemIcon sx={{ minWidth: 32 }}><HomeIcon fontSize="small" /></ListItemIcon>
            <ListItemText primary="New tab page" />
          </ListItemButton>

          <ListItemButton onClick={() => { onClose?.(); onOpen?.('https://github.com/SaiRithvik-0408/SMART-BROWSER'); }}>
            <ListItemIcon sx={{ minWidth: 32 }}><OpenInNewIcon fontSize="small" /></ListItemIcon>
            <ListItemText primary="SmartBrowser on GitHub" />
          </ListItemButton>

          <ListItemButton onClick={handleAction(() => window.close())}>
            <ListItemIcon sx={{ minWidth: 32 }}><LogoutIcon fontSize="small" /></ListItemIcon>
            <ListItemText primary="Exit" />
          </ListItemButton>
        </List>
      </Box>
    </Box>
  );
}
