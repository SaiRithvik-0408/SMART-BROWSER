// SmartBrowser - settings store.
//
// User-facing browser settings persisted to userData/sb-store/settings.json.
// The renderer reads via `settings:get` and writes via `settings:set`. Some
// settings (adblock, history-enabled) push their changes into the relevant
// modules immediately.

const { Store } = require('./store');

const DEFAULTS = {
  searchEngine: 'duckduckgo',      // duckduckgo | google | brave | bing | startpage
  adblockEnabled: true,
  historyEnabled: true,
  showWidgets: true,
  showNews: true,
  showFavorites: true,
  defaultAI: 'chatgpt',            // chatgpt | gemini | claude
  startupBehavior: 'home',         // home | restore (future)
  // AI API keys — stored as plain text in userData/sb-store/settings.json.
  // We don't encrypt them here because that would require unlocking on every
  // app start; if you need at-rest encryption, put the file on a FileVault /
  // BitLocker / LUKS volume.
  aiKeys: {
    openai:    '',                 // sk-...
    gemini:    '',                 // AIza...
    anthropic: '',                 // sk-ant-... (note: browser CORS blocks; reserved for future)
  },
  // Model overrides — sensible defaults that work on free tiers.
  aiModels: {
    openai: 'gpt-4o-mini',
    gemini: 'gemini-1.5-flash',
  },
};

const SEARCH_ENGINES = {
  duckduckgo: 'https://duckduckgo.com/?q=%s',
  google:     'https://www.google.com/search?q=%s',
  brave:      'https://search.brave.com/search?q=%s',
  bing:       'https://www.bing.com/search?q=%s',
  startpage:  'https://www.startpage.com/sp/search?query=%s',
};

let store = null;
// Deep-fill: recursively add any default keys that are missing in `cur`,
// leaving existing user values untouched. Returns true if anything changed.
function deepFill(cur, defaults) {
  let changed = false;
  for (const k of Object.keys(defaults)) {
    if (!(k in cur)) {
      cur[k] = defaults[k];
      changed = true;
    } else if (defaults[k] && typeof defaults[k] === 'object' && !Array.isArray(defaults[k])) {
      if (!cur[k] || typeof cur[k] !== 'object') {
        cur[k] = { ...defaults[k] };
        changed = true;
      } else if (deepFill(cur[k], defaults[k])) {
        changed = true;
      }
    }
  }
  return changed;
}

function ensure() {
  if (!store) store = new Store('settings', { defaultValue: { ...DEFAULTS } });
  const cur = store.get() || {};
  if (deepFill(cur, DEFAULTS)) store.set(cur);
  return store;
}

function get() { return { ...ensure().get() }; }

function set(patch) {
  const cur = ensure().get();
  const next = { ...cur, ...patch };
  ensure().set(next);
  return next;
}

function searchUrlFor(q) {
  const engine = (get().searchEngine || 'duckduckgo').toLowerCase();
  const tpl = SEARCH_ENGINES[engine] || SEARCH_ENGINES.duckduckgo;
  return tpl.replace('%s', encodeURIComponent(q));
}

module.exports = { get, set, searchUrlFor, DEFAULTS, SEARCH_ENGINES };
