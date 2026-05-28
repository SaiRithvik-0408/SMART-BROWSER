import React, { useEffect, useState } from 'react';
import { Box, Button, Typography, IconButton, LinearProgress, Stack } from '@mui/material';
import SystemUpdateAltIcon from '@mui/icons-material/SystemUpdateAlt';
import CloseIcon from '@mui/icons-material/Close';
import { AnimatePresence, motion } from 'framer-motion';

const api = typeof window !== 'undefined' ? window.smartBrowserAPI : null;
const inElectron = !!api?.isElectron;

export default function UpdateBanner() {
  const [info, setInfo] = useState(null);     // { available, latest, current, notes }
  const [state, setState] = useState('idle'); // idle | downloading | error
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!inElectron) return;
    const offAvail = api.updates.onAvailable((i) => { setInfo(i); setDismissed(false); });
    const offProg  = api.updates.onProgress((p) => setProgress(p));
    const offErr   = api.updates.onError((m) => { setState('error'); setError(m); });
    // Also do an immediate check in case the main-process auto-check already fired.
    api.updates.check().then((i) => { if (i?.available) setInfo(i); }).catch(() => {});
    return () => { offAvail?.(); offProg?.(); offErr?.(); };
  }, []);

  if (!inElectron || !info?.available || dismissed) return null;

  const startUpdate = async () => {
    setState('downloading');
    setProgress(0);
    setError('');
    try {
      await api.updates.apply();
      // On Windows the app quits + relaunches; this line may not be reached.
    } catch (e) {
      setState('error');
      setError(e?.message || 'Update failed');
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: -60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: -60, opacity: 0 }}
        style={{ position: 'relative', zIndex: 10 }}
      >
        <Box sx={{
          mx: 1, mb: 0.5, px: 2, py: 1,
          display: 'flex', alignItems: 'center', gap: 1.5, borderRadius: 3,
          background: 'linear-gradient(90deg, rgba(122,162,255,0.18), rgba(167,139,250,0.18))',
          border: '1px solid rgba(122,162,255,0.35)',
        }}>
          <SystemUpdateAltIcon sx={{ color: '#7aa2ff' }} />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="body2" sx={{ color: '#e6e9f5', fontWeight: 600 }}>
              {state === 'downloading'
                ? `Updating to v${info.latest}…`
                : state === 'error'
                  ? `Update failed`
                  : `SmartBrowser v${info.latest} is available`}
            </Typography>
            <Typography variant="caption" sx={{ color: '#9aa3c7' }}>
              {state === 'error'
                ? error
                : state === 'downloading'
                  ? 'Downloading — the app will restart automatically when ready.'
                  : `You're on v${info.current}. Click update to install automatically.`}
            </Typography>
            {state === 'downloading' && (
              <LinearProgress
                variant={progress > 0 ? 'determinate' : 'indeterminate'}
                value={progress}
                sx={{ mt: 0.75, borderRadius: 1, height: 5,
                  '& .MuiLinearProgress-bar': { background: 'linear-gradient(90deg,#7aa2ff,#a78bfa)' } }}
              />
            )}
          </Box>

          {state !== 'downloading' && (
            <Stack direction="row" spacing={1} alignItems="center">
              <Button
                size="small" variant="contained"
                onClick={startUpdate}
                sx={{ textTransform: 'none', fontWeight: 700,
                  background: 'linear-gradient(90deg,#7aa2ff,#a78bfa)' }}
              >
                {state === 'error' ? 'Retry' : 'Update now'}
              </Button>
              <IconButton size="small" onClick={() => setDismissed(true)} sx={{ color: '#9aa3c7' }}>
                <CloseIcon fontSize="small" />
              </IconButton>
            </Stack>
          )}
        </Box>
      </motion.div>
    </AnimatePresence>
  );
}
