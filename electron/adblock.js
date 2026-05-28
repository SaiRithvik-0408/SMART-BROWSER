// SmartBrowser - built-in ad & tracker blocker.
//
// Self-contained (no remote filter-list download, so it works offline and
// doesn't complicate packaging). Two layers:
//   1. Network blocking via session.webRequest.onBeforeRequest — drops requests
//      to known ad/tracker hosts and ad-serving URL paths (incl. YouTube ads).
//   2. Cosmetic hiding via injected CSS — removes leftover ad placeholders.
//
// Blocking can be toggled at runtime; stats track how many requests were cut.

const { session } = require('electron');

// Known ad / tracker / analytics hosts. Matched against the request hostname
// and all of its parent domains (so `x.doubleclick.net` matches `doubleclick.net`).
const BLOCKED_HOSTS = new Set([
  'doubleclick.net',
  'googlesyndication.com',
  'googleadservices.com',
  'google-analytics.com',
  'googletagmanager.com',
  'googletagservices.com',
  'adservice.google.com',
  'pagead2.googlesyndication.com',
  'analytics.google.com',
  'admob.com',
  'admob.google.com',
  'amazon-adsystem.com',
  'adnxs.com',
  'adsrvr.org',
  'adroll.com',
  'advertising.com',
  'criteo.com',
  'criteo.net',
  'outbrain.com',
  'taboola.com',
  'scorecardresearch.com',
  'quantserve.com',
  'quantcount.com',
  'moatads.com',
  'rubiconproject.com',
  'pubmatic.com',
  'openx.net',
  'casalemedia.com',
  'smartadserver.com',
  'zedo.com',
  'bidswitch.net',
  'mathtag.com',
  'serving-sys.com',
  'adform.net',
  'media.net',
  'sharethrough.com',
  'gumgum.com',
  'sonobi.com',
  'teads.tv',
  'yieldmo.com',
  'indexww.com',
  'contextweb.com',
  'spotxchange.com',
  'spotx.tv',
  '3lift.com',
  'bluekai.com',
  'demdex.net',
  'krxd.net',
  'crwdcntrl.net',
  'agkn.com',
  'rlcdn.com',
  'mookie1.com',
  'adsafeprotected.com',
  'doubleverify.com',
  'flashtalking.com',
  'taboolanews.com',
  'hotjar.com',
  'mixpanel.com',
  'segment.com',
  'segment.io',
  'amplitude.com',
  'fullstory.com',
  'mouseflow.com',
  'clarity.ms',
  'newrelic.com',
  'nr-data.net',
  'branch.io',
  'appsflyer.com',
  'adjust.com',
  'kochava.com',
  'chartbeat.com',
  'parsely.com',
  'optimizely.com',
  'crazyegg.com',
  'inspectlet.com',
  'yandex.ru',
  'mc.yandex.ru',
  'ads.yahoo.com',
  'ads.linkedin.com',
  'analytics.twitter.com',
  'ads-twitter.com',
  'connect.facebook.net',
  'pixel.facebook.com',
  'ads.tiktok.com',
  'analytics.tiktok.com',
  'snapchat.com/p',
  'sc-static.net',
  'onaudience.com',
  'rfihub.com',
  'turn.com',
  'tapad.com',
  'eyeota.net',
  'liadm.com',
  'permutive.com',
  'cdn.permutive.com',
  'adsystem.com',
]);

// URL-path substrings that signal an ad/tracking request even on a first-party
// host. Critical for YouTube (ads come from youtube.com / googlevideo.com).
const BLOCKED_PATHS = [
  '/pagead/',
  '/pagead2/',
  '/get_video_ads',
  '/api/stats/ads',
  '/api/stats/atr',
  '/ptracking',
  '/ad_break',
  '/adview',
  '/doubleclick',
  '/googleads',
  '/gampad/',
  '/adsense/',
  '/prebid',
  '/openrtb',
  '/header-bidding',
  '/track/event',
  '/collect?',
  '/beacon?',
  '/telemetry',
  '/log_event',
];

let enabled = true;
let blockedCount = 0;
let installed = false;

function hostIsBlocked(hostname) {
  if (BLOCKED_HOSTS.has(hostname)) return true;
  // Walk parent domains: a.b.doubleclick.net -> b.doubleclick.net -> doubleclick.net
  const parts = hostname.split('.');
  for (let i = 1; i < parts.length - 1; i++) {
    if (BLOCKED_HOSTS.has(parts.slice(i).join('.'))) return true;
  }
  return false;
}

function shouldBlock(url) {
  let parsed;
  try { parsed = new URL(url); } catch { return false; }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
  if (hostIsBlocked(parsed.hostname)) return true;
  const pathAndQuery = parsed.pathname + parsed.search;
  for (const frag of BLOCKED_PATHS) {
    if (pathAndQuery.includes(frag)) return true;
  }
  return false;
}

// Cosmetic CSS — hides ad containers and Premium upsells that aren't
// network-blockable. Uses Chromium's :has() (supported since 105; we ship 124+).
const COSMETIC_CSS = `
  /* === YouTube ads === */
  ytd-promoted-sparkles-web-renderer,
  ytd-promoted-sparkles-text-search-renderer,
  ytd-promoted-video-renderer,
  ytd-display-ad-renderer,
  ytd-ad-slot-renderer,
  ytd-in-feed-ad-layout-renderer,
  ytd-banner-promo-renderer,
  ytd-statement-banner-renderer,
  ytd-merch-shelf-renderer,
  ytd-action-companion-ad-renderer,
  ytd-companion-slot-renderer,
  ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-ads"],
  .ytp-ad-module,
  .ytp-ad-overlay-slot,
  .ytp-ad-text-overlay,
  .video-ads.ytp-ad-module,
  ytd-reel-video-renderer[is-ad],
  #masthead-ad,
  #player-ads,
  #panels ytd-ads-engagement-panel-content-renderer,

  /* === YouTube Premium upsells (the "Remove ads" button etc.) === */
  yt-mealbar-promo-renderer,
  ytd-mealbar-promo-renderer,
  ytd-premium-promo-renderer,
  ytmusic-mealbar-promo-renderer,
  ytd-rich-section-renderer:has(ytd-statement-banner-renderer),
  yt-button-view-model:has([aria-label*="Premium" i]),
  yt-button-view-model:has([aria-label*="Remove ads" i]),
  ytd-button-renderer:has([aria-label*="Premium" i]),
  ytd-button-renderer:has([aria-label*="Remove ads" i]),
  tp-yt-paper-button[aria-label*="Premium" i],
  a[href*="/premium"],

  /* === Generic ad slots === */
  ins.adsbygoogle,
  [id^="google_ads_"],
  [id^="div-gpt-ad"],
  [class*="-ad-container"],
  [class*="advertisement"],
  [aria-label="Advertisement"],
  [aria-label="Sponsored"],
  [aria-label="Promoted"] {
    display: none !important;
  }
`;

// Injected JS — catches Premium upsells / "Remove ads" buttons that don't have
// stable aria-labels. Runs on every relevant page and re-runs as the DOM
// changes (YouTube renders most UI asynchronously).
const COSMETIC_JS = `
(function(){
  if (window.__sbAdHide) return;
  window.__sbAdHide = true;
  var KILL_TEXTS = ['remove ads','try premium','get youtube premium','upgrade to premium','youtube premium'];
  function sweep(){
    var nodes = document.querySelectorAll('button, a, yt-button-view-model, ytd-button-renderer, tp-yt-paper-button');
    for (var i=0;i<nodes.length;i++) {
      var el = nodes[i];
      if (el.__sbHidden) continue;
      var t = (el.textContent||'').trim().toLowerCase();
      if (!t) continue;
      for (var j=0;j<KILL_TEXTS.length;j++) {
        if (t === KILL_TEXTS[j] || (t.length < 40 && t.indexOf(KILL_TEXTS[j]) !== -1)) {
          el.__sbHidden = true;
          el.style.display = 'none';
          // Walk up to a containing renderer and hide it too.
          var p = el.parentElement, hops = 0;
          while (p && hops < 5) {
            if (p.tagName && /-RENDERER$|VIEW-MODEL$/.test(p.tagName)) { p.style.display='none'; break; }
            p = p.parentElement; hops++;
          }
          break;
        }
      }
    }
  }
  sweep();
  var pending = false;
  var mo = new MutationObserver(function(){
    if (pending) return;
    pending = true;
    setTimeout(function(){ pending = false; sweep(); }, 250);
  });
  mo.observe(document.documentElement, { childList: true, subtree: true });
})();
`;

function install(ses) {
  if (installed) return;
  installed = true;
  // Accept an explicit session so we can target the same partition the tabs
  // use. Falls back to defaultSession for any caller that forgets.
  const target = ses || session.defaultSession;
  target.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (details, callback) => {
    if (enabled && shouldBlock(details.url)) {
      blockedCount++;
      return callback({ cancel: true });
    }
    callback({ cancel: false });
  });
}

// Inject cosmetic CSS + JS into a tab's webContents (call on dom-ready).
// Skips the React shell (file://) and other non-web pages.
function applyCosmetic(webContents) {
  if (!enabled || !webContents || webContents.isDestroyed?.()) return;
  let url = '';
  try { url = webContents.getURL(); } catch {}
  if (!/^https?:/.test(url)) return;
  try { webContents.insertCSS(COSMETIC_CSS); } catch {}
  try { webContents.executeJavaScript(COSMETIC_JS, true).catch(() => {}); } catch {}
}

module.exports = {
  install,
  applyCosmetic,
  isEnabled: () => enabled,
  setEnabled: (v) => { enabled = !!v; },
  stats: () => ({ enabled, blocked: blockedCount }),
};
