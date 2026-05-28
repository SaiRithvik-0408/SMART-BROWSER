import React, { useEffect, useState } from 'react';
import {
  Box, Typography, Stack, Button, IconButton, Switch, Chip, Alert,
  Divider, Tooltip, Snackbar, CircularProgress, Link,
} from '@mui/material';
import ExtensionIcon from '@mui/icons-material/Extension';
import DeleteIcon from '@mui/icons-material/Delete';
import RefreshIcon from '@mui/icons-material/Refresh';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import FileUploadIcon from '@mui/icons-material/FileUpload';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';

const api = typeof window !== 'undefined' ? window.smartBrowserAPI : null;

export default function ExtensionsPage({ onOpen }) {
  const [exts, setExts]   = useState(null);
  const [busy, setBusy]   = useState(false);
  const [toast, setToast] = useState('');
  const [error, setError] = useState('');

  const refresh = async () => {
    if (!api?.extensions) { setExts([]); return; }
    setExts(await api.extensions.list());
  };
  useEffect(() => { refresh(); }, []);

  const wrap = async (label, fn) => {
    setBusy(true); setError('');
    try {
      const res = await fn();
      if (res?.canceled) return;
      if (res?.error)    { setError(res.error); return; }
      setToast(label);
      await refresh();
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const installFolder = () => wrap('Extension installed',
    () => api.extensions.installFolder());
  const installCrx = () => wrap('Extension installed',
    () => api.extensions.installCrx());
  const remove = (id, name) => async () => {
    if (!confirm(`Remove "${name}"? This deletes it from disk.`)) return;
    await wrap('Extension removed', () => api.extensions.remove(id));
  };
  const toggle = (id, next) => async () => {
    await wrap(next ? 'Extension enabled' : 'Extension disabled',
      () => api.extensions.setEnabled(id, next));
  };

  if (!api?.extensions) {
    return (
      <Box sx={{ p: 4, maxWidth: 800, mx: 'auto', color: '#e6e9f5' }}>
        <Alert severity="warning">
          Chrome extensions are only available in the desktop build.
        </Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 4, maxWidth: 900, mx: 'auto', color: '#e6e9f5' }}>
      <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 3 }}>
        <ExtensionIcon sx={{ fontSize: 32, color: '#7aa2ff' }} />
        <Typography variant="h4" sx={{ fontWeight: 700, flex: 1 }}>Extensions</Typography>
        <Tooltip title="Refresh">
          <IconButton onClick={refresh} disabled={busy}><RefreshIcon /></IconButton>
        </Tooltip>
      </Stack>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 3 }}>
        <Button variant="contained" startIcon={<FolderOpenIcon />} disabled={busy}
          onClick={installFolder}>
          Load unpacked folder
        </Button>
        <Button variant="outlined" startIcon={<FileUploadIcon />} disabled={busy}
          onClick={installCrx}>
          Install from .crx file
        </Button>
        {busy && <CircularProgress size={20} sx={{ alignSelf: 'center', ml: 1 }} />}
      </Stack>

      <Alert severity="info" icon={<InfoOutlinedIcon />} sx={{ mb: 3 }}>
        SmartBrowser supports most Chrome extensions via Electron's built-in
        Chromium engine. Toolbar popups (Chrome's puzzle-piece icon) aren't
        rendered yet, but content scripts and background service workers run
        normally — so ad-blockers, password managers, dark-mode injectors,
        and most utility extensions work. To install a Chrome Web Store
        extension, download its .crx using a CRX downloader site and pick
        "Install from .crx file".
      </Alert>

      {error && (
        <Alert severity="error" onClose={() => setError('')} sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Typography sx={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 2,
        color: '#7aa2ff', mb: 1.5 }}>
        Installed {exts ? `(${exts.length})` : ''}
      </Typography>
      <Box sx={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 2,
        background: 'rgba(8,9,14,0.6)' }}>
        {!exts && (
          <Box sx={{ p: 3, textAlign: 'center', color: '#9aa3c7' }}>
            <CircularProgress size={18} sx={{ mr: 1 }} /> Loading…
          </Box>
        )}
        {exts && exts.length === 0 && (
          <Box sx={{ p: 4, textAlign: 'center', color: '#9aa3c7' }}>
            <Typography>No extensions installed yet.</Typography>
            <Typography sx={{ fontSize: 12, mt: 1 }}>
              Click "Load unpacked folder" to install one from disk, or
              "Install from .crx file" to install a Chrome Web Store package.
            </Typography>
          </Box>
        )}
        {exts && exts.map((x, i) => (
          <Box key={x.id}>
            {i > 0 && <Divider sx={{ borderColor: 'rgba(255,255,255,0.05)' }} />}
            <Stack direction="row" alignItems="center" spacing={2} sx={{ p: 2 }}>
              <Box sx={{
                width: 44, height: 44, borderRadius: 1.5, flexShrink: 0,
                background: 'rgba(122,162,255,0.1)', display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                border: '1px solid rgba(122,162,255,0.25)',
              }}>
                <ExtensionIcon sx={{ fontSize: 22, color: '#7aa2ff' }} />
              </Box>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Stack direction="row" alignItems="center" spacing={1}>
                  <Typography sx={{ fontWeight: 600 }}>{x.name}</Typography>
                  <Chip size="small" label={`v${x.version || '?'}`} sx={{ height: 18, fontSize: 10 }} />
                  <Chip size="small" label={`MV${x.manifestVersion}`}
                    sx={{ height: 18, fontSize: 10,
                      background: x.manifestVersion === 3 ? 'rgba(52,211,153,0.15)' : 'rgba(251,191,36,0.15)',
                      color: x.manifestVersion === 3 ? '#34d399' : '#fbbf24' }} />
                  {!x.enabled && <Chip size="small" label="DISABLED" color="default" sx={{ height: 18, fontSize: 10 }} />}
                </Stack>
                {x.description && (
                  <Typography sx={{ fontSize: 12, color: '#9aa3c7', mt: 0.5,
                    overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical' }}>
                    {x.description}
                  </Typography>
                )}
                <Typography sx={{ fontSize: 10, color: '#5b6385', mt: 0.5, fontFamily: 'monospace' }}>
                  ID: {x.id}
                </Typography>
              </Box>
              <Tooltip title={x.enabled ? 'Disable' : 'Enable'}>
                <Switch checked={x.enabled} onChange={toggle(x.id, !x.enabled)} disabled={busy} />
              </Tooltip>
              <Tooltip title="Remove">
                <IconButton onClick={remove(x.id, x.name)} disabled={busy} sx={{ color: '#ef4444' }}>
                  <DeleteIcon />
                </IconButton>
              </Tooltip>
            </Stack>
          </Box>
        ))}
      </Box>

      <Typography sx={{ fontSize: 11, color: '#5b6385', mt: 3 }}>
        Extensions are stored in your user data folder under{' '}
        <code>sb-extensions/</code>. They load into the same browsing session
        that the VPN, ad blocker, and downloads use, so they affect all tabs.
      </Typography>

      <Snackbar open={!!toast} autoHideDuration={2000} onClose={() => setToast('')}
        message={toast} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }} />
    </Box>
  );
}
