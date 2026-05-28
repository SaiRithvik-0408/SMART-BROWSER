import React, { useEffect, useState } from 'react';
import {
  Box, Typography, Stack, Switch, FormControlLabel, Divider,
  Select, MenuItem, FormControl, InputLabel, Button, Alert, Chip,
} from '@mui/material';
import SettingsIcon from '@mui/icons-material/Settings';
import RestartAltIcon from '@mui/icons-material/RestartAlt';

const api = typeof window !== 'undefined' ? window.smartBrowserAPI : null;

const SEARCH_OPTIONS = [
  { value: 'duckduckgo', label: 'DuckDuckGo' },
  { value: 'google',     label: 'Google' },
  { value: 'brave',      label: 'Brave Search' },
  { value: 'bing',       label: 'Bing' },
  { value: 'startpage',  label: 'Startpage' },
];

const AI_OPTIONS = [
  { value: 'chatgpt', label: 'ChatGPT' },
  { value: 'gemini',  label: 'Gemini' },
  { value: 'claude',  label: 'Claude' },
];

export default function SettingsPage() {
  const [s, setS] = useState(null);
  const [adblockStats, setAdblockStats] = useState(null);
  const [version, setVersion] = useState('');
  const [updateInfo, setUpdateInfo] = useState(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    (async () => {
      if (api?.settings) setS(await api.settings.get());
      if (api?.adblock)  setAdblockStats(await api.adblock.stats());
      if (api?.version)  setVersion(await api.version());
    })();
  }, []);

  if (!s) {
    return <Box sx={{ p: 4, color: '#9aa3c7' }}>Loading settings...</Box>;
  }

  const update = async (patch) => {
    const next = await api.settings.set(patch);
    setS(next);
    if ('adblockEnabled' in patch && api?.adblock) {
      setAdblockStats(await api.adblock.stats());
    }
  };

  const checkUpdate = async () => {
    setChecking(true);
    try { setUpdateInfo(await api.updates.check()); }
    finally { setChecking(false); }
  };
  const applyUpdate = () => api.updates.apply();

  const Section = ({ title, children }) => (
    <Box sx={{ mb: 4 }}>
      <Typography sx={{
        fontSize: 12, textTransform: 'uppercase', letterSpacing: 2,
        color: '#7aa2ff', mb: 1.5,
      }}>{title}</Typography>
      <Box sx={{
        p: 2.5, border: '1px solid rgba(255,255,255,0.08)', borderRadius: 2,
        background: 'rgba(8,9,14,0.6)',
      }}>{children}</Box>
    </Box>
  );

  return (
    <Box sx={{ p: 4, maxWidth: 800, mx: 'auto', color: '#e6e9f5' }}>
      <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 3 }}>
        <SettingsIcon sx={{ fontSize: 32, color: '#a78bfa' }} />
        <Typography variant="h4" sx={{ fontWeight: 700, flex: 1 }}>Settings</Typography>
      </Stack>

      <Section title="Search">
        <FormControl fullWidth size="small">
          <InputLabel id="search-engine-label">Default search engine</InputLabel>
          <Select
            labelId="search-engine-label" label="Default search engine"
            value={s.searchEngine}
            onChange={(e) => update({ searchEngine: e.target.value })}
          >
            {SEARCH_OPTIONS.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
          </Select>
        </FormControl>
      </Section>

      <Section title="Privacy & Security">
        <Stack spacing={1.5}>
          <FormControlLabel
            control={<Switch checked={s.adblockEnabled} onChange={(e) => update({ adblockEnabled: e.target.checked })} />}
            label={
              <span>
                Block ads &amp; trackers
                {adblockStats && (
                  <Chip size="small" label={`${adblockStats.blocked} blocked`} sx={{ ml: 1, height: 20, fontSize: 11 }} />
                )}
              </span>
            }
          />
          <FormControlLabel
            control={<Switch checked={s.historyEnabled} onChange={(e) => update({ historyEnabled: e.target.checked })} />}
            label="Record browsing history"
          />
        </Stack>
      </Section>

      <Section title="New tab page">
        <Stack spacing={1}>
          <FormControlLabel
            control={<Switch checked={s.showFavorites} onChange={(e) => update({ showFavorites: e.target.checked })} />}
            label="Show favorites bar"
          />
          <FormControlLabel
            control={<Switch checked={s.showWidgets} onChange={(e) => update({ showWidgets: e.target.checked })} />}
            label="Show widgets dashboard"
          />
          <FormControlLabel
            control={<Switch checked={s.showNews} onChange={(e) => update({ showNews: e.target.checked })} />}
            label="Show Economic Times news feed"
          />
        </Stack>
      </Section>

      <Section title="AI">
        <FormControl fullWidth size="small">
          <InputLabel id="default-ai-label">Default AI assistant</InputLabel>
          <Select
            labelId="default-ai-label" label="Default AI assistant"
            value={s.defaultAI}
            onChange={(e) => update({ defaultAI: e.target.value })}
          >
            {AI_OPTIONS.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
          </Select>
        </FormControl>
        <Typography sx={{ mt: 1, fontSize: 12, color: '#9aa3c7' }}>
          Used by the AI widget and the Ask AI shortcut. You stay signed in via the
          AI service's own website — SmartBrowser doesn't store API keys.
        </Typography>
      </Section>

      <Section title="About">
        <Stack spacing={1}>
          <Stack direction="row" spacing={2} alignItems="center">
            <Typography sx={{ color: '#9aa3c7' }}>Version</Typography>
            <Chip size="small" label={version || '...'} />
            <Box sx={{ flex: 1 }} />
            <Button
              size="small" variant="outlined" startIcon={<RestartAltIcon />}
              disabled={checking} onClick={checkUpdate}
            >
              {checking ? 'Checking...' : 'Check for updates'}
            </Button>
          </Stack>
          {updateInfo && updateInfo.available && (
            <Alert severity="info" action={<Button size="small" onClick={applyUpdate}>Update now</Button>}>
              v{updateInfo.latest} is available (you have v{updateInfo.current}).
            </Alert>
          )}
          {updateInfo && !updateInfo.available && !updateInfo.error && (
            <Alert severity="success">You're on the latest version.</Alert>
          )}
          {updateInfo?.error && (
            <Alert severity="warning">Couldn't check: {updateInfo.error}</Alert>
          )}
        </Stack>
      </Section>
    </Box>
  );
}
