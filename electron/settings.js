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
};

const SEARCH_ENGINES = {
  duckduckgo: 'https://duckduckgo.com/?q=%s',
  google:     'https://www.google.com/search?q=%s',
  brave:      'https://search.brave.com/search?q=%s',
  bing:       'https://www.bing.com/search?q=%s',
  startpage:  'https://www.startpage.com/sp/search?query=%s',
};

let store = null;
function ensure() {
  if (!store) store = new Store('settings', { defaultValue: { ...DEFAULTS } });
  // Migration: fill in any missing keys with defaults.
  const cur = store.get() || {};
  let changed = false;
  for (const k of Object.keys(DEFAULTS)) {
    if (!(k in cur)) { cur[k] = DEFAULTS[k]; changed = true; }
  }
  if (changed) store.set(cur);
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
