import React, { useEffect, useMemo, useState } from 'react';
import { Box } from '@mui/material';
import TopBar from './components/TopBar';
import TabsBar from './components/TabsBar';
import BrowserView from './components/BrowserView';
import VpnPanel from './components/VpnPanel';
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
        if (last === url) return { ...t, title: url };
        const trimmed = t.history.slice(0, t.cursor + 1);
        const next = [...trimmed, url];
        return { ...t, history: next, cursor: next.length - 1, title: url, _displayUrl: url };
      }
      const trimmed = t.history.slice(0, t.cursor + 1);
      const next = [...trimmed, url];
      return { ...t, url, history: next, cursor: next.length - 1, title: url, _displayUrl: undefined };
    });
  };

  const back     = () => { if (inElectron && active && active.url !== 'home') api.tab.back(active.id);
                           else updateActive(t => t.cursor > 0 ? { ...t, cursor: t.cursor - 1, url: t.history[t.cursor - 1] } : t); };
  const forward  = () => { if (inElectron && active && active.url !== 'home') api.tab.forward(active.id);
                           else updateActive(t => t.cursor < t.history.length - 1 ? { ...t, cursor: t.cursor + 1, url: t.history[t.cursor + 1] } : t); };
  const reload   = () => { if (inElectron && active && active.url !== 'home') api.tab.reload(active.id);
                           else updateActive(t => ({ ...t, url: t.url + '' })); };
  const home     = () => navigate('home');

  const addTab = () => {
    const t = newTab('home');
    setTabs(prev => [...prev, t]);
    setActiveId(t.id);
  };
  const closeTab = (id) => {
    setTabs(prev => {
      const idx = prev.findIndex(t => t.id === id);
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

  return (
    <Box sx={{ width: '100vw', height: '100vh', position: 'relative', overflow: 'hidden' }}>
      <ThreeBackground active={vpnStatus.enabled} />

      <Box sx={{ position: 'relative', zIndex: 2, display: 'flex', flexDirection: 'column', height: '100%' }}>
        <TopBar
          url={active?.url === 'home' ? '' : (active?._displayUrl || active?.url)}
          onNavigate={navigate}
          onBack={back} onForward={forward} onReload={reload} onHome={home} onNewTab={addTab}
          vpnOn={vpnStatus.enabled}
          activeServerLabel={vpnStatus.activeServer?.label}
          onToggleVpnPanel={() => setVpnPanelOpen(v => !v)}
        />
        <TabsBar
          tabs={tabs} activeId={activeId}
          onSelect={setActiveId}
          onClose={closeTab}
        />
        <UpdateBanner />
        <Box sx={{
          flex: 1,
          display: 'flex',
          position: 'relative',
          // Reserve space on the right for the VPN panel so the page stays visible
          // and the panel area isn't covered by the native WebContentsView.
          pr: vpnPanelOpen ? '400px' : 0,
          transition: 'padding-right 180ms ease',
        }}>
          {tabs.map(t => (
            <Box key={t.id} sx={{ flex: 1, display: t.id === activeId ? 'flex' : 'none' }}>
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
      </Box>
    </Box>
  );
}
