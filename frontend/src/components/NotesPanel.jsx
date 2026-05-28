import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box, Paper, Typography, Stack, IconButton, TextField, InputBase,
  List, ListItemButton, Divider, Tooltip, Alert, Button, Snackbar,
} from '@mui/material';
import StickyNote2Icon from '@mui/icons-material/StickyNote2';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import ImageIcon from '@mui/icons-material/Image';
import CloseIcon from '@mui/icons-material/Close';
import SearchIcon from '@mui/icons-material/Search';
import SaveIcon from '@mui/icons-material/Save';

const api = typeof window !== 'undefined' ? window.smartBrowserAPI : null;

// Convert a File/Blob to a data: URI string. We keep them as base64 inside
// the note JSON — simple, persistent, works offline. The store enforces a
// per-note image budget so the JSON doesn't blow up.
function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(fr.error);
    fr.onload = () => resolve(String(fr.result || ''));
    fr.readAsDataURL(file);
  });
}

function fmtDate(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}
function preview(content) {
  return (content || '').replace(/\s+/g, ' ').trim().slice(0, 90);
}

export default function NotesPanel({ open, onClose, initialNoteId }) {
  const [notes, setNotes] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [query, setQuery] = useState('');
  const [dirty, setDirty] = useState(false);
  const [toast, setToast] = useState('');
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);
  const saveTimerRef = useRef(null);
  const paperRef = useRef(null);

  // Close the panel when the user clicks anywhere OUTSIDE its bounds —
  // including the native WebContentsView (which fires a synthetic mouse
  // event on the React layer via `setIgnoreMouseEvents` is NOT used here,
  // but a click on the chrome chrome / TopBar / TabsBar reliably bubbles).
  // We listen at the capture phase so a click that lands on the page (which
  // does NOT bubble into React) still has a chance of dismissing via the
  // window's focus loss when the BrowserView grabs focus — that's why we
  // also watch the window's blur event below.
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      const p = paperRef.current;
      if (!p) return;
      if (p.contains(e.target)) return;
      // Ignore clicks on the toggle button itself — TopBar dispatches its
      // own onToggle handler which would race with us.
      const t = e.target;
      if (t && t.closest && t.closest('[data-sb-notes-toggle]')) return;
      onClose?.();
    };
    document.addEventListener('mousedown', onDown, true);
    return () => document.removeEventListener('mousedown', onDown, true);
  }, [open, onClose]);

  // Esc closes the panel.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Native page focus (the user clicked into the WebContentsView) also
  // closes the panel — those clicks never reach our React mousedown handler.
  // 200 ms grace window prevents spurious focus events that fire right as a
  // newly-created tab loads from immediately closing a freshly-opened panel.
  useEffect(() => {
    if (!open || !api?.tab?.onPageFocus) return;
    const openedAt = Date.now();
    return api.tab.onPageFocus(() => {
      if (Date.now() - openedAt < 200) return;
      onClose?.();
    });
  }, [open, onClose]);

  const active = useMemo(() => notes.find((n) => n.id === activeId) || null, [notes, activeId]);

  const reload = async () => {
    if (!api?.notes) return;
    const list = await api.notes.list();
    setNotes(list);
    return list;
  };

  useEffect(() => {
    if (!open) return;
    (async () => {
      const list = await reload();
      if (initialNoteId) setActiveId(initialNoteId);
      else if (list && list.length > 0) setActiveId(list[0].id);
      else {
        // Empty — auto-create a first scratch note so the editor isn't blank.
        const fresh = await api.notes.create({ title: 'Scratch', content: '' });
        await reload();
        setActiveId(fresh.id);
      }
    })();
  }, [open, initialNoteId]);

  // Debounced save: any change to title/content/images flushes 500ms later.
  useEffect(() => {
    if (!dirty || !active) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      const res = await api.notes.update(active.id, {
        title: active.title, content: active.content, images: active.images,
      });
      if (res?.error) setError(res.error);
      else { setDirty(false); reload(); }
    }, 500);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [dirty, active?.title, active?.content, active?.images]);

  const patchActive = (patch) => {
    setNotes((prev) => prev.map((n) => (n.id === activeId ? { ...n, ...patch, updatedAt: Date.now() } : n)));
    setDirty(true);
  };

  const newNote = async () => {
    const created = await api.notes.create({ title: 'Untitled', content: '' });
    await reload();
    setActiveId(created.id);
  };

  const deleteNote = async (id) => {
    if (!confirm('Delete this note?')) return;
    await api.notes.remove(id);
    const list = await reload();
    if (id === activeId) setActiveId(list[0]?.id || null);
  };

  const addImages = async (files) => {
    setError('');
    const accepted = Array.from(files || []).filter((f) => f.type && f.type.startsWith('image/'));
    if (!accepted.length) return;
    const newImgs = await Promise.all(accepted.map(async (f) => ({
      id: `img-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      src: await fileToDataUrl(f),
      alt: f.name || 'image',
    })));
    const next = [...(active?.images || []), ...newImgs];
    patchActive({ images: next });
    setToast(`Added ${newImgs.length} image${newImgs.length === 1 ? '' : 's'}`);
  };

  const onPaste = (e) => {
    const items = Array.from(e.clipboardData?.items || []);
    const imgItems = items.filter((it) => it.type && it.type.startsWith('image/'));
    if (imgItems.length === 0) return;
    e.preventDefault();
    addImages(imgItems.map((it) => it.getAsFile()).filter(Boolean));
  };

  const onDrop = async (e) => {
    e.preventDefault();
    setDragOver(false);
    const files = e.dataTransfer?.files || [];
    if (files.length) addImages(files);
  };

  const removeImage = (imgId) => {
    patchActive({ images: (active?.images || []).filter((img) => img.id !== imgId) });
  };

  const filtered = notes.filter((n) => {
    if (!query) return true;
    const q = query.toLowerCase();
    return (n.title || '').toLowerCase().includes(q) || (n.content || '').toLowerCase().includes(q);
  });

  if (!open) return null;

  return (
    <Paper
      ref={paperRef}
      elevation={12}
      sx={{
        position: 'absolute', top: 64, zIndex: 30,
        right: { xs: 8, sm: 16 },
        left:  { xs: 8, sm: 'auto' },
        width: { xs: 'auto', sm: 520 },
        height: { xs: 'calc(100vh - 80px)', sm: 'calc(100vh - 96px)' },
        display: 'flex', flexDirection: 'column',
        borderRadius: 3, overflow: 'hidden',
      }}
    >
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ px: 2.5, py: 1.5,
          borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <StickyNote2Icon sx={{ color: '#fbbf24' }} />
        <Typography variant="h6" sx={{ flex: 1 }}>Notes</Typography>
        <Tooltip title="New note">
          <IconButton onClick={newNote}><AddIcon /></IconButton>
        </Tooltip>
        <Tooltip title="Close">
          <IconButton onClick={onClose}><CloseIcon /></IconButton>
        </Tooltip>
      </Stack>

      <Box sx={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: '180px 1fr' }}>
        {/* Note list */}
        <Box sx={{ borderRight: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <Box sx={{ p: 1 }}>
            <InputBase
              fullWidth value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search"
              startAdornment={<SearchIcon sx={{ fontSize: 16, mr: 0.75, color: '#9aa3c7' }} />}
              sx={{ fontSize: 13, color: '#e6e9f5',
                background: 'rgba(255,255,255,0.04)', borderRadius: 1, px: 1, py: 0.5 }}
            />
          </Box>
          <List dense sx={{ flex: 1, overflow: 'auto', py: 0 }}>
            {filtered.length === 0 && (
              <Typography sx={{ p: 2, fontSize: 12, color: '#9aa3c7', textAlign: 'center' }}>
                {query ? 'No matches.' : 'No notes yet.'}
              </Typography>
            )}
            {filtered.map((n) => (
              <ListItemButton
                key={n.id}
                selected={n.id === activeId}
                onClick={() => setActiveId(n.id)}
                sx={{
                  alignItems: 'flex-start', gap: 0.25, py: 0.75,
                  '&.Mui-selected': { background: 'rgba(122,162,255,0.10)' },
                }}
              >
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Typography noWrap sx={{ fontSize: 13, fontWeight: 600, color: '#e6e9f5' }}>
                    {n.title || 'Untitled'}
                  </Typography>
                  <Typography noWrap sx={{ fontSize: 11, color: '#9aa3c7' }}>
                    {preview(n.content) || (n.images?.length ? `${n.images.length} image${n.images.length > 1 ? 's' : ''}` : 'Empty')}
                  </Typography>
                  <Typography sx={{ fontSize: 10, color: '#5b6385', mt: 0.25 }}>
                    {fmtDate(n.updatedAt)}
                  </Typography>
                </Box>
                <IconButton size="small"
                  onClick={(e) => { e.stopPropagation(); deleteNote(n.id); }}
                  sx={{ p: 0.25, opacity: 0.6, '&:hover': { opacity: 1, color: '#ef4444' } }}
                >
                  <DeleteIcon sx={{ fontSize: 14 }} />
                </IconButton>
              </ListItemButton>
            ))}
          </List>
        </Box>

        {/* Editor */}
        <Box
          sx={{
            display: 'flex', flexDirection: 'column', minHeight: 0,
            position: 'relative',
            outline: dragOver ? '2px dashed rgba(122,162,255,0.7)' : 'none',
            outlineOffset: -8,
          }}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
        >
          {!active && (
            <Typography sx={{ p: 4, textAlign: 'center', color: '#9aa3c7' }}>
              Select or create a note to start writing.
            </Typography>
          )}
          {active && (
            <>
              <Box sx={{ px: 2, pt: 1.5 }}>
                <InputBase
                  fullWidth value={active.title || ''}
                  onChange={(e) => patchActive({ title: e.target.value })}
                  placeholder="Title"
                  sx={{ fontSize: 18, fontWeight: 700, color: '#e6e9f5' }}
                />
                <Typography sx={{ fontSize: 11, color: '#5b6385', mt: 0.25 }}>
                  {fmtDate(active.updatedAt)} {dirty && '· unsaved'}
                </Typography>
              </Box>
              <Box sx={{ flex: 1, overflow: 'auto', px: 2, py: 1, minHeight: 0 }}>
                <InputBase
                  multiline fullWidth
                  value={active.content || ''}
                  onChange={(e) => patchActive({ content: e.target.value })}
                  onPaste={onPaste}
                  placeholder="Write something… paste or drag-and-drop images here."
                  sx={{
                    alignItems: 'flex-start',
                    fontSize: 14, lineHeight: 1.55, color: '#e6e9f5',
                    fontFamily: '"Inter", system-ui, sans-serif',
                    minHeight: 160,
                  }}
                />
                {(active.images || []).length > 0 && (
                  <Box sx={{ mt: 2 }}>
                    <Typography sx={{ fontSize: 11, color: '#9aa3c7', mb: 1, letterSpacing: 1, textTransform: 'uppercase' }}>
                      Images ({active.images.length})
                    </Typography>
                    <Box sx={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
                      gap: 1,
                    }}>
                      {active.images.map((img) => (
                        <Box key={img.id} sx={{ position: 'relative', borderRadius: 1, overflow: 'hidden',
                          border: '1px solid rgba(255,255,255,0.06)' }}>
                          <Box component="img" src={img.src} alt={img.alt}
                            sx={{ width: '100%', height: 100, objectFit: 'cover', display: 'block' }}
                          />
                          <IconButton size="small"
                            onClick={() => removeImage(img.id)}
                            sx={{ position: 'absolute', top: 4, right: 4, background: 'rgba(0,0,0,0.6)',
                              color: '#fff', '&:hover': { background: 'rgba(0,0,0,0.85)' } }}
                          >
                            <CloseIcon sx={{ fontSize: 14 }} />
                          </IconButton>
                        </Box>
                      ))}
                    </Box>
                  </Box>
                )}
              </Box>

              <Stack direction="row" spacing={1} sx={{ px: 2, py: 1.25,
                borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                <input
                  type="file" multiple accept="image/*" ref={fileInputRef}
                  style={{ display: 'none' }}
                  onChange={(e) => { addImages(e.target.files); e.target.value = ''; }}
                />
                <Button size="small" startIcon={<ImageIcon />}
                  onClick={() => fileInputRef.current?.click()}
                >
                  Add image
                </Button>
                <Box sx={{ flex: 1 }} />
                <Typography sx={{ fontSize: 11, color: '#5b6385', alignSelf: 'center', mr: 1 }}>
                  {dirty ? 'Saving…' : 'Saved'}
                </Typography>
                <Tooltip title="Save now">
                  <IconButton size="small" disabled={!dirty}
                    onClick={async () => {
                      if (!active) return;
                      const res = await api.notes.update(active.id, {
                        title: active.title, content: active.content, images: active.images,
                      });
                      if (res?.error) setError(res.error);
                      else { setDirty(false); reload(); }
                    }}
                  >
                    <SaveIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Stack>
            </>
          )}
        </Box>
      </Box>

      {error && (
        <Alert severity="error" onClose={() => setError('')}
          sx={{ position: 'absolute', bottom: 60, left: 16, right: 16 }}>
          {error}
        </Alert>
      )}
      <Snackbar open={!!toast} autoHideDuration={1800} onClose={() => setToast('')}
        message={toast} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }} />
    </Paper>
  );
}
