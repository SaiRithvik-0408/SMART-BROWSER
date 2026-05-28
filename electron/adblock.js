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

// Cosmetic CSS — hides common ad containers that aren't network-blockable.
const COSMETIC_CSS = `
  ytd-promoted-sparkles-web-renderer,
  ytd-promoted-video-renderer,
  ytd-display-ad-renderer,
  ytd-ad-slot-renderer,
  ytd-in-feed-ad-layout-renderer,
  .ytp-ad-module,
  #masthead-ad,
  ins.adsbygoogle,
  [id^="google_ads_"],
  [id^="div-gpt-ad"],
  [class*="-ad-container"],
  [class*="advertisement"],
  [aria-label="Advertisement"] {
    display: none !important;
  }
`;

function install() {
  if (installed) return;
  installed = true;
  const ses = session.defaultSession;
  ses.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (details, callback) => {
    if (enabled && shouldBlock(details.url)) {
      blockedCount++;
      return callback({ cancel: true });
    }
    callback({ cancel: false });
  });
}

// Inject cosmetic CSS into a tab's webContents (call on dom-ready).
function applyCosmetic(webContents) {
  if (!enabled) return;
  try { webContents.insertCSS(COSMETIC_CSS); } catch {}
}

module.exports = {
  install,
  applyCosmetic,
  isEnabled: () => enabled,
  setEnabled: (v) => { enabled = !!v; },
  stats: () => ({ enabled, blocked: blockedCount }),
};
