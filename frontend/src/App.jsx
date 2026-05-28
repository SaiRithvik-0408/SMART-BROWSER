import React, { useEffect, useMemo, useState } from 'react';
import { Box } from '@mui/material';
import TopBar from './components/TopBar';
import TabsBar from './components/TabsBar';
import BrowserView from './components/BrowserView';
import VpnPanel from './components/VpnPanel';
import NotesPanel from './components/NotesPanel';
import ThreeBackground from './components/ThreeBackground';
import UpdateBanner from './components/UpdateBanner';
import { VpnApi } from './api/client';

const api = typeof window !== 'undefined' ? window.smartBrowserAPI : null;
const inElectron = !!api?.isElectron;

let _id = 1;
const newTab = (url = 'home') => ({
  id: String(_id++),
  url,
  title: url === 'home' ? 'New tab' : url,
  history: [url],
  cursor: 0,
});

export default function App() {
  const [tabs, setTabs] = useState([newTab('home')]);
  const [activeId, setActiveId] = useState(tabs[0].id);
  const [vpnPanelOpen, setVpnPanelOpen] = useState(false);
  const [vpnStatus, setVpnStatus] = useState({ enabled: false, activeServer: null });
  const [notesPanelOpen, setNotesPanelOpen] = useState(false);
  const [notesInitialId, setNotesInitialId] = useState(null);
  // Most-recently-closed tabs, so "Reopen closed tab" can resurrect them.
  const [closedStack, setClosedStack] = useState([]);

  const active = useMemo(() => tabs.find(t => t.id === activeId), [tabs, activeId]);

  useEffect(() => {
    VpnApi.status().then(setVpnStatus).catch(() => {});
    const id = setInterval(() => VpnApi.status().then(setVpnStatus).catch(() => {}), 5000);
    return () => clearInterval(id);
  }, []);

  // Listen for window.open inside any tab -> spawn a new tab
  useEffect(() => {
    if (!inElectron) return;
    return api.tab.onOpenNew((url) => {
      const t = newTab(url);
      setTabs(prev => [...prev, t]);
      setActiveId(t.id);
    });
  }, []);

  // Cross-app event channel from the new-tab page (HomePage / widgets) — the
  // Notes widget fires `sb:open-notes` with optional `noteId` to pop the
  // panel and jump straight to a specific note.
  useEffect(() => {
    const onOpen = (e) => {
      setNotesInitialId(e.detail?.noteId || null);
      setNotesPanelOpen(true);
    };
    window.addEventListener('sb:open-notes', onOpen);
    return () => window.removeEventListener('sb:open-notes', onOpen);
  }, []);

  // Global keyboard shortcuts that the chrome handles (not the page).
  useEffect(() => {
    const onKey = (e) => {
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && e.shiftKey && (e.key === 'T' || e.key === 't')) {
        e.preventDefault();
        reopenLastClosed();
      } else if (ctrl && (e.key === 'T' || e.key === 't')) {
        e.preventDefault();
        addTab();
      } else if (ctrl && (e.key === 'W' || e.key === 'w')) {
        e.preventDefault();
        if (active) closeTab(active.id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, closedStack, tabs.length]);

  // Whenever the active tab changes (any cause), tell the main process so it
  // hides every other native view. Without this, new/closed tabs would
  // inherit the previously-active tab's WebContentsView on screen.
  useEffect(() => {
    if (!inElectron) return;
    api.tab.activate(activeId);
  }, [activeId]);

  // NOTE: don't hide the native views when the VPN panel opens — instead the
  // BrowserView container shrinks (right padding below) so the panel sits in
  // the freed-up region. ResizeObserver inside BrowserView re-syncs the native
  // view bounds, so the page stays visible AND the panel is clickable.

  const updateActive = (mut) => {
    setTabs(prev => prev.map(t => t.id === activeId ? mut(t) : t));
  };

  const navigate = (url, opts = {}) => {
    updateActive(t => {
      if (opts.silent) {
        const last = t.history[t.cursor];
        if (last === url) return { ...t, title: url, _displayUrl: url };
        // If this URL matches the immediately previous entry in history,
        // treat it as a native back navigation (cursor--), not a brand-new
        // page. Keeps React's view of history aligned with the native view.
        if (t.cursor > 0 && t.history[t.cursor - 1] === url) {
          return { ...t, cursor: t.cursor - 1, title: url, _displayUrl: url };
        }
        if (t.cursor < t.history.length - 1 && t.history[t.cursor + 1] === url) {
          return { ...t, cursor: t.cursor + 1, title: url, _displayUrl: url };
        }
        const trimmed = t.history.slice(0, t.cursor + 1);
        const next = [...trimmed, url];
        return { ...t, history: next, cursor: next.length - 1, title: url, _displayUrl: url };
      }
      const trimmed = t.history.slice(0, t.cursor + 1);
      const next = [...trimmed, url];
      return { ...t, url, history: next, cursor: next.length - 1, title: url, _displayUrl: undefined };
    });
  };

  // Hybrid navigation history.
  //
  // Each tab keeps its own `history` array of every URL it has ever shown,
  // including transitions between internal pages (home, smartbrowser://...)
  // and external native pages. The native WebContentsView ALSO keeps its own
  // per-tab history, but only for the *current external segment* — it's
  // empty/short when the user just arrived at a site from the new-tab page.
  //
  // So Back/Forward must ALWAYS consult the React history first; only if
  // we're already at the start/end of React history do we fall through to
  // the native history (which still helps for SPAs that push their own
  // routes via the History API on a single load).
  const isInternalUrl = (u) => !u || u === 'home' || (typeof u === 'string' && u.startsWith('smartbrowser://'));

  const back = () => {
    if (!active) return;
    if (active.cursor > 0) {
      const newIdx = active.cursor - 1;
      const newUrl = active.history[newIdx];
      updateActive(t => ({ ...t, cursor: newIdx, url: newUrl, _displayUrl: undefined }));
      // Force a native nav directly even when the URL string didn't change —
      // silent navigation events may have advanced the native view past our
      // tab.url, so the React effect alone won't always re-load the target.
      if (inElectron && !isInternalUrl(newUrl)) api.tab.navigate(active.id, newUrl);
      return;
    }
    // At the start of React history — last resort: ask native to go back in
    // case the current external page has its own SPA-internal history.
    if (inElectron && !isInternalUrl(active.url)) api.tab.back(active.id);
  };
  const forward = () => {
    if (!active) return;
    if (active.cursor < active.history.length - 1) {
      const newIdx = active.cursor + 1;
      const newUrl = active.history[newIdx];
      updateActive(t => ({ ...t, cursor: newIdx, url: newUrl, _displayUrl: undefined }));
      if (inElectron && !isInternalUrl(newUrl)) api.tab.navigate(active.id, newUrl);
      return;
    }
    if (inElectron && !isInternalUrl(active.url)) api.tab.forward(active.id);
  };
  const reload = () => {
    if (inElectron && active && !isInternalUrl(active.url)) api.tab.reload(active.id);
    else updateActive(t => ({ ...t, url: t.url + '' }));
  };
  const home = () => navigate('home');

  const addTab = () => {
    const t = newTab('home');
    setTabs(prev => [...prev, t]);
    setActiveId(t.id);
  };
  const closeTab = (id) => {
    setTabs(prev => {
      const idx = prev.findIndex(t => t.id === id);
      if (idx < 0) return prev;
      const closing = prev[idx];
      // Only worth resurrecting if it isn't a blank home tab.
      if (closing.url && closing.url !== 'home') {
        setClosedStack((cs) => [
          { url: closing.url, title: closing.title, closedAt: Date.now() },
          ...cs,
        ].slice(0, 20));
      }
      const next = prev.filter(t => t.id !== id);
      if (next.length === 0) {
        const fresh = newTab('home');
        setActiveId(fresh.id);
        return [fresh];
      }
      if (id === activeId) setActiveId(next[Math.max(0, idx - 1)].id);
      return next;
    });
    if (inElectron) api.tab.destroy(id);
  };

  // Tab context-menu helpers used by TabsBar.
  const openTabAt = (url, atIndex) => {
    const t = newTab(url);
    setTabs(prev => {
      const next = [...prev];
      const i = Math.max(0, Math.min(atIndex, next.length));
      next.splice(i, 0, t);
      return next;
    });
    setActiveId(t.id);
  };
  const duplicateTab = (id) => {
    const src = tabs.find(t => t.id === id);
    if (!src) return;
    openTabAt(src.url || 'home', tabs.findIndex(t => t.id === id) + 1);
  };
  const newTabToRightOf = (id) => {
    openTabAt('home', tabs.findIndex(t => t.id === id) + 1);
  };
  const closeOtherTabs = (id) => {
    const keep = tabs.find(t => t.id === id);
    const removed = tabs.filter(t => t.id !== id);
    removed.forEach(t => { if (inElectron) api.tab.destroy(t.id); });
    setClosedStack((cs) => [
      ...removed.filter(t => t.url && t.url !== 'home').map(t => ({ url: t.url, title: t.title, closedAt: Date.now() })),
      ...cs,
    ].slice(0, 20));
    setTabs(keep ? [keep] : [newTab('home')]);
    setActiveId(keep ? keep.id : '');
  };
  const closeTabsToRight = (id) => {
    const idx = tabs.findIndex(t => t.id === id);
    if (idx < 0) return;
    const removed = tabs.slice(idx + 1);
    removed.forEach(t => { if (inElectron) api.tab.destroy(t.id); });
    setClosedStack((cs) => [
      ...removed.filter(t => t.url && t.url !== 'home').map(t => ({ url: t.url, title: t.title, closedAt: Date.now() })),
      ...cs,
    ].slice(0, 20));
    setTabs(prev => prev.slice(0, idx + 1));
  };
  const closeDuplicateTabs = () => {
    const seen = new Set();
    const removed = [];
    const next = tabs.filter(t => {
      const key = t.url;
      if (seen.has(key)) { removed.push(t); return false; }
      seen.add(key);
      return true;
    });
    removed.forEach(t => { if (inElectron) api.tab.destroy(t.id); });
    setTabs(next);
    if (!next.find(t => t.id === activeId)) setActiveId(next[0]?.id || '');
  };
  const reopenLastClosed = () => {
    const [head, ...rest] = closedStack;
    if (!head) return;
    setClosedStack(rest);
    const t = newTab(head.url);
    setTabs(prev => [...prev, t]);
    setActiveId(t.id);
  };

  return (
    <Box sx={{ width: '100vw', height: '100vh', position: 'relative', overflow: 'hidden' }}>
      <ThreeBackground active={vpnStatus.enabled} />

      <Box sx={{ position: 'relative', zIndex: 2, display: 'flex', flexDirection: 'column', height: '100%' }}>
        <TabsBar
          tabs={tabs} activeId={activeId}
          onSelect={setActiveId}
          onClose={closeTab}
          onNewTab={addTab}
          onDuplicate={duplicateTab}
          onNewTabRightOf={newTabToRightOf}
          onCloseOthers={closeOtherTabs}
          onCloseRight={closeTabsToRight}
          onCloseDuplicates={closeDuplicateTabs}
          onReopenLastClosed={reopenLastClosed}
          onReload={(id) => { if (inElectron) api.tab.reload(id); }}
          canReopen={closedStack.length > 0}
        />
        <TopBar
          url={active?.url === 'home' ? '' : (active?._displayUrl || active?.url)}
          onNavigate={navigate}
          onBack={back} onForward={forward} onReload={reload} onHome={home}
          vpnOn={vpnStatus.enabled}
          activeServerLabel={vpnStatus.activeServer?.label}
          onToggleVpnPanel={() => setVpnPanelOpen(v => !v)}
          notesOpen={notesPanelOpen}
          onToggleNotesPanel={() => { setNotesInitialId(null); setNotesPanelOpen(v => !v); }}
          onNewTab={addTab}
        />
        <UpdateBanner />
        <Box sx={{
          flex: 1,
          display: 'flex',
          position: 'relative',
          minHeight: 0,                  // critical: lets nested overflow:auto actually scroll
          // Reserve right-side space for whichever side panel is open so the
          // native WebContentsView (which always renders ABOVE this HTML) is
          // shrunk away from the panel area. Without this, panels look like
          // empty floating headers because the page sits on top of them.
          // VPN panel: 400 px; Notes panel: 540 px (520 width + a margin).
          // On narrow viewports the panels go full-width on top of content
          // so we don't reserve any side space.
          pr: notesPanelOpen ? { xs: 0, sm: '540px' }
            : vpnPanelOpen   ? { xs: 0, sm: '400px' }
            : 0,
          transition: 'padding-right 180ms ease',
        }}>
          {tabs.map(t => (
            <Box key={t.id} sx={{ flex: 1, display: t.id === activeId ? 'flex' : 'none', minHeight: 0 }}>
              <BrowserView
                tab={t}
                isActive={t.id === activeId}
                onTitleChange={(title) => setTabs(prev => prev.map(x => x.id === t.id ? { ...x, title } : x))}
                onNavigateInTab={(url, opts) => {
                  if (t.id !== activeId) return;
                  navigate(url, opts);
                }}
              />
            </Box>
          ))}
        </Box>
        <VpnPanel open={vpnPanelOpen} onClose={() => setVpnPanelOpen(false)} />
        <NotesPanel
          open={notesPanelOpen}
          onClose={() => setNotesPanelOpen(false)}
          initialNoteId={notesInitialId}
        />
      </Box>
    </Box>
  );
}
