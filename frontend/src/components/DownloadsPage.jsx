import React, { useEffect, useState } from 'react';
import {
  Box, Typography, Stack, Button, IconButton, Tooltip,
  LinearProgress, Chip,
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import PauseIcon from '@mui/icons-material/Pause';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import CancelIcon from '@mui/icons-material/Cancel';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import DeleteIcon from '@mui/icons-material/Delete';
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep';

const api = typeof window !== 'undefined' ? window.smartBrowserAPI : null;

function fmtBytes(n) {
  if (!n || n < 0) return '—';
  const u = ['B', 'KB', 'MB', 'GB'];
  let v = n, i = 0;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v >= 100 ? 0 : 1)} ${u[i]}`;
}
function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}
function stateChip(state) {
  const colour = {
    progressing: 'info',
    completed:   'success',
    cancelled:   'warning',
    interrupted: 'error',
  }[state] || 'default';
  return <Chip size="small" label={state} color={colour} sx={{ height: 20, fontSize: 11, textTransform: 'capitalize' }} />;
}

export default function DownloadsPage() {
  const [items, setItems] = useState([]);

  const reload = async () => { if (api?.downloads) setItems(await api.downloads.list()); };
  useEffect(() => {
    reload();
    if (!api?.downloads) return;
    const offAdd = api.downloads.onAdded((it) => setItems((prev) => [it, ...prev]));
    const offUpd = api.downloads.onUpdated((next) =>
      setItems((prev) => prev.map((it) => it.id === next.id ? { ...it, ...next } : it))
    );
    return () => { offAdd && offAdd(); offUpd && offUpd(); };
  }, []);

  const pause   = (id) => api?.downloads?.pause(id).then(reload);
  const resume  = (id) => api?.downloads?.resume(id).then(reload);
  const cancel  = (id) => api?.downloads?.cancel(id).then(reload);
  const open    = (id) => api?.downloads?.open(id);
  const show    = (id) => api?.downloads?.show(id);
  const remove  = (id) => api?.downloads?.remove(id).then(reload);
  const clear   = ()   => api?.downloads?.clear().then(reload);

  return (
    <Box sx={{ p: 2.5, width: '100%', color: '#e6e9f5' }}>
      <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 3 }}>
        <DownloadIcon sx={{ fontSize: 32, color: '#34d399' }} />
        <Typography variant="h4" sx={{ fontWeight: 700, flex: 1 }}>Downloads</Typography>
        {items.length > 0 && (
          <Button variant="outlined" size="small" color="error" startIcon={<DeleteSweepIcon />} onClick={clear}>
            Clear list
          </Button>
        )}
      </Stack>

      {items.length === 0 && (
        <Typography sx={{ color: '#9aa3c7', textAlign: 'center', mt: 8 }}>
          No downloads yet.
        </Typography>
      )}

      <Stack spacing={1.5}>
        {items.map((it) => {
          const pct = it.totalBytes > 0 ? (it.receivedBytes / it.totalBytes) * 100 : 0;
          const isLive = it.state === 'progressing';
          return (
            <Box key={it.id} sx={{
              p: 2, border: '1px solid rgba(255,255,255,0.08)', borderRadius: 2,
              background: 'rgba(8,9,14,0.6)',
            }}>
              <Stack direction="row" alignItems="center" spacing={1.5}>
                <InsertDriveFileIcon sx={{ color: '#7aa2ff', flexShrink: 0 }} />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography noWrap sx={{ fontWeight: 600 }} title={it.filename}>{it.filename}</Typography>
                  <Typography noWrap sx={{ fontSize: 12, color: '#9aa3c7' }}>
                    {hostOf(it.url)} {it.savePath ? `\u2014 ${it.savePath}` : ''}
                  </Typography>
                </Box>
                {stateChip(it.state)}
              </Stack>
              {(isLive || it.totalBytes > 0) && (
                <Box sx={{ mt: 1 }}>
                  <LinearProgress
                    variant={isLive && it.totalBytes > 0 ? 'determinate' : (isLive ? 'indeterminate' : 'determinate')}
                    value={pct} sx={{ height: 4, borderRadius: 2 }}
                  />
                  <Typography sx={{ fontSize: 11, color: '#9aa3c7', mt: 0.5 }}>
                    {fmtBytes(it.receivedBytes)} of {fmtBytes(it.totalBytes)} {isLive && it.totalBytes > 0 ? `(${pct.toFixed(0)}%)` : ''}
                  </Typography>
                </Box>
              )}
              <Stack direction="row" spacing={0.5} sx={{ mt: 1 }}>
                {isLive && !it.isPaused && (
                  <Tooltip title="Pause"><IconButton size="small" onClick={() => pause(it.id)}><PauseIcon fontSize="small" /></IconButton></Tooltip>
                )}
                {isLive && it.isPaused && (
                  <Tooltip title="Resume"><IconButton size="small" onClick={() => resume(it.id)}><PlayArrowIcon fontSize="small" /></IconButton></Tooltip>
                )}
                {isLive && (
                  <Tooltip title="Cancel"><IconButton size="small" onClick={() => cancel(it.id)}><CancelIcon fontSize="small" /></IconButton></Tooltip>
                )}
                {it.state === 'completed' && (
                  <>
                    <Tooltip title="Open file"><IconButton size="small" onClick={() => open(it.id)}><InsertDriveFileIcon fontSize="small" /></IconButton></Tooltip>
                    <Tooltip title="Show in folder"><IconButton size="small" onClick={() => show(it.id)}><FolderOpenIcon fontSize="small" /></IconButton></Tooltip>
                  </>
                )}
                <Box sx={{ flex: 1 }} />
                <Tooltip title="Remove from list">
                  <IconButton size="small" onClick={() => remove(it.id)}><DeleteIcon fontSize="small" /></IconButton>
                </Tooltip>
              </Stack>
            </Box>
          );
        })}
      </Stack>
    </Box>
  );
}
