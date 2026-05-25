import React, { useEffect, useState } from 'react';
import {
  Box, Paper, Typography, Stack, Switch, FormControlLabel, MenuItem,
  Select, Chip, Divider, Button, CircularProgress, Alert,
} from '@mui/material';
import ShieldIcon from '@mui/icons-material/Shield';
import PublicIcon from '@mui/icons-material/Public';
import BoltIcon from '@mui/icons-material/Bolt';
import RefreshIcon from '@mui/icons-material/Refresh';
import { VpnApi } from '../api/client';

export default function VpnPanel({ open, onClose }) {
  const [status, setStatus] = useState({});
  const [servers, setServers] = useState([]);
  const [selected, setSelected] = useState('');
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);

  const refresh = async () => {
    try {
      const [s, srv] = await Promise.all([VpnApi.status(), VpnApi.servers()]);
      setStatus(s);
      setServers(srv);
      if (!selected) setSelected(s.activeServer?.id || srv[0]?.id || '');
    } catch (e) { console.error(e); }
  };

  useEffect(() => {
    if (!open) return;
    // 1) Populate servers + status IMMEDIATELY so the dropdown isn't empty
    refresh();
    // 2) In the background, run the actual IP check (slow ~5-20s),
    //    then refresh again so the IP fields update.
    VpnApi.check().then(refresh).catch(() => {});
  }, [open]);

  const applyOsProxy = async (enabled) => {
    if (!window.smartBrowserAPI?.applyProxy) return;        // web mode = nothing to do
    const srv = servers.find((s) => s.id === selected);
    if (!srv) return;
    try {
      const r = await window.smartBrowserAPI.applyProxy({
        enabled,
        host: srv.host,
        port: srv.port,
        type: srv.type,
      });
      console.log('[OS proxy]', r);
    } catch (e) { console.error('[OS proxy]', e); }
  };

  const toggle = async (e) => {
    setLoading(true);
    try {
      if (e.target.checked) {
        await VpnApi.connect(selected);
        await applyOsProxy(true);            // route Chromium traffic too
      } else {
        await VpnApi.disconnect();
        await applyOsProxy(false);
      }
      await refresh();
    } finally { setLoading(false); }
  };

  const recheck = async () => {
    setChecking(true);
    try {
      await VpnApi.check();
      await refresh();
    } finally { setChecking(false); }
  };

  if (!open) return null;

  // "MASKED" requires *proof*: a tunneled IP that actually differs from the direct one.
  // Any earlier confusion (chip green + toggle off + no IPs) is now impossible.
  const haveProof = !!(status.visibleIp && status.visibleIpDirect
                        && status.visibleIp !== status.visibleIpDirect);
  const trulyMasked = status.enabled === true && haveProof;
  const userPressedConnect = status.desired === true;
  const noHost = userPressedConnect && status.configured === false;
  const unreachable = userPressedConnect && status.configured && !status.enabled;

  return (
    <Paper
      elevation={12}
      sx={{ position: 'absolute', top: 64, right: 16, width: 380, p: 2.5, zIndex: 30, borderRadius: 3 }}
    >
      <Stack direction="row" alignItems="center" spacing={1.5} mb={1.5}>
        <ShieldIcon color={trulyMasked ? 'success' : (userPressedConnect ? 'warning' : 'primary')} />
        <Typography variant="h6">SmartShield VPN</Typography>
        <Box flex={1} />
        <Chip
          size="small"
          color={trulyMasked ? 'success' : (userPressedConnect ? 'warning' : 'default')}
          label={trulyMasked ? 'MASKED' : userPressedConnect ? 'NOT MASKING' : 'OFF'}
        />
      </Stack>

      <FormControlLabel
        control={loading
          ? <CircularProgress size={20} sx={{ mx: 1.25 }} />
          : <Switch checked={userPressedConnect} onChange={toggle} />}
        label={trulyMasked
          ? 'Tunnel active — verified IP changed'
          : userPressedConnect
            ? 'Toggle ON but tunnel inactive (see warning below)'
            : 'Activate encrypted tunnel'}
      />

      {noHost && (
        <Alert severity="warning" sx={{ mt: 1.5 }}>
          This server has <b>no SOCKS host configured</b>. Traffic is going direct
          (no IP masking). Edit <code>backend-node/server.js</code> →
          <code> state.servers</code> and set a real <code>host</code> / <code>port</code>.
        </Alert>
      )}
      {unreachable && (
        <Alert severity="error" sx={{ mt: 1.5 }}>
          Could not reach the SOCKS endpoint at <code>{status.activeServer?.host}:{status.activeServer?.port}</code>.
          Either the proxy isn't running, the credentials are wrong, or the network blocks it.
        </Alert>
      )}

      <Divider sx={{ my: 2 }} />

      <Typography variant="caption" color="text.secondary">SERVER LOCATION</Typography>
      <Select
        fullWidth size="small"
        value={servers.length ? (selected || '') : '__loading'}
        displayEmpty
        onChange={(e) => setSelected(e.target.value)}
        sx={{ mt: 0.5 }}
        renderValue={(v) => {
          if (v === '__loading' || servers.length === 0) {
            return <Stack direction="row" alignItems="center" spacing={1}><CircularProgress size={14} /><span>Loading servers…</span></Stack>;
          }
          const s = servers.find((x) => x.id === v);
          if (!s) return 'Select a server';
          return (
            <Stack direction="row" alignItems="center" spacing={1}>
              <PublicIcon fontSize="small" />
              <Box flex={1}>{s.label}</Box>
              <Chip size="small" color={s.host ? 'default' : 'warning'}
                    label={s.host ? `${s.latencyMs}ms` : 'not configured'} />
            </Stack>
          );
        }}
      >
        {servers.length === 0 && (
          <MenuItem value="__loading" disabled>
            <CircularProgress size={14} sx={{ mr: 1 }} /> Loading servers…
          </MenuItem>
        )}
        {servers.map((s) => (
          <MenuItem key={s.id} value={s.id}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ width: '100%' }}>
              <PublicIcon fontSize="small" />
              <Box flex={1}>{s.label}</Box>
              <Chip
                size="small"
                color={s.host ? 'default' : 'warning'}
                label={s.host ? `${s.latencyMs}ms` : 'not configured'}
                icon={s.host ? <BoltIcon /> : undefined}
              />
            </Stack>
          </MenuItem>
        ))}
      </Select>

      <Stack direction="row" spacing={1} mt={2}>
        <Button variant="contained" fullWidth disabled={loading}
          onClick={async () => { setLoading(true); try { await VpnApi.connect(selected); await refresh(); } finally { setLoading(false); } }}>
          Connect
        </Button>
        <Button variant="outlined" fullWidth disabled={loading || !userPressedConnect}
          onClick={async () => { setLoading(true); try { await VpnApi.disconnect(); await refresh(); } finally { setLoading(false); } }}>
          Disconnect
        </Button>
      </Stack>

      <Divider sx={{ my: 2 }} />

      <Stack spacing={0.5}>
        <Row label="Your real (direct) IP" value={status.visibleIpDirect || '—'} />
        <Row label="Visible exit IP"
             value={status.visibleIp || '—'}
             good={trulyMasked} bad={userPressedConnect && !trulyMasked} />
        <Row label="Site masking" value="all URLs routed via SmartBrowser" good />
        <Row label="Tunnel health"
             value={status.health || 'idle'}
             good={status.health === 'ok'} bad={status.health === 'unreachable'} />
      </Stack>

      <Stack direction="row" spacing={1} mt={1.5}>
        <Button size="small" startIcon={checking ? <CircularProgress size={14} /> : <RefreshIcon />}
          onClick={recheck} disabled={checking}>
          Re-check IP
        </Button>
        <Box flex={1} />
        <Button size="small" onClick={onClose}>Close</Button>
      </Stack>
    </Paper>
  );
}

function Row({ label, value, good, bad }) {
  const color = good ? 'success.main' : bad ? 'error.main' : 'text.secondary';
  return (
    <Stack direction="row" justifyContent="space-between">
      <Typography variant="body2" color="text.secondary">{label}</Typography>
      <Typography variant="body2" color={color} sx={{ fontFamily: 'JetBrains Mono, monospace' }}>
        {String(value)}
      </Typography>
    </Stack>
  );
}
