import React, { useEffect, useRef, useState } from 'react';
import { Box, LinearProgress } from '@mui/material';
import { proxyUrlFor } from '../api/client';
import HomePage from './HomePage';
import HistoryPage from './HistoryPage';
import DownloadsPage from './DownloadsPage';
import SettingsPage from './SettingsPage';
import PasswordsPage from './PasswordsPage';

const api = typeof window !== 'undefined' ? window.smartBrowserAPI : null;
const inElectron = !!api?.isElectron;

// Internal URL scheme — renders a React page in-tab instead of loading a
// native WebContentsView. Keep in sync with the menu in TopBar.
const INTERNAL_PAGES = {
  'smartbrowser://home':      'home',
  'smartbrowser://history':   'history',
  'smartbrowser://downloads': 'downloads',
  'smartbrowser://settings':  'settings',
  'smartbrowser://passwords': 'passwords',
};
function internalKey(url) {
  if (!url || url === 'home') return 'home';
  return INTERNAL_PAGES[url] || null;
}

export default function BrowserView({ tab, isActive, onTitleChange, onNavigateInTab }) {
  const placeholderRef = useRef(null);
  const iframeRef      = useRef(null);
  const [loading, setLoading] = useState(false);

  const internal = internalKey(tab?.url);
  const isHome   = internal !== null;     // any internal page bypasses the native view

  // ============= Electron: native WebContentsView lifecycle =================
  useEffect(() => {
    if (!inElectron || !tab) return;
    if (isHome) return;                                // home view is React, no native view needed
    api.tab.create(tab.id, tab.url);
    return () => { api.tab.destroy(tab.id); };
  }, [inElectron, tab?.id, isHome]);

  // Activate on mount / when isActive flips
  useEffect(() => {
    if (!inElectron || isHome || !tab) return;
    if (isActive) api.tab.activate(tab.id);
  }, [inElectron, tab?.id, isActive, isHome]);

  // Navigate when tab.url changes (and it's not just the same URL re-rendered)
  const lastNavRef = useRef(null);
  useEffect(() => {
    if (!inElectron || isHome || !tab) return;
    if (lastNavRef.current === tab.url) return;
    lastNavRef.current = tab.url;
    api.tab.navigate(tab.id, tab.url);
  }, [inElectron, tab?.id, tab?.url, isHome]);

  // Mirror the placeholder div's bounds into the native view, including on resize
  useEffect(() => {
    if (!inElectron || isHome || !tab) return;
    const el = placeholderRef.current;
    if (!el) return;
    const push = () => {
      const r = el.getBoundingClientRect();
      api.tab.setBounds(tab.id, {
        x: Math.round(r.left),
        y: Math.round(r.top),
        width:  Math.max(0, Math.round(r.width)),
        height: Math.max(0, Math.round(r.height)),
      });
    };
    push();
    const ro = new ResizeObserver(push);
    ro.observe(el);
    window.addEventListener('resize', push);
    return () => { ro.disconnect(); window.removeEventListener('resize', push); };
  }, [inElectron, tab?.id, isHome]);

  // Listen to native tab events (title/url/loading) for THIS tab
  useEffect(() => {
    if (!inElectron || !tab) return;
    const off = api.tab.onEvent((evt) => {
      if (evt.tabId !== tab.id) return;
      if (evt.type === 'title' && evt.title)   onTitleChange(evt.title);
      if (evt.type === 'nav'   && evt.url)     onNavigateInTab(evt.url, { silent: true });
      if (evt.type === 'loading')              setLoading(!!evt.loading);
    });
    return off;
  }, [inElectron, tab?.id]);

  // ============= Web fallback (iframe): postMessage from rewriter ==========
  useEffect(() => {
    if (inElectron) return;
    const handler = (ev) => {
      const d = ev.data;
      if (!d || d.source !== 'smartbrowser-iframe') return;
      if (d.title) onTitleChange(d.title);
      if (d.url && d.url !== tab?.url) onNavigateInTab(d.url, { silent: true });
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [tab?.url, onTitleChange, onNavigateInTab]);

  if (!tab) return null;

  // Internal pages are React content (no native view) — home / history /
  // downloads / settings / passwords all render in-tab via React.
  if (isHome) {
    const open = (u) => onNavigateInTab(u);
    const InternalView =
      internal === 'history'   ? <HistoryPage   onOpen={open} /> :
      internal === 'downloads' ? <DownloadsPage onOpen={open} /> :
      internal === 'settings'  ? <SettingsPage  onOpen={open} /> :
      internal === 'passwords' ? <PasswordsPage onOpen={open} /> :
                                 <HomePage      onOpen={open} />;
    return (
      <Box sx={{ flex: 1, position: 'relative', overflow: 'auto' }}>
        {InternalView}
      </Box>
    );
  }

  // Electron: just a transparent placeholder; the WebContentsView lives over it natively
  if (inElectron) {
    return (
      <Box sx={{ flex: 1, position: 'relative', m: 1, mt: 0.5, borderRadius: 3, overflow: 'hidden',
                 border: '1px solid rgba(122,162,255,0.18)', background: '#0a0e22' }}>
        {loading && (
          <LinearProgress sx={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 2,
            background: 'transparent',
            '& .MuiLinearProgress-bar': { background: 'linear-gradient(90deg,#7aa2ff,#a78bfa)' } }} />
        )}
        <div ref={placeholderRef} style={{ width: '100%', height: '100%' }} />
      </Box>
    );
  }

  // Web fallback: iframe through /api/proxy
  const src = proxyUrlFor(tab.url);
  return (
    <Box sx={{ flex: 1, position: 'relative', m: 1, mt: 0.5, borderRadius: 3, overflow: 'hidden',
               border: '1px solid rgba(122,162,255,0.18)', background: '#0a0e22' }}>
      {loading && (
        <LinearProgress sx={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 2,
          background: 'transparent',
          '& .MuiLinearProgress-bar': { background: 'linear-gradient(90deg,#7aa2ff,#a78bfa)' } }} />
      )}
      <iframe
        ref={iframeRef}
        src={src}
        title={tab.title || 'SmartBrowser tab'}
        onLoad={() => {
          setLoading(false);
          try {
            const t = iframeRef.current?.contentDocument?.title;
            if (t) onTitleChange(t);
          } catch { /* ignore */ }
        }}
        sandbox="allow-scripts allow-forms allow-same-origin allow-modals allow-downloads"
        style={{ width: '100%', height: '100%', border: 0, display: 'block', background: '#0a0e22' }}
      />
    </Box>
  );
}
