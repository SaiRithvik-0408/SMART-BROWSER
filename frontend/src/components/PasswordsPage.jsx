import React, { useEffect, useState } from 'react';
import {
  Box, Typography, Stack, Button, IconButton, TextField, Dialog,
  DialogTitle, DialogContent, DialogActions, Tooltip, Alert,
  InputAdornment, List, ListItem, ListItemText, Divider,
} from '@mui/material';
import KeyIcon from '@mui/icons-material/Key';
import AddIcon from '@mui/icons-material/Add';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import SearchIcon from '@mui/icons-material/Search';

const api = typeof window !== 'undefined' ? window.smartBrowserAPI : null;

function hostOf(url) {
  try { return new URL(url.startsWith('http') ? url : 'https://' + url).hostname.replace(/^www\./, ''); }
  catch { return url; }
}

function PasswordDialog({ open, initial, onClose, onSave }) {
  const [site, setSite]         = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [notes, setNotes]       = useState('');
  const [reveal, setReveal]     = useState(false);

  useEffect(() => {
    setSite(initial?.site || '');
    setUsername(initial?.username || '');
    setPassword('');
    setNotes(initial?.notes || '');
    setReveal(false);
  }, [initial, open]);

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{initial?.id ? 'Edit entry' : 'New password'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField label="Site" placeholder="e.g. github.com" value={site} onChange={(e) => setSite(e.target.value)} autoFocus fullWidth />
          <TextField label="Username / email" value={username} onChange={(e) => setUsername(e.target.value)} fullWidth />
          <TextField
            label="Password"
            type={reveal ? 'text' : 'password'}
            value={password} onChange={(e) => setPassword(e.target.value)}
            placeholder={initial?.id ? '(leave blank to keep existing)' : ''}
            fullWidth
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton size="small" onClick={() => setReveal((v) => !v)}>
                    {reveal ? <VisibilityOffIcon /> : <VisibilityIcon />}
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />
          <TextField label="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} multiline rows={2} fullWidth />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          disabled={!site || !username || (!initial?.id && !password)}
          onClick={() => onSave({ id: initial?.id, site, username, password, notes })}
        >
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default function PasswordsPage({ onOpen }) {
  const [available, setAvailable] = useState(true);
  const [items, setItems]         = useState([]);
  const [query, setQuery]         = useState('');
  const [editing, setEditing]     = useState(null);
  const [open, setOpen]           = useState(false);
  const [revealed, setRevealed]   = useState({}); // id -> plaintext password (in memory only)
  const [err, setErr]             = useState('');

  const reload = async () => { if (api?.passwords) setItems(await api.passwords.list()); };
  useEffect(() => {
    (async () => {
      if (!api?.passwords) return;
      setAvailable(await api.passwords.available());
      reload();
    })();
  }, []);

  const filtered = items.filter((it) => {
    if (!query) return true;
    const q = query.toLowerCase();
    return it.site.toLowerCase().includes(q) || it.username.toLowerCase().includes(q);
  });

  const save = async ({ id, site, username, password, notes }) => {
    const res = await api.passwords.upsert({ id, site, username, password, notes });
    if (res.error) { setErr(res.error); return; }
    setErr('');
    setOpen(false); setEditing(null);
    reload();
  };
  const remove = async (id) => {
    if (!confirm('Delete this password?')) return;
    await api.passwords.remove(id);
    setRevealed((r) => { const { [id]: _, ...rest } = r; return rest; });
    reload();
  };
  const reveal = async (id) => {
    if (revealed[id]) {
      setRevealed((r) => { const { [id]: _, ...rest } = r; return rest; });
      return;
    }
    const res = await api.passwords.reveal(id);
    if (res.error) { setErr(res.error); return; }
    setRevealed((r) => ({ ...r, [id]: res.password }));
  };
  const copyPw = async (id) => {
    const res = await api.passwords.reveal(id);
    if (res.error) { setErr(res.error); return; }
    try { await navigator.clipboard.writeText(res.password); } catch {}
  };

  return (
    <Box sx={{ p: 2.5, width: '100%', color: '#e6e9f5' }}>
      <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 3 }}>
        <KeyIcon sx={{ fontSize: 32, color: '#fbbf24' }} />
        <Typography variant="h4" sx={{ fontWeight: 700, flex: 1 }}>Passwords</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => { setEditing(null); setOpen(true); }}>
          Add
        </Button>
      </Stack>

      {!available && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          OS-level encryption is unavailable. Passwords can't be stored securely on this system.
        </Alert>
      )}
      {err && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setErr('')}>{err}</Alert>}

      <TextField
        fullWidth size="small"
        value={query} onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by site or username"
        InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon sx={{ color: '#9aa3c7' }} /></InputAdornment> }}
        sx={{ mb: 3 }}
      />

      {filtered.length === 0 && (
        <Typography sx={{ color: '#9aa3c7', textAlign: 'center', mt: 8 }}>
          {query ? 'No matches.' : 'No saved passwords. Click Add to create one.'}
        </Typography>
      )}

      <List sx={{ border: filtered.length ? '1px solid rgba(255,255,255,0.08)' : 'none', borderRadius: 2, p: 0 }}>
        {filtered.map((it, i) => (
          <React.Fragment key={it.id}>
            {i > 0 && <Divider />}
            <ListItem sx={{ py: 1.5, gap: 1 }}>
              <Box component="img"
                src={`https://www.google.com/s2/favicons?domain=${hostOf(it.site)}&sz=32`}
                alt="" sx={{ width: 20, height: 20, mr: 1 }}
                onError={(e) => { e.target.style.visibility = 'hidden'; }}
              />
              <ListItemText
                primary={it.site}
                secondary={
                  <span>
                    {it.username}
                    {revealed[it.id] && <span style={{ marginLeft: 12, fontFamily: 'monospace', color: '#fbbf24' }}>{revealed[it.id]}</span>}
                  </span>
                }
                primaryTypographyProps={{ sx: { fontWeight: 600 } }}
              />
              <Tooltip title="Open site">
                <IconButton size="small" onClick={() => onOpen(it.site.startsWith('http') ? it.site : 'https://' + it.site)}>
                  <KeyIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title={revealed[it.id] ? 'Hide' : 'Reveal'}>
                <IconButton size="small" onClick={() => reveal(it.id)}>
                  {revealed[it.id] ? <VisibilityOffIcon fontSize="small" /> : <VisibilityIcon fontSize="small" />}
                </IconButton>
              </Tooltip>
              <Tooltip title="Copy password">
                <IconButton size="small" onClick={() => copyPw(it.id)}><ContentCopyIcon fontSize="small" /></IconButton>
              </Tooltip>
              <Tooltip title="Edit">
                <IconButton size="small" onClick={() => { setEditing(it); setOpen(true); }}><EditIcon fontSize="small" /></IconButton>
              </Tooltip>
              <Tooltip title="Delete">
                <IconButton size="small" onClick={() => remove(it.id)}><DeleteIcon fontSize="small" /></IconButton>
              </Tooltip>
            </ListItem>
          </React.Fragment>
        ))}
      </List>

      <PasswordDialog
        open={open} initial={editing}
        onClose={() => { setOpen(false); setEditing(null); }}
        onSave={save}
      />
    </Box>
  );
}
