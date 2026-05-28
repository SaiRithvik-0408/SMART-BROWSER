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

  updates: {
    check: () => ipcRenderer.invoke('update:check'),
    apply: () => ipcRenderer.invoke('update:apply'),
    onAvailable: (cb) => {
      const handler = (_e, info) => cb(info);
      ipcRenderer.on('update:available', handler);
      return () => ipcRenderer.removeListener('update:available', handler);
    },
    onProgress: (cb) => {
      const handler = (_e, pct) => cb(pct);
      ipcRenderer.on('update:progress', handler);
      return () => ipcRenderer.removeListener('update:progress', handler);
    },
    onError: (cb) => {
      const handler = (_e, msg) => cb(msg);
      ipcRenderer.on('update:error', handler);
      return () => ipcRenderer.removeListener('update:error', handler);
    },
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
    onPageFocus: (cb) => {
      const handler = (_e, payload) => cb(payload);
      ipcRenderer.on('chrome:page-focus', handler);
      return () => ipcRenderer.removeListener('chrome:page-focus', handler);
    },
  },

  history: {
    list:   (opts) => ipcRenderer.invoke('history:list',   opts || {}),
    remove: (ts)   => ipcRenderer.invoke('history:remove', ts),
    clear:  (opts) => ipcRenderer.invoke('history:clear',  opts || {}),
  },

  downloads: {
    list:   ()    => ipcRenderer.invoke('downloads:list'),
    pause:  (id)  => ipcRenderer.invoke('downloads:pause',  id),
    resume: (id)  => ipcRenderer.invoke('downloads:resume', id),
    cancel: (id)  => ipcRenderer.invoke('downloads:cancel', id),
    open:   (id)  => ipcRenderer.invoke('downloads:open',   id),
    show:   (id)  => ipcRenderer.invoke('downloads:show',   id),
    remove: (id)  => ipcRenderer.invoke('downloads:remove', id),
    clear:  ()    => ipcRenderer.invoke('downloads:clear'),
    onAdded: (cb) => {
      const h = (_e, item) => cb(item);
      ipcRenderer.on('downloads:added', h);
      return () => ipcRenderer.removeListener('downloads:added', h);
    },
    onUpdated: (cb) => {
      const h = (_e, item) => cb(item);
      ipcRenderer.on('downloads:updated', h);
      return () => ipcRenderer.removeListener('downloads:updated', h);
    },
  },

  passwords: {
    available: ()        => ipcRenderer.invoke('passwords:available'),
    list:      ()        => ipcRenderer.invoke('passwords:list'),
    reveal:    (id)      => ipcRenderer.invoke('passwords:reveal', id),
    upsert:    (entry)   => ipcRenderer.invoke('passwords:upsert', entry),
    remove:    (id)      => ipcRenderer.invoke('passwords:remove', id),
  },

  settings: {
    get:       ()       => ipcRenderer.invoke('settings:get'),
    set:       (patch)  => ipcRenderer.invoke('settings:set', patch),
    searchUrl: (q)      => ipcRenderer.invoke('settings:search-url', q),
  },

  notes: {
    list:   ()              => ipcRenderer.invoke('notes:list'),
    get:    (id)            => ipcRenderer.invoke('notes:get', id),
    create: (body)          => ipcRenderer.invoke('notes:create', body || {}),
    update: (id, patch)     => ipcRenderer.invoke('notes:update', { id, patch }),
    remove: (id)            => ipcRenderer.invoke('notes:remove', id),
  },

  extensions: {
    list:          ()                 => ipcRenderer.invoke('extensions:list'),
    installFolder: ()                 => ipcRenderer.invoke('extensions:install-folder'),
    installCrx:    ()                 => ipcRenderer.invoke('extensions:install-crx'),
    remove:        (id)               => ipcRenderer.invoke('extensions:remove', id),
    setEnabled:    (id, enabled)      => ipcRenderer.invoke('extensions:set-enabled', { id, enabled }),
  },

  // Browser-wide actions that the hamburger menu invokes. All target the
  // CURRENTLY ACTIVE tab in the main window — the renderer doesn't have to
  // know which WebContentsView is focused.
  browser: {
    zoom:       (direction)  => ipcRenderer.invoke('browser:zoom', direction),  // 'in' | 'out' | 'reset' | number
    find:       (query)      => ipcRenderer.invoke('browser:find', query || ''),
    print:      ()           => ipcRenderer.invoke('browser:print'),
    savePage:   ()           => ipcRenderer.invoke('browser:save-page'),
    clearData:  (opts)       => ipcRenderer.invoke('browser:clear-data', opts || {}),
  },
  window: {
    newWindow:  ()           => ipcRenderer.invoke('window:new'),
  },
});
