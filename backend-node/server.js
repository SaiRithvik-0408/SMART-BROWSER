// SmartBrowser - Node.js backend (full-method, cookie-aware reverse proxy)
// Same API contract as the Spring Boot version.

import express from 'express';
import cors from 'cors';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { HttpsProxyAgent } from 'https-proxy-agent';
import http from 'node:http';
import https from 'node:https';
import { URL } from 'node:url';
import zlib from 'node:zlib';

const PORT = process.env.PORT || 8080;
const PUBLIC_HOST = process.env.PUBLIC_HOST || `http://localhost:${PORT}`;
const PROXY_PREFIX = `${PUBLIC_HOST}/api/proxy?url=`;
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// ---------- VPN state ----------
const state = {
  desired: false,           // user pressed "Connect"
  tunnelHealthy: false,     // last connectivity check succeeded
  visibleIp: null,          // last observed exit IP
  visibleIpDirect: null,    // exit IP when VPN is off (for comparison)
  activeServerId: '',
  // All servers below are FREE — they route through a local Tor instance that
  // Electron spawns on app launch. Country-specific entries use ExitNodes in
  // their torrc so only exits from that country are picked. Tor's exit-node
  // count varies wildly by country: US/DE/NL/FR have hundreds; SG ~10; IN ~0.
  // We only ship entries with viable exit pools.
  servers: [
    { id: 'tor-any', label: 'Tor - Anywhere (random exit)', country: 'XX', flag: 'XX',
      host: '127.0.0.1', port: 9050, type: 'SOCKS5', latencyMs: 0, lat: 0, lon: 0 },
    { id: 'tor-us',  label: 'Tor - United States',          country: 'US', flag: 'US',
      host: '127.0.0.1', port: 9051, type: 'SOCKS5', latencyMs: 0, lat: 40.7128, lon: -74.006 },
    { id: 'tor-de',  label: 'Tor - Germany',                country: 'DE', flag: 'DE',
      host: '127.0.0.1', port: 9052, type: 'SOCKS5', latencyMs: 0, lat: 50.1109, lon: 8.6821 },
    { id: 'tor-nl',  label: 'Tor - Netherlands',            country: 'NL', flag: 'NL',
      host: '127.0.0.1', port: 9053, type: 'SOCKS5', latencyMs: 0, lat: 52.3676, lon: 4.9041 },
    { id: 'tor-fr',  label: 'Tor - France',                 country: 'FR', flag: 'FR',
      host: '127.0.0.1', port: 9054, type: 'SOCKS5', latencyMs: 0, lat: 48.8566, lon: 2.3522 },
  ],
};

function activeServer() {
  return state.servers.find((s) => s.id === state.activeServerId) || null;
}

function isTunnelConfigured() {
  const s = activeServer();
  return !!(state.desired && s && s.host && s.host.length > 0);
}

function isTunnelActive() {
  return isTunnelConfigured() && state.tunnelHealthy;
}

function buildAgent(useTunnel) {
  if (!useTunnel) return undefined;
  const s = activeServer();
  if (!s || !s.host) return undefined;
  if (s.type === 'SOCKS5') return new SocksProxyAgent(`socks5h://${s.host}:${s.port}`);
  return new HttpsProxyAgent(`http://${s.host}:${s.port}`);
}

// ---------- Cookie jar (per upstream host) ----------
const cookieJar = new Map();    // host -> Map<cookieName, cookieValue>

function storeSetCookies(host, setCookieHeader) {
  if (!setCookieHeader) return;
  const list = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
  let bucket = cookieJar.get(host);
  if (!bucket) { bucket = new Map(); cookieJar.set(host, bucket); }
  for (const sc of list) {
    const first = String(sc).split(';')[0];
    const eq = first.indexOf('=');
    if (eq === -1) continue;
    const name = first.slice(0, eq).trim();
    const value = first.slice(eq + 1).trim();
    if (!name) continue;
    bucket.set(name, value);
  }
}

function cookieHeaderFor(host) {
  const bucket = cookieJar.get(host);
  if (!bucket || bucket.size === 0) return null;
  return [...bucket.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}

// ---------- URL rewriting ----------
const HTML_ATTR   = /(\s(?:src|href|action|poster|data-src|data-href|formaction)\s*=\s*)(['"])([^'"]+)\2/gi;
const SRCSET_ATTR = /(\ssrcset\s*=\s*)(['"])([^'"]+)\2/gi;
const META_REFRESH= /(<meta[^>]+http-equiv=["']?refresh["']?[^>]+content=["'][^"']*url=)([^"'>]+)/gi;
// Strip target="_blank"/_top/_parent on <a> and <form>; force navigation to stay inside the iframe
const TARGET_ATTR = /\starget\s*=\s*(['"])(_blank|_top|_parent|_new)\1/gi;
const CSS_URL     = /url\(\s*['"]?([^'")]+)['"]?\s*\)/gi;
const CSS_IMPORT  = /@import\s+(?:url\()?\s*['"]([^'"]+)['"]\s*\)?/gi;

function proxify(raw, baseUrl) {
  if (!raw) return raw;
  const t = String(raw).trim();
  const lower = t.toLowerCase();
  if (lower.startsWith('data:') || lower.startsWith('blob:') ||
      lower.startsWith('javascript:') || lower.startsWith('mailto:') ||
      lower.startsWith('tel:') || lower.startsWith('#') ||
      lower.startsWith('about:') || lower.startsWith('ws:') || lower.startsWith('wss:')) return t;
  if (t.includes('/api/proxy?url=')) return t;
  try {
    const abs = new URL(t, baseUrl).href;
    return PROXY_PREFIX + encodeURIComponent(abs);
  } catch {
    return t;
  }
}

function rewriteHtml(html, baseUrl) {
  let out = html;
  out = out.replace(HTML_ATTR, (_m, prefix, q, url) => `${prefix}${q}${proxify(url, baseUrl)}${q}`);
  out = out.replace(SRCSET_ATTR, (_m, prefix, q, list) => {
    const rewritten = list.split(',').map((part) => {
      const entry = part.trim();
      const sp = entry.indexOf(' ');
      const u = sp === -1 ? entry : entry.slice(0, sp);
      const desc = sp === -1 ? '' : entry.slice(sp);
      return proxify(u, baseUrl) + desc;
    }).join(', ');
    return `${prefix}${q}${rewritten}${q}`;
  });
  out = out.replace(META_REFRESH, (_m, lead, url) => lead + proxify(url, baseUrl));
  // Force every link/form to stay inside our iframe (no host-browser popups)
  out = out.replace(TARGET_ATTR, ' target="_self"');

  // Runtime hook: keep ALL navigation inside the iframe, sync URL bar to parent
  const hook = `<script>(function(){
    var PROXY=${JSON.stringify(PROXY_PREFIX)};
    var BASE=${JSON.stringify(baseUrl)};
    function abs(u){try{return new URL(u, BASE).href;}catch(e){return u;}}
    function wrap(u){
      if(!u) return u;
      if(typeof u!=='string'){ try{u=String(u);}catch(e){return u;} }
      if(u.indexOf(PROXY)===0) return u;
      if(/^(data|blob|javascript|mailto|tel|about):/i.test(u)) return u;
      if(/^wss?:\\/\\//i.test(u)) return u;
      return PROXY+encodeURIComponent(abs(u));
    }
    function unwrap(u){
      try{
        var s = String(u);
        var i = s.indexOf('/api/proxy?url=');
        if(i<0) return BASE;
        return decodeURIComponent(s.slice(i + '/api/proxy?url='.length).split('&')[0]);
      }catch(e){ return BASE; }
    }
    function notifyParent(reason){
      try{
        parent.postMessage({
          source:'smartbrowser-iframe',
          reason: reason,
          url: unwrap(location.href),
          title: document.title || ''
        }, '*');
      }catch(e){}
    }

    // fetch
    var of=window.fetch;
    if(of) window.fetch=function(input,init){
      if(typeof input==='string') return of(wrap(input),init);
      if(input && input.url){ try{ input = new Request(wrap(input.url), input); }catch(e){} }
      return of(input,init);
    };
    // XHR
    var ox=window.XMLHttpRequest && window.XMLHttpRequest.prototype.open;
    if(ox) window.XMLHttpRequest.prototype.open=function(m,u){ return ox.call(this,m,wrap(u)); };
    // history
    try{
      var ps=history.pushState, rs=history.replaceState;
      history.pushState=function(s,t,u){ var r=ps.call(this,s,t, u?wrap(u):u); notifyParent('pushState'); return r; };
      history.replaceState=function(s,t,u){ var r=rs.call(this,s,t, u?wrap(u):u); notifyParent('replaceState'); return r; };
      addEventListener('popstate', function(){ notifyParent('popstate'); });
      addEventListener('hashchange', function(){ notifyParent('hashchange'); });
    }catch(e){}
    // forms
    try{
      var so=window.HTMLFormElement && window.HTMLFormElement.prototype.submit;
      if(so) window.HTMLFormElement.prototype.submit=function(){
        if(this.action) this.action=wrap(this.action);
        if(this.target && /_blank|_top|_parent|_new/i.test(this.target)) this.target='_self';
        return so.call(this);
      };
      addEventListener('submit', function(ev){
        var f=ev.target; if(!f || f.tagName!=='FORM') return;
        if(f.action) f.action=wrap(f.action);
        if(f.target && /_blank|_top|_parent|_new/i.test(f.target)) f.target='_self';
      }, true);
    }catch(e){}
    // window.open  ->  navigate same window (stay in iframe)
    try{
      window.open = function(u){ if(u) location.href = wrap(u); return window; };
    }catch(e){}
    // Click hijack: catch <a target="_blank">, ctrl-click, middle-click — all stay in iframe
    addEventListener('click', function(ev){
      var a = ev.target && ev.target.closest && ev.target.closest('a[href]');
      if(!a) return;
      var href = a.getAttribute('href');
      if(!href) return;
      if(/^(javascript|mailto|tel|about|data|blob):/i.test(href)) return;
      ev.preventDefault();
      ev.stopPropagation();
      location.href = wrap(href);
    }, true);
    addEventListener('auxclick', function(ev){
      var a = ev.target && ev.target.closest && ev.target.closest('a[href]');
      if(!a) return;
      ev.preventDefault();
      ev.stopPropagation();
      location.href = wrap(a.getAttribute('href'));
    }, true);

    // Push URL + title to parent on load and whenever title changes
    function pushTitle(){ notifyParent('init'); }
    if(document.readyState==='complete') pushTitle();
    else addEventListener('load', pushTitle);
    try{
      var titleEl = document.querySelector('title');
      if(titleEl){
        new MutationObserver(function(){ notifyParent('title'); }).observe(titleEl, {childList:true});
      }
    }catch(e){}
  })();</script>`;

  const headOpenIdx = out.search(/<head[^>]*>/i);
  if (headOpenIdx >= 0) {
    const tagEnd = out.indexOf('>', headOpenIdx) + 1;
    out = out.slice(0, tagEnd) + hook + out.slice(tagEnd);
  } else {
    out = hook + out;
  }
  return out;
}

function rewriteCss(css, baseUrl) {
  let out = css.replace(CSS_URL, (_m, u) => `url("${proxify(u, baseUrl)}")`);
  out = out.replace(CSS_IMPORT, (_m, u) => `@import url("${proxify(u, baseUrl)}")`);
  return out;
}

// ---------- Upstream request (supports any method, body, redirects, VPN) ----------
function upstream(targetUrl, { method = 'GET', headers = {}, body = null, useTunnel = false, depth = 0 } = {}) {
  return new Promise((resolve, reject) => {
    if (depth > 5) return reject(new Error('Too many redirects'));
    let parsed;
    try { parsed = new URL(targetUrl); } catch (e) { return reject(e); }
    const isHttps = parsed.protocol === 'https:';
    const lib = isHttps ? https : http;
    const agent = buildAgent(useTunnel);

    const outHeaders = {
      'User-Agent': UA,
      'Accept': headers['accept'] || 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': headers['accept-language'] || 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Host': parsed.host,
    };
    if (headers['content-type']) outHeaders['Content-Type'] = headers['content-type'];
    if (headers['origin'])  outHeaders['Origin']  = `${parsed.protocol}//${parsed.host}`;
    if (headers['referer']) outHeaders['Referer'] = `${parsed.protocol}//${parsed.host}/`;
    const ck = cookieHeaderFor(parsed.host);
    if (ck) outHeaders['Cookie'] = ck;

    const req = lib.request({
      host: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method,
      agent,
      headers: outHeaders,
      timeout: 45000,
    }, (res) => {
      const status = res.statusCode || 0;
      storeSetCookies(parsed.host, res.headers['set-cookie']);

      if (status >= 300 && status < 400 && res.headers.location) {
        res.resume();
        const next = new URL(res.headers.location, targetUrl).href;
        return upstream(next, { method: 'GET', headers, useTunnel, depth: depth + 1 })
          .then(resolve, reject);
      }

      const chunks = [];
      let stream = res;
      const enc = (res.headers['content-encoding'] || '').toLowerCase();
      if (enc === 'gzip')         stream = res.pipe(zlib.createGunzip());
      else if (enc === 'br')      stream = res.pipe(zlib.createBrotliDecompress());
      else if (enc === 'deflate') stream = res.pipe(zlib.createInflate());

      stream.on('data', (c) => chunks.push(c));
      stream.on('end',   () => resolve({ status, headers: res.headers, body: Buffer.concat(chunks), finalUrl: targetUrl }));
      stream.on('error', reject);
    });

    req.on('timeout', () => req.destroy(new Error('Connection timeout')));
    req.on('error', reject);
    if (body && body.length) req.write(body);
    req.end();
  });
}

// ---------- HTTP API ----------
const app = express();
// Allow any origin (including the file:// scheme Electron uses in production).
// We don't rely on cookies for the local API, so credentials are off.
app.use(cors({ origin: '*', credentials: false }));
app.use(express.json());
app.use(express.raw({ type: '*/*', limit: '20mb' }));   // raw body buffer for proxy POSTs

// VPN endpoints
app.get('/api/vpn/status', async (_req, res) => {
  const tunnelActive = isTunnelActive();
  res.json({
    enabled: tunnelActive,
    desired: state.desired,
    configured: isTunnelConfigured(),
    activeServer: activeServer(),
    visibleIp: state.visibleIp,
    visibleIpDirect: state.visibleIpDirect,
    health: state.tunnelHealthy ? 'ok' : (state.desired ? 'unreachable' : 'idle'),
    note: !isTunnelConfigured() && state.desired
      ? 'No SOCKS host configured for this server. Edit backend-node/server.js → state.servers and set host/port (e.g. Tor: 127.0.0.1:9050).'
      : null,
  });
});

app.get('/api/vpn/servers', (_req, res) => res.json(state.servers));

app.post('/api/vpn/connect', async (req, res) => {
  const id = (req.body && req.body.serverId) || '';
  state.activeServerId = id;
  state.desired = true;
  state.tunnelHealthy = false;
  console.log(`[VPN] CONNECT request -> ${id}`);
  await runIpCheck();
  res.json({
    enabled: isTunnelActive(),
    activeServer: activeServer(),
    visibleIp: state.visibleIp,
    health: state.tunnelHealthy ? 'ok' : 'unreachable',
    note: !isTunnelConfigured()
      ? 'Server has no SOCKS host configured — running direct (no masking).'
      : null,
  });
});

app.post('/api/vpn/disconnect', async (_req, res) => {
  state.desired = false;
  state.tunnelHealthy = false;
  console.log('[VPN] DISCONNECT');
  await runIpCheck();
  res.json({ enabled: false, activeServer: activeServer(), visibleIp: state.visibleIp });
});

app.get('/api/vpn/check', async (_req, res) => {
  const result = await runIpCheck();
  res.json(result);
});

async function runIpCheck() {
  // Always re-measure the *direct* (no-tunnel) IP and, if configured, the tunneled IP.
  state.visibleIpDirect = await safeIp(false);
  if (isTunnelConfigured()) {
    const tunnelIp = await safeIp(true);
    if (tunnelIp) {
      state.visibleIp = tunnelIp;
      state.tunnelHealthy = tunnelIp !== state.visibleIpDirect;
    } else {
      state.visibleIp = null;
      state.tunnelHealthy = false;
    }
  } else {
    state.visibleIp = state.visibleIpDirect;
    state.tunnelHealthy = false;
  }
  return {
    direct: state.visibleIpDirect,
    tunneled: isTunnelConfigured() ? state.visibleIp : null,
    masked: state.tunnelHealthy,
    server: activeServer(),
  };
}

async function safeIp(useTunnel) {
  try {
    const r = await upstream('https://api.ipify.org?format=json', { useTunnel });
    if (r.status >= 200 && r.status < 300) {
      try { return JSON.parse(r.body.toString('utf-8')).ip; } catch {}
    }
  } catch (e) {
    console.warn(`[VPN] IP check failed (useTunnel=${useTunnel}): ${e.message}`);
  }
  return null;
}

// Proxy endpoint — handles ALL methods
app.all('/api/proxy', async (req, res) => {
  let url = req.query.url;
  if (!url) return res.status(400).send('missing url');
  if (Array.isArray(url)) url = url[0];
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;

  const incoming = {};
  for (const [k, v] of Object.entries(req.headers)) incoming[k.toLowerCase()] = v;

  const body = (req.method === 'GET' || req.method === 'HEAD') ? null
    : (Buffer.isBuffer(req.body) ? req.body
        : (req.body && Object.keys(req.body).length ? Buffer.from(JSON.stringify(req.body)) : null));

  try {
    const r = await upstream(url, {
      method: req.method,
      headers: incoming,
      body,
      useTunnel: isTunnelActive(),
    });
    const ct = (r.headers['content-type'] || 'application/octet-stream').toString();
    let out = r.body;
    let finalType = ct;

    if (ct.toLowerCase().includes('text/html')) {
      out = Buffer.from(rewriteHtml(out.toString('utf-8'), r.finalUrl), 'utf-8');
      finalType = 'text/html; charset=utf-8';
    } else if (ct.toLowerCase().includes('text/css')) {
      out = Buffer.from(rewriteCss(out.toString('utf-8'), r.finalUrl), 'utf-8');
      finalType = 'text/css; charset=utf-8';
    }

    const drop = new Set([
      'content-encoding', 'content-length', 'transfer-encoding',
      'content-security-policy', 'content-security-policy-report-only',
      'x-frame-options', 'cross-origin-opener-policy',
      'cross-origin-embedder-policy', 'cross-origin-resource-policy',
      'strict-transport-security', 'set-cookie',  // we already absorbed into our jar
    ]);
    for (const [k, v] of Object.entries(r.headers)) {
      if (drop.has(k.toLowerCase())) continue;
      try { res.setHeader(k, v); } catch {}
    }
    res.setHeader('Content-Type', finalType);
    res.setHeader('Content-Length', out.length);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(r.status).end(out);
  } catch (e) {
    console.error(`[PROXY] ${req.method} ${url} -> ${e.message}`);
    res.status(502).type('html').send(errorHtml(url, e));
  }
});

function errorHtml(url, err) {
  const safe = (s) => String(s).replace(/[<>]/g, (c) => ({ '<': '&lt;', '>': '&gt;' }[c]));
  return `<!doctype html><html><head><meta charset="utf-8"><title>SmartBrowser - Error</title>
    <style>body{font-family:system-ui;background:#0b1020;color:#e6e9f5;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}
    .c{max-width:560px;padding:32px;border:1px solid #2a3158;border-radius:16px;background:linear-gradient(180deg,#141a36,#0e1330)}
    h1{margin:0 0 8px;font-size:20px;color:#7aa2ff}code{color:#a78bfa;font-family:JetBrains Mono,monospace}</style></head>
    <body><div class="c"><h1>SmartBrowser couldn't load this page</h1>
    <p>${safe(url)}</p><code>${safe(err.name)}: ${safe(err.message)}</code></div></body></html>`;
}

app.listen(PORT, async () => {
  console.log(`SmartBrowser backend ready  http://localhost:${PORT}`);
  await runIpCheck();
  console.log(`  Direct IP: ${state.visibleIpDirect || '(check failed)'}`);
  console.log(`  GET  /api/proxy?url=<encoded>   (also POST/PUT/PATCH/DELETE/HEAD/OPTIONS)`);
  console.log(`  GET  /api/vpn/{status,servers,check}`);
  console.log(`  POST /api/vpn/{connect,disconnect}`);
});
