const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('smartBrowserAPI', {
  isElectron: true,
  platform: () => ipcRenderer.invoke('app:platform'),
  version:  () => ipcRenderer.invoke('app:version'),
  applyProxy: (cfg) => ipcRenderer.invoke('vpn:apply-proxy', cfg),

  adblock: {
    stats:      ()        => ipcRenderer.invoke('adblock:stats'),
    setEnabled: (enabled) => ipcRenderer.invoke('adblock:set', enabled),
  },

  tab: {
    create:    (tabId, url) => ipcRenderer.invoke('tab:create',   { tabId, url }),
    destroy:   (tabId)      => ipcRenderer.invoke('tab:destroy',  tabId),
    activate:  (tabId)      => ipcRenderer.invoke('tab:activate', tabId),
    navigate:  (tabId, url) => ipcRenderer.invoke('tab:navigate', { tabId, url }),
    back:      (tabId)      => ipcRenderer.invoke('tab:back',     tabId),
    forward:   (tabId)      => ipcRenderer.invoke('tab:forward',  tabId),
    reload:    (tabId)      => ipcRenderer.invoke('tab:reload',   tabId),
    setBounds: (tabId, b)   => ipcRenderer.invoke('tab:bounds',   { tabId, bounds: b }),
    setAllVisible: (v)      => ipcRenderer.invoke('tab:set-all-visible', v),
    openDevTools:  (tabId)  => ipcRenderer.invoke('tab:open-devtools', tabId),

    onEvent: (cb) => {
      const handler = (_e, payload) => cb(payload);
      ipcRenderer.on('tab:event', handler);
      return () => ipcRenderer.removeListener('tab:event', handler);
    },
    onOpenNew: (cb) => {
      const handler = (_e, payload) => cb(payload.url);
      ipcRenderer.on('tab:open-new', handler);
      return () => ipcRenderer.removeListener('tab:open-new', handler);
    },
  },
});
