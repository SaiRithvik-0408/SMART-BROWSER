import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box, Paper, Typography, Stack, IconButton, InputBase,
  List, ListItemButton, Tooltip, Alert, Button, Snackbar, Dialog,
} from '@mui/material';
import StickyNote2Icon from '@mui/icons-material/StickyNote2';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import ImageIcon from '@mui/icons-material/Image';
import CloseIcon from '@mui/icons-material/Close';
import SearchIcon from '@mui/icons-material/Search';
import SaveIcon from '@mui/icons-material/Save';

const api = typeof window !== 'undefined' ? window.smartBrowserAPI : null;

// --- helpers ---------------------------------------------------------------

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(fr.error);
    fr.onload  = () => resolve(String(fr.result || ''));
    fr.readAsDataURL(file);
  });
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function escapeAttr(s) {
  return String(s).replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

// Build the inner HTML for an editor session from a note. Handles two
// shapes:
//   1. Legacy { content: 'plain text', images: [{src,alt}] } — we wrap each
//      paragraph in <p> and append images at the end.
//   2. New  { content: '<p>…<img>…</p>' } — used as-is.
// Image elements get class `sb-note-img` so click delegation knows it's
// the user's content (not the lightbox itself).
function noteToHtml(note) {
  if (!note) return '';
  const raw = note.content || '';
  const isHtml = /<\w+/.test(raw);
  if (isHtml) return raw;
  const textHtml = raw
    .split(/\n{2,}/)
    .map((para) => `<p>${escapeHtml(para).replace(/\n/g, '<br>')}</p>`)
    .join('') || '<p><br></p>';
  const imgsHtml = (note.images || [])
    .map((i) => `<p><img class="sb-note-img" src="${escapeAttr(i.src)}" alt="${escapeAttr(i.alt || '')}"></p>`)
    .join('');
  return textHtml + imgsHtml;
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
  return (content || '')
    .replace(/<img[^>]*>/g, ' [image] ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 90);
}

// --- inline image insertion -------------------------------------------------

// Build the <img> element we put into the editor. Important visual details
// live here (max-width, rounded corners, cursor) so a re-loaded note from
// disk picks them up without needing extra CSS.
function makeImg(src, alt) {
  const img = document.createElement('img');
  img.src = src;
  img.alt = alt || '';
  img.draggable = false;
  img.className = 'sb-note-img';
  img.style.maxWidth     = '100%';
  img.style.height       = 'auto';
  img.style.display      = 'inline-block';
  img.style.borderRadius = '4px';
  img.style.cursor       = 'zoom-in';
  img.style.margin       = '4px 0';
  return img;
}

// Insert `node` at the current selection. If the selection isn't inside the
// editor (e.g. user just clicked the toolbar button), we restore the saved
// range when available; otherwise append to the end.
function insertNodeIntoEditor(editor, node, savedRange) {
  editor.focus();
  const sel = window.getSelection();
  let range;
  if (sel && sel.rangeCount > 0 && editor.contains(sel.anchorNode)) {
    range = sel.getRangeAt(0);
  } else if (savedRange && editor.contains(savedRange.startContainer)) {
    range = savedRange.cloneRange();
  } else {
    range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
  }
  range.deleteContents();
  range.insertNode(node);
  // Move caret past the inserted node so successive typing flows after it.
  range.setStartAfter(node);
  range.collapse(true);
  if (sel) { sel.removeAllRanges(); sel.addRange(range); }
}

// --- component --------------------------------------------------------------

export default function NotesPanel({ open, onClose, initialNoteId }) {
  const [notes, setNotes] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [query, setQuery] = useState('');
  const [dirty, setDirty] = useState(false);
  const [toast, setToast] = useState('');
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState(null);

  const paperRef     = useRef(null);
  const editorRef    = useRef(null);
  const fileInputRef = useRef(null);
  const saveTimerRef = useRef(null);
  const savedRangeRef = useRef(null);   // last cursor inside the editor
  const loadedNoteIdRef = useRef(null); // which note is currently in the DOM
  const draftRef        = useRef('');   // latest editor HTML pending save

  const active = useMemo(() => notes.find((n) => n.id === activeId) || null, [notes, activeId]);

  // --- IPC helpers --------------------------------------------------------
  const reload = async () => {
    if (!api?.notes) return [];
    const list = await api.notes.list();
    setNotes(list);
    return list;
  };

  // Initial load + initial selection.
  useEffect(() => {
    if (!open) return;
    (async () => {
      const list = await reload();
      if (initialNoteId && list.find((n) => n.id === initialNoteId)) {
        setActiveId(initialNoteId);
      } else if (list.length > 0) {
        setActiveId(list[0].id);
      } else {
        const fresh = await api.notes.create({ title: 'Scratch', content: '' });
        await reload();
        setActiveId(fresh.id);
      }
    })();
  }, [open, initialNoteId]);

  // Re-fetch the notes list while the panel is open so notes created /
  // edited via the dashboard widget (or any other surface) show up here
  // without forcing the user to close + re-open the panel. 4-second poll
  // is rate-limited enough to be invisible cost-wise.
  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => { reload().catch(() => {}); }, 4000);
    return () => clearInterval(id);
  }, [open]);

  // Whenever the active note changes, load its HTML into the editor ONCE.
  // We don't keep React in lockstep with editor innerHTML because that would
  // wipe the cursor on every keystroke.
  useEffect(() => {
    const el = editorRef.current;
    if (!el || !active) return;
    if (loadedNoteIdRef.current === active.id) return;
    loadedNoteIdRef.current = active.id;
    el.innerHTML = noteToHtml(active);
    draftRef.current = el.innerHTML;
    setDirty(false);
  }, [active?.id]);

  // Debounced save: any DOM mutation marks dirty and we flush 500 ms later.
  useEffect(() => {
    if (!dirty || !active) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      // Persist HTML in `content`; legacy `images` array gets cleared because
      // images now live inline inside `content`.
      const res = await api.notes.update(active.id, {
        title: active.title,
        content: draftRef.current,
        images: [],
      });
      if (res?.error) setError(res.error);
      else { setDirty(false); reload(); }
    }, 500);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [dirty, active?.title, active?.id]);

  // --- editor event handlers ---------------------------------------------
  const onInput = () => {
    draftRef.current = editorRef.current?.innerHTML || '';
    setDirty(true);
  };

  const saveSelection = () => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && editorRef.current?.contains(sel.anchorNode)) {
      savedRangeRef.current = sel.getRangeAt(0).cloneRange();
    }
  };

  const onPaste = async (e) => {
    const items = Array.from(e.clipboardData?.items || []);
    const imgItems = items.filter((it) => it.type && it.type.startsWith('image/'));
    if (imgItems.length > 0) {
      e.preventDefault();
      for (const it of imgItems) {
        const f = it.getAsFile();
        if (!f) continue;
        const src = await fileToDataUrl(f);
        insertNodeIntoEditor(editorRef.current, makeImg(src, f.name), savedRangeRef.current);
      }
      onInput();
      return;
    }
    // Strip clipboard HTML to plain text — pasting from a web page otherwise
    // brings along messy inline styles, font tags, etc.
    const text = e.clipboardData?.getData('text/plain');
    if (text) {
      e.preventDefault();
      document.execCommand('insertText', false, text);
      onInput();
    }
  };

  const onDrop = async (e) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer?.files || []).filter((f) => f.type && f.type.startsWith('image/'));
    if (!files.length) return;
    // Position the caret where the user dropped, so the image lands there.
    const r = document.caretRangeFromPoint?.(e.clientX, e.clientY);
    if (r && editorRef.current.contains(r.startContainer)) {
      const sel = window.getSelection();
      sel.removeAllRanges(); sel.addRange(r);
    }
    for (const f of files) {
      const src = await fileToDataUrl(f);
      insertNodeIntoEditor(editorRef.current, makeImg(src, f.name), savedRangeRef.current);
    }
    onInput();
  };

  // Click delegation: clicking any inline image opens the lightbox.
  const onEditorClick = (e) => {
    if (e.target.tagName === 'IMG' && e.target.classList.contains('sb-note-img')) {
      setLightboxSrc(e.target.src);
    }
  };

  // Toolbar "Add image" button: read files from a hidden <input>, then
  // insert each at the saved cursor position.
  const addImagesFromInput = async (files) => {
    for (const f of Array.from(files || [])) {
      if (!f.type?.startsWith('image/')) continue;
      const src = await fileToDataUrl(f);
      insertNodeIntoEditor(editorRef.current, makeImg(src, f.name), savedRangeRef.current);
    }
    onInput();
    setToast('Image inserted');
  };

  // --- CRUD --------------------------------------------------------------
  const newNote = async () => {
    const created = await api.notes.create({ title: 'Untitled', content: '' });
    await reload();
    setActiveId(created.id);
  };
  const deleteNote = async (id) => {
    if (!confirm('Delete this note?')) return;
    await api.notes.remove(id);
    const list = await reload();
    loadedNoteIdRef.current = null;
    if (id === activeId) setActiveId(list[0]?.id || null);
  };
  const updateTitle = (title) => {
    setNotes((prev) => prev.map((n) => (n.id === activeId ? { ...n, title, updatedAt: Date.now() } : n)));
    setDirty(true);
  };

  const filtered = notes.filter((n) => {
    if (!query) return true;
    const q = query.toLowerCase();
    return (n.title || '').toLowerCase().includes(q) || preview(n.content).toLowerCase().includes(q);
  });

  // --- panel-level close behaviors ---------------------------------------
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      const p = paperRef.current;
      if (!p || p.contains(e.target)) return;
      if (e.target.closest && e.target.closest('[data-sb-notes-toggle]')) return;
      // Don't close while the lightbox is up — the lightbox sits OUTSIDE
      // the Paper but is part of the same widget.
      if (e.target.closest && e.target.closest('[data-sb-lightbox]')) return;
      onClose?.();
    };
    document.addEventListener('mousedown', onDown, true);
    return () => document.removeEventListener('mousedown', onDown, true);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') {
      if (lightboxSrc) setLightboxSrc(null);
      else onClose?.();
    }};
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, lightboxSrc]);

  useEffect(() => {
    if (!open || !api?.tab?.onPageFocus) return;
    const openedAt = Date.now();
    return api.tab.onPageFocus(() => {
      if (Date.now() - openedAt < 200) return;
      onClose?.();
    });
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
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
                      {preview(n.content) || 'Empty'}
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
                    onChange={(e) => updateTitle(e.target.value)}
                    placeholder="Title"
                    sx={{ fontSize: 18, fontWeight: 700, color: '#e6e9f5' }}
                  />
                  <Typography sx={{ fontSize: 11, color: '#5b6385', mt: 0.25 }}>
                    {fmtDate(active.updatedAt)} {dirty && '· unsaved'}
                  </Typography>
                </Box>
                <Box
                  ref={editorRef}
                  contentEditable
                  suppressContentEditableWarning
                  spellCheck={false}
                  onInput={onInput}
                  onPaste={onPaste}
                  onClick={onEditorClick}
                  onKeyUp={saveSelection}
                  onMouseUp={saveSelection}
                  onBlur={saveSelection}
                  sx={{
                    flex: 1, overflow: 'auto', px: 2, py: 1, minHeight: 160,
                    outline: 'none',
                    color: '#e6e9f5', fontSize: 14, lineHeight: 1.55,
                    fontFamily: '"Inter", system-ui, sans-serif',
                    // Images styled inline (see makeImg), but provide a hover
                    // hint here too in case loaded content lacks the inline style.
                    '& img': { maxWidth: '100%', borderRadius: '4px', cursor: 'zoom-in', margin: '4px 0' },
                    '& p': { margin: '0 0 8px 0' },
                    '&[data-empty="true"]::before': {
                      content: '"Write something… paste or drag-and-drop images right where you want them."',
                      color: 'rgba(154,163,199,0.6)',
                      pointerEvents: 'none',
                      display: 'block',
                    },
                  }}
                  data-empty={!active.content && (!editorRef.current?.textContent)}
                />

                <Stack direction="row" spacing={1} sx={{ px: 2, py: 1.25,
                  borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                  <input
                    type="file" multiple accept="image/*" ref={fileInputRef}
                    style={{ display: 'none' }}
                    onChange={(e) => { addImagesFromInput(e.target.files); e.target.value = ''; }}
                  />
                  <Button size="small" startIcon={<ImageIcon />}
                    onClick={() => { saveSelection(); fileInputRef.current?.click(); }}
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
                          title: active.title,
                          content: draftRef.current,
                          images: [],
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

      <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />
    </>
  );
}

// Full-screen image preview. Pure CSS — no MUI Dialog because we want the
// click-anywhere-to-close behavior and a near-fullscreen viewing area.
function ImageLightbox({ src, onClose }) {
  if (!src) return null;
  return (
    <Box
      data-sb-lightbox
      onClick={onClose}
      sx={{
        position: 'fixed', inset: 0, zIndex: 1500,
        background: 'rgba(0,0,0,0.92)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'zoom-out',
      }}
    >
      <Box component="img" src={src} alt=""
        onClick={(e) => e.stopPropagation()}
        sx={{ maxWidth: '92vw', maxHeight: '92vh', objectFit: 'contain',
          borderRadius: 1, boxShadow: '0 10px 60px rgba(0,0,0,0.6)' }}
      />
      <IconButton
        onClick={onClose}
        sx={{ position: 'fixed', top: 16, right: 16, color: '#fff',
          background: 'rgba(255,255,255,0.08)',
          '&:hover': { background: 'rgba(255,255,255,0.16)' } }}
      >
        <CloseIcon />
      </IconButton>
    </Box>
  );
}
