import React, { useEffect, useState } from 'react';
import {
  Box, Typography, Stack, Switch, FormControlLabel, Divider,
  Select, MenuItem, FormControl, InputLabel, Button, Alert, Chip,
  TextField, IconButton, InputAdornment, Link,
} from '@mui/material';
import SettingsIcon from '@mui/icons-material/Settings';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import DashboardCustomizeIcon from '@mui/icons-material/DashboardCustomize';
import SaveIcon from '@mui/icons-material/Save';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditIcon from '@mui/icons-material/Edit';
import {
  loadLayouts, saveCurrentToSlot, applySlot, clearSlot, renameSlot,
  MAX_LAYOUT_SLOTS,
  getCurrentGridCols, setCurrentGridCols,
  GRID_COL_MIN, GRID_COL_MAX, GRID_COL_PRESETS,
} from '../lib/layouts';

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

// =========================================================================
// LayoutsManager — 3 saved layout slots ("themes") for the home dashboard.
// Each slot snapshots the current widgets + grid column count and can be
// re-applied at any time. Empty slots show a "Save current dashboard"
// button; populated slots show Apply / Rename / Delete plus a relative
// timestamp.
// =========================================================================
function fmtAge(ts) {
  if (!ts) return '';
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60)     return 'just now';
  if (s < 3600)   return `${Math.floor(s / 60)}m ago`;
  if (s < 86400)  return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function LayoutsManager() {
  const [layouts, setLayouts] = useState(() => loadLayouts());
  const [renameIdx, setRenameIdx] = useState(-1);
  const [renameVal, setRenameVal] = useState('');
  const [toast, setToast] = useState('');

  const refresh = () => setLayouts(loadLayouts());
  const flash = (msg) => { setToast(msg); setTimeout(() => setToast(''), 1500); };

  const onSave = (idx) => {
    const existing = layouts[idx];
    const defaultName = existing?.name || `Layout ${idx + 1}`;
    const name = window.prompt('Name this layout:', defaultName);
    if (name === null) return;        // user cancelled
    saveCurrentToSlot(idx, name.trim() || defaultName);
    refresh();
    flash('Layout saved');
  };
  const onApply = (idx) => {
    if (applySlot(idx)) flash('Layout applied — open the new-tab page to see it');
    else flash("Couldn't apply this layout");
  };
  const onDelete = (idx) => {
    if (!window.confirm('Delete this saved layout? This cannot be undone.')) return;
    clearSlot(idx);
    refresh();
  };
  const startRename = (idx) => {
    setRenameIdx(idx);
    setRenameVal(layouts[idx]?.name || `Layout ${idx + 1}`);
  };
  const commitRename = () => {
    if (renameIdx >= 0) { renameSlot(renameIdx, renameVal.trim()); refresh(); }
    setRenameIdx(-1); setRenameVal('');
  };

  return (
    <Stack spacing={1.5}>
      <Typography sx={{ fontSize: 12, color: '#9aa3c7' }}>
        Save up to {MAX_LAYOUT_SLOTS} dashboard layouts (positions, sizes, and
        chosen widgets) and switch between them like phone home-screen themes.
        The current dashboard is what gets saved when you click <strong>Save</strong>.
      </Typography>
      {Array.from({ length: MAX_LAYOUT_SLOTS }).map((_, idx) => {
        const slot = layouts[idx];
        const empty = !slot;
        return (
          <Box key={idx} sx={{
            display: 'flex', alignItems: 'center', gap: 1.5, p: 1.25,
            borderRadius: 1.5, border: `1px solid ${empty ? 'rgba(255,255,255,0.08)' : 'rgba(167,139,250,0.30)'}`,
            background: empty ? 'rgba(255,255,255,0.02)' : 'rgba(167,139,250,0.05)',
          }}>
            <Box sx={{
              width: 32, height: 32, borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: empty ? 'rgba(255,255,255,0.06)' : 'rgba(167,139,250,0.18)',
              color: empty ? '#5b6385' : '#a78bfa', fontWeight: 700, fontSize: 14,
              flexShrink: 0,
            }}>{idx + 1}</Box>

            <Box sx={{ flex: 1, minWidth: 0 }}>
              {renameIdx === idx ? (
                <TextField
                  size="small" autoFocus fullWidth value={renameVal}
                  onChange={(e) => setRenameVal(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitRename();
                    else if (e.key === 'Escape') { setRenameIdx(-1); setRenameVal(''); }
                  }}
                  onBlur={commitRename}
                  inputProps={{ maxLength: 40 }}
                />
              ) : (
                <>
                  <Typography sx={{ fontWeight: 600, color: empty ? '#7a82a8' : '#e6e9f5', fontSize: 14 }}>
                    {empty ? `Empty slot ${idx + 1}` : slot.name}
                  </Typography>
                  {!empty && (
                    <Typography sx={{ fontSize: 11, color: '#7a82a8' }}>
                      {slot.widgets?.length || 0} widgets · {slot.gridCols} cols · saved {fmtAge(slot.savedAt)}
                    </Typography>
                  )}
                </>
              )}
            </Box>

            <Stack direction="row" spacing={0.5}>
              {!empty && (
                <>
                  <Button size="small" startIcon={<PlayArrowIcon />} onClick={() => onApply(idx)}
                    sx={{ color: '#a78bfa', minWidth: 0 }}>Apply</Button>
                  <IconButton size="small" onClick={() => startRename(idx)} title="Rename">
                    <EditIcon fontSize="small" />
                  </IconButton>
                  <IconButton size="small" onClick={() => onDelete(idx)} title="Delete">
                    <DeleteOutlineIcon fontSize="small" />
                  </IconButton>
                </>
              )}
              <Button size="small" startIcon={<SaveIcon />} onClick={() => onSave(idx)}
                variant={empty ? 'outlined' : 'text'}
                sx={{ minWidth: 0, color: empty ? '#7aa2ff' : '#9aa3c7' }}>
                {empty ? 'Save current' : 'Overwrite'}
              </Button>
            </Stack>
          </Box>
        );
      })}
      {toast && (
        <Alert severity="success" sx={{ fontSize: 12, py: 0 }}>{toast}</Alert>
      )}
    </Stack>
  );
}

// =========================================================================
// GridColsPicker — used to live in the dashboard header but the user
// wanted the new-tab page kept clean and the option moved into Settings.
// Presets + custom input, applied via setCurrentGridCols which writes to
// localStorage AND fires LAYOUT_CHANGED so a mounted dashboard updates
// in-place.
// =========================================================================
function GridColsPicker() {
  const [cols, setCols] = useState(() => getCurrentGridCols());
  const [custom, setCustom] = useState(String(cols));

  const apply = (n) => {
    const next = setCurrentGridCols(n);
    setCols(next);
    setCustom(String(next));
  };

  return (
    <Stack spacing={1.5}>
      <Typography sx={{ fontSize: 12, color: '#9aa3c7' }}>
        Number of vertical cells the dashboard is divided into. A 1×1 widget
        is always twice as wide as it is tall, so picking 4 cols gives you
        4 wide cells across the screen, picking 30 cols gives you 30 narrow
        cells. Heights stay proportional automatically.
      </Typography>

      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
        {GRID_COL_PRESETS.map((n) => (
          <Button
            key={n} size="small" variant={cols === n ? 'contained' : 'outlined'}
            onClick={() => apply(n)}
            sx={{
              minWidth: 56, fontFamily: 'ui-monospace, monospace', fontSize: 12,
              ...(cols === n ? { background: '#a78bfa', color: '#0a0e22',
                '&:hover': { background: '#a78bfa' } } : {}),
            }}
          >
            {n} cols
          </Button>
        ))}
      </Box>

      <Stack direction="row" spacing={1} alignItems="center">
        <Typography sx={{ fontSize: 12, color: '#9aa3c7', minWidth: 64 }}>Custom:</Typography>
        <TextField
          size="small" type="number"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') apply(custom); }}
          inputProps={{ min: GRID_COL_MIN, max: GRID_COL_MAX, style: { width: 80 } }}
          helperText={`${GRID_COL_MIN}–${GRID_COL_MAX}`}
          FormHelperTextProps={{ sx: { fontSize: 10, mx: 0 } }}
        />
        <Button size="small" variant="outlined" onClick={() => apply(custom)}>Apply</Button>
        <Box sx={{ flex: 1 }} />
        <Chip size="small" label={`Currently: ${cols} cols`} sx={{ height: 22, fontSize: 11 }} />
      </Stack>
    </Stack>
  );
}

function AiKeyField({ label, placeholder, value, visible, onToggle, onChange, helpLink }) {
  return (
    <Box>
      <TextField
        size="small" fullWidth
        label={label}
        placeholder={placeholder}
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        InputProps={{
          endAdornment: (
            <InputAdornment position="end">
              <IconButton size="small" onClick={onToggle} edge="end">
                {visible ? <VisibilityOffIcon fontSize="small" /> : <VisibilityIcon fontSize="small" />}
              </IconButton>
            </InputAdornment>
          ),
        }}
      />
      {helpLink && (
        <Typography sx={{ fontSize: 11, color: '#9aa3c7', mt: 0.5 }}>
          <Link href={helpLink.href} target="_blank" rel="noopener" sx={{ color: '#7aa2ff' }}>
            {helpLink.label} ↗
          </Link>
        </Typography>
      )}
    </Box>
  );
}

export default function SettingsPage() {
  const [s, setS] = useState(null);
  const [adblockStats, setAdblockStats] = useState(null);
  const [version, setVersion] = useState('');
  const [updateInfo, setUpdateInfo] = useState(null);
  const [checking, setChecking] = useState(false);
  const [showKey, setShowKey] = useState({ openai: false, gemini: false, anthropic: false });

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
        <FormControl fullWidth size="small" sx={{ mb: 2 }}>
          <InputLabel id="default-ai-label">Default AI assistant</InputLabel>
          <Select
            labelId="default-ai-label" label="Default AI assistant"
            value={s.defaultAI}
            onChange={(e) => update({ defaultAI: e.target.value })}
          >
            {AI_OPTIONS.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
          </Select>
        </FormControl>

        <Typography sx={{ fontSize: 12, color: '#9aa3c7', mb: 1.5 }}>
          Add API keys to make the AI widget answer questions inline. Without a
          key, the widget will just open the provider's website with your
          prompt pre-filled where possible. Keys are stored locally in
          <code> userData/sb-store/settings.json</code>.
        </Typography>

        <Stack spacing={1.5}>
          <AiKeyField
            label="OpenAI API key"
            placeholder="sk-..."
            value={s.aiKeys?.openai || ''}
            visible={showKey.openai}
            onToggle={() => setShowKey((k) => ({ ...k, openai: !k.openai }))}
            onChange={(v) => update({ aiKeys: { ...(s.aiKeys || {}), openai: v } })}
            helpLink={{ href: 'https://platform.openai.com/api-keys', label: 'Get an OpenAI key' }}
          />
          <FormControl size="small" sx={{ maxWidth: 280 }}>
            <InputLabel>OpenAI model</InputLabel>
            <Select
              label="OpenAI model"
              value={s.aiModels?.openai || 'gpt-4o-mini'}
              onChange={(e) => update({ aiModels: { ...(s.aiModels || {}), openai: e.target.value } })}
            >
              <MenuItem value="gpt-4o-mini">gpt-4o-mini (fast, cheap)</MenuItem>
              <MenuItem value="gpt-4o">gpt-4o (smart)</MenuItem>
              <MenuItem value="gpt-4-turbo">gpt-4-turbo</MenuItem>
              <MenuItem value="gpt-3.5-turbo">gpt-3.5-turbo (cheapest)</MenuItem>
            </Select>
          </FormControl>

          <Divider sx={{ my: 0.5 }} />

          <AiKeyField
            label="Google Gemini API key"
            placeholder="AIza..."
            value={s.aiKeys?.gemini || ''}
            visible={showKey.gemini}
            onToggle={() => setShowKey((k) => ({ ...k, gemini: !k.gemini }))}
            onChange={(v) => update({ aiKeys: { ...(s.aiKeys || {}), gemini: v } })}
            helpLink={{ href: 'https://aistudio.google.com/app/apikey', label: 'Get a Gemini key (free tier)' }}
          />
          <FormControl size="small" sx={{ maxWidth: 280 }}>
            <InputLabel>Gemini model</InputLabel>
            <Select
              label="Gemini model"
              value={s.aiModels?.gemini || 'gemini-1.5-flash'}
              onChange={(e) => update({ aiModels: { ...(s.aiModels || {}), gemini: e.target.value } })}
            >
              <MenuItem value="gemini-1.5-flash">gemini-1.5-flash (fast)</MenuItem>
              <MenuItem value="gemini-1.5-pro">gemini-1.5-pro</MenuItem>
              <MenuItem value="gemini-2.0-flash-exp">gemini-2.0-flash-exp</MenuItem>
            </Select>
          </FormControl>

          <Divider sx={{ my: 0.5 }} />

          <AiKeyField
            label="Anthropic Claude API key"
            placeholder="sk-ant-..."
            value={s.aiKeys?.anthropic || ''}
            visible={showKey.anthropic}
            onToggle={() => setShowKey((k) => ({ ...k, anthropic: !k.anthropic }))}
            onChange={(v) => update({ aiKeys: { ...(s.aiKeys || {}), anthropic: v } })}
            helpLink={{ href: 'https://console.anthropic.com/settings/keys', label: 'Get an Anthropic key' }}
          />
          <Alert severity="info" sx={{ fontSize: 12 }}>
            Anthropic doesn't allow direct browser API calls today, so Claude
            will fall back to opening claude.ai. Use OpenAI or Gemini for
            inline answers in the widget.
          </Alert>
        </Stack>
      </Section>

      <Section title="Dashboard">
        <GridColsPicker />
      </Section>

      <Section title="Dashboard Layouts">
        <LayoutsManager />
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
