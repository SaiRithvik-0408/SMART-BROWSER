import React, { useEffect, useMemo, useState } from 'react';
import { Box, Paper, IconButton, Typography } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import TopBar from './components/TopBar';
import TabsBar from './components/TabsBar';
import BrowserView from './components/BrowserView';
import VpnPanel from './components/VpnPanel';
import NotesPanel from './components/NotesPanel';
import ThreeBackground from './components/ThreeBackground';
import UpdateBanner from './components/UpdateBanner';
import HistoryPage from './components/HistoryPage';
import DownloadsPage from './components/DownloadsPage';
import PasswordsPage from './components/PasswordsPage';
import SettingsPage from './components/SettingsPage';
import ExtensionsPage from './components/ExtensionsPage';
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

// =========================================================================
// Tab persistence. The React shell can be reloaded for legitimate reasons
// (post-update relaunch, devtools refresh, manual menu trigger that
// slipped past our shortcut overrides). Without persistence, every reload
// drops the entire tab list and the user's open tabs vanish. We snapshot
// the URLs to localStorage on every change and restore them on boot.
//
// We don't try to restore the native WebContentsViews (they're destroyed
// on shell reload) — the URLs are re-navigated lazily as each tab is
// activated, which is the same behavior as opening a fresh tab.
// =========================================================================
const SESSION_KEY = 'sb.session.v1';

function loadInitialTabs() {
  if (typeof window === 'undefined') return [newTab('home')];
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (!raw) return [newTab('home')];
    const data = JSON.parse(raw);
    if (!data || !Array.isArray(data.tabs) || data.tabs.length === 0) {
      return [newTab('home')];
    }
    const restored = data.tabs.map((t) => ({
      id: String(_id++),
      url: t.url || 'home',
      title: t.title || (t.url === 'home' ? 'New tab' : t.url || 'New tab'),
      history: Array.isArray(t.history) && t.history.length > 0 ? t.history : [t.url || 'home'],
      cursor: typeof t.cursor === 'number'
        ? Math.max(0, Math.min(t.cursor, (t.history?.length || 1) - 1))
        : 0,
    }));
    return restored.length > 0 ? restored : [newTab('home')];
  } catch {
    return [newTab('home')];
  }
}

function loadInitialActiveIndex() {
  if (typeof window === 'undefined') return 0;
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (!raw) return 0;
    const data = JSON.parse(raw);
    return typeof data?.activeIndex === 'number' ? data.activeIndex : 0;
  } catch { return 0; }
}

// Memoize the boot snapshot so both useState initializers see the SAME
// freshly-loaded tabs (loadInitialTabs allocates IDs each call, so calling
// it twice would desync the activeId from the tabs array).
const BOOT = (() => {
  const tabs = loadInitialTabs();
  const idx = Math.max(0, Math.min(loadInitialActiveIndex(), tabs.length - 1));
  return { tabs, activeId: tabs[idx].id };
})();

export default function App() {
  const [tabs, setTabs] = useState(BOOT.tabs);
  const [activeId, setActiveId] = useState(BOOT.activeId);
  const [vpnPanelOpen, setVpnPanelOpen] = useState(false);
  const [vpnStatus, setVpnStatus] = useState({ enabled: false, activeServer: null });
  const [notesPanelOpen, setNotesPanelOpen] = useState(false);
  const [notesInitialId, setNotesInitialId] = useState(null);
  // The "page-as-popup" overlay. When non-null, an internal page (settings,
  // history, downloads, extensions, passwords) is rendered as a floating
  // modal ON TOP of whatever the user was viewing, and the native
  // WebContentsView is temporarily hidden so the overlay is actually
  // visible (native views always render above HTML). Closing the overlay
  // re-activates the current tab and the user sees their page again,
  // exactly as they left it — no navigation, no tab churn.
  const [internalOverlay, setInternalOverlay] = useState(null);
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

  // Persist the tab strip to localStorage so a shell reload (auto-update
  // relaunch, accidental Ctrl+R that slipped past, dev refresh, etc) does
  // not silently lose the user's open tabs. We strip ephemeral fields and
  // store just enough to re-open each URL on next boot.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const idx = tabs.findIndex(t => t.id === activeId);
      const payload = {
        activeIndex: idx < 0 ? 0 : idx,
        tabs: tabs.map(t => ({
          url: t.url,
          title: t.title,
          history: t.history?.slice(-20) || [t.url],
          cursor: t.cursor,
        })),
      };
      window.localStorage.setItem(SESSION_KEY, JSON.stringify(payload));
    } catch {}
  }, [tabs, activeId]);

  // Whenever ANY popup-style chrome is open (internal overlay, Notes
  // panel, VPN panel), hide every native WebContentsView so the React
  // overlay is actually visible. Native views always render above HTML,
  // so without hiding them the panel would be invisible behind the page.
  //
  // This intentionally REPLACES the old "shrink the BrowserView via
  // padding-right" trick — the user explicitly asked for popups that
  // float on top WITHOUT resizing the website. The site is briefly
  // hidden while the popup is open and reappears at full size the
  // moment it closes.
  const anyOverlayOpen = !!internalOverlay || notesPanelOpen || vpnPanelOpen;
  useEffect(() => {
    if (!inElectron) return;
    if (anyOverlayOpen) {
      api.tab.setAllVisible(false);
    } else {
      api.tab.activate(activeId);
    }
  }, [anyOverlayOpen, activeId]);

  // Esc closes any open internal overlay.
  useEffect(() => {
    if (!internalOverlay) return;
    const onKey = (e) => { if (e.key === 'Escape') setInternalOverlay(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [internalOverlay]);

  // Open one of the internal pages as a floating overlay. Closing the
  // overlay restores the user's current tab — no navigation, no extra
  // tab on the strip.
  const openInternal = (name) => setInternalOverlay(name);
  const closeInternal = () => setInternalOverlay(null);

  // Helper for the BrowserView click-into-tab callback: dismiss any open
  // overlay first, so clicking the page area always returns to it.
  const dismissAllOverlays = () => {
    if (internalOverlay) setInternalOverlay(null);
  };

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
          onOpenInternal={openInternal}
        />
        <UpdateBanner />
        <Box sx={{
          flex: 1,
          display: 'flex',
          position: 'relative',
          minHeight: 0,                  // critical: lets nested overflow:auto actually scroll
          // No more right-side reservation for panels. The website always
          // renders at full width; when a panel/overlay opens, the native
          // WebContentsView is hidden entirely (see anyOverlayOpen effect
          // above) so the React panel can render in its place WITHOUT
          // resizing the page underneath. Closing the panel restores the
          // page at full size with no reflow.
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
        <InternalOverlay name={internalOverlay} onClose={closeInternal} onOpen={(u) => { closeInternal(); navigate(u); }} />
      </Box>
    </Box>
  );
}

// =========================================================================
// InternalOverlay — pops one of the internal pages (settings, history,
// downloads, extensions, passwords) as a floating modal on top of whichever
// tab the user was viewing. The active tab's native WebContentsView is
// hidden by App's useEffect while this is open, so the overlay is actually
// visible (native views always render above HTML).
// =========================================================================
function InternalOverlay({ name, onClose, onOpen }) {
  if (!name) return null;
  const titles = {
    history:    'History',
    downloads:  'Downloads',
    passwords:  'Passwords',
    extensions: 'Extensions',
    settings:   'Settings',
  };
  return (
    // Backdrop covers the area under the URL bar; clicking it closes the
    // overlay. We don't dim too aggressively so the user remembers they're
    // still on a page.
    <Box
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      sx={{
        position: 'absolute', inset: 0, zIndex: 40,
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
        p: { xs: 1, sm: 3 },
      }}
    >
      <Paper
        elevation={16}
        sx={{
          width: 'min(1100px, 100%)',
          height: 'min(100%, 92vh)',
          display: 'flex', flexDirection: 'column',
          borderRadius: 3, overflow: 'hidden',
          background: 'rgba(8,9,14,0.98)',
          border: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        <Box sx={{
          display: 'flex', alignItems: 'center', gap: 1,
          px: 2, py: 1.25, borderBottom: '1px solid rgba(255,255,255,0.08)',
        }}>
          <Typography sx={{ flex: 1, fontWeight: 600, color: '#e6e9f5' }}>
            {titles[name] || name}
          </Typography>
          <IconButton size="small" onClick={onClose} sx={{ color: '#9aa3c7' }}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>
        <Box sx={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
          {name === 'history'    && <HistoryPage onOpen={onOpen} />}
          {name === 'downloads'  && <DownloadsPage onOpen={onOpen} />}
          {name === 'passwords'  && <PasswordsPage onOpen={onOpen} />}
          {name === 'extensions' && <ExtensionsPage onOpen={onOpen} />}
          {name === 'settings'   && <SettingsPage onOpen={onOpen} />}
        </Box>
      </Paper>
    </Box>
  );
}
