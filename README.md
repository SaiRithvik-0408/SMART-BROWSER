# SmartBrowser

A **privacy-first standalone desktop browser** with a built-in VPN (free, bundled Tor multi-region), real IP masking, and full website masking. Built on Electron + native Chromium `WebContentsView`s with a React / MUI / Three.js UI shell and a Node.js reverse-proxy backend.

> Status: Working desktop app. YouTube/Wikipedia/Reddit etc. render normally in real Chromium tabs. **Five working VPN exits ship out of the box** — Electron auto-spawns five local Tor instances on launch (Anywhere / US / DE / NL / FR), each on its own SOCKS5 port with `ExitNodes` country-locked, and every tab's network is routed through the chosen one via `session.setProxy()`.

---

## Table of Contents

1. [What SmartBrowser is](#1-what-smartbrowser-is)
2. [Architecture](#2-architecture)
3. [Project layout](#3-project-layout)
4. [Quick start (development)](#4-quick-start-development)
5. [Packaging a real `.exe` installer](#5-packaging-a-real-exe-installer)
6. [How the VPN works (and how to make it actually mask your IP)](#6-how-the-vpn-works-and-how-to-make-it-actually-mask-your-ip)
7. [How website / URL masking works](#7-how-website--url-masking-works)
8. [Backend API reference](#8-backend-api-reference)
9. [Keyboard shortcuts](#9-keyboard-shortcuts)
10. [Honest limitations](#10-honest-limitations)
11. [Troubleshooting](#11-troubleshooting)
12. [Tech stack](#12-tech-stack)

---

## 1) What SmartBrowser is

SmartBrowser is a real desktop browser application — not a web page that runs inside another browser. When launched, it opens its own native window (titled `SmartBrowser — Private. Masked. Free.`) with its own Chromium engine, its own tab manager, and its own embedded reverse-proxy backend.

Three privacy properties it tries to give you:

1. **OS-level VPN for this app** — every network request the app's tabs make (HTML, JS, fetch, WebSocket, video chunks, *and DNS via SOCKS5h*) can be routed through an upstream SOCKS5/HTTP proxy via Electron's `session.setProxy()`. Sites see the exit-node IP, not yours.
2. **Site / destination masking** (web fallback mode only) — when the app is opened as a web page in a regular browser, every request is funnelled through `localhost:8080/api/proxy?url=...`, so the local network only sees a single connection to SmartBrowser. *(Not active in Electron mode, where the native webview goes direct.)*
3. **No tracking persistence between launches** — wipe of the `persist:smartbrowser` partition is trivial; the React UI doesn't write anything to disk.

---

## 2) Architecture

```
┌───────────────────────────────────────────────────────────────┐
│  Electron MAIN process                                        │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │ BrowserWindow                                           │  │
│  │  ┌────────────────────────────────────────────────────┐ │  │
│  │  │ React UI  (Vite-built bundle, served from file://) │ │  │
│  │  │  ├─ TopBar (URL bar, back/fwd/reload, shield icon) │ │  │
│  │  │  ├─ TabsBar                                        │ │  │
│  │  │  ├─ HomePage (Three.js wireframe globe + chips)    │ │  │
│  │  │  └─ VpnPanel (MUI overlay)                         │ │  │
│  │  └────────────────────────────────────────────────────┘ │  │
│  │  ┌────────────────────────────────────────────────────┐ │  │
│  │  │  WebContentsView per tab  (native Chromium tab)    │ │  │
│  │  │  Position + visibility driven by IPC + bounds      │ │  │
│  │  │  ResizeObserver in the renderer                    │ │  │
│  │  └────────────────────────────────────────────────────┘ │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                               │
│  Spawned child process:                                       │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │ Node backend (backend-node/server.js)                   │  │
│  │  GET /api/proxy?url=…   ← reverse proxy w/ URL rewrite  │  │
│  │  GET /api/vpn/status                                    │  │
│  │  GET /api/vpn/servers                                   │  │
│  │  GET /api/vpn/check     ← actual IP-change verification │  │
│  │  POST /api/vpn/connect, /api/vpn/disconnect             │  │
│  │  Per-host cookie jar, full method forwarding, gzip/br…  │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                               │
│  When VPN is ON:                                              │
│      session.defaultSession.setProxy({                        │
│        proxyRules: 'socks5://host:port',                      │
│        proxyBypassRules: '127.0.0.1;localhost;<-loopback>'    │
│      })                                                       │
│      ⇒ ALL outbound traffic for this app's network            │
│        goes through the SOCKS endpoint, including DNS         │
│        (via socks5h scheme).                                  │
└───────────────────────────────────────────────────────────────┘
```

### Why `WebContentsView` (not `<webview>` or `<iframe>`)

| Approach                  | DevTools docking          | Site compatibility | Performance       | Used in SmartBrowser                |
| ------------------------- | ------------------------- | ------------------ | ----------------- | ----------------------------------- |
| `<iframe>` (web app mode) | n/a                       | Bad (sandboxed)    | Slowish           | Yes, **only as web fallback**       |
| `<webview>` tag           | Detached window only      | Good               | Good              | Removed in favour of …              |
| `WebContentsView`         | Docks to host window ✓    | Identical to Chrome | Best (native)    | **Yes — the production approach**   |

Chrome itself uses the same pattern (a native top-level window hosting separate native views per tab); switching to `WebContentsView` is what made DevTools dock correctly and lets the React UI sit underneath without weird stacking issues.

---

## 3) Project layout

```
SMART BROWSER/
├── package.json                 ← root: Electron + electron-builder + dev scripts
├── README.md                    ← this file
├── electron/
│   ├── main.js                  ← Electron main: window, tabs, VPN proxy, IPC
│   └── preload.js               ← contextBridge → window.smartBrowserAPI
├── backend-node/
│   ├── package.json
│   └── server.js                ← Express reverse-proxy + VPN status API
├── tor/                         ← bundled Tor Expert Bundle (gitignored binaries)
│   ├── tor/tor.exe              ← daemon, version 0.4.9.8
│   ├── data/{geoip,geoip6}      ← country → IP-range tables (used by ExitNodes)
│   └── configs/
│       ├── torrc-anywhere       ← SocksPort 9050 (no exit restriction)
│       ├── torrc-us             ← SocksPort 9051, ExitNodes {us}
│       ├── torrc-de             ← SocksPort 9052, ExitNodes {de}
│       ├── torrc-nl             ← SocksPort 9053, ExitNodes {nl}
│       └── torrc-fr             ← SocksPort 9054, ExitNodes {fr}
└── frontend/
    ├── package.json
    ├── vite.config.js           ← base: './' so file:// loads work
    ├── index.html
    └── src/
        ├── main.jsx
        ├── App.jsx              ← tab + VPN state, IPC orchestration
        ├── theme.js             ← MUI dark glassmorphism theme
        ├── api/client.js        ← VpnApi + proxyUrlFor
        └── components/
            ├── TopBar.jsx       ← omnibar + nav buttons + shield toggle
            ├── TabsBar.jsx      ← MUI Tabs with close buttons
            ├── BrowserView.jsx  ← placeholder + ResizeObserver (Electron) / iframe (web fallback)
            ├── HomePage.jsx     ← gradient hero, search, shortcuts, feature cards
            ├── VpnPanel.jsx     ← server picker, connect/disconnect, IP check
            └── ThreeBackground.jsx  ← rotating wireframe globe + particles
```

---

## 4) Quick start (development)

### Prerequisites

| Tool      | Version  | How to get it                                   |
| --------- | -------- | ----------------------------------------------- |
| Node.js   | ≥ 20     | <https://nodejs.org/>                            |
| npm       | ≥ 10     | bundled with Node                                |
| (Windows) | any      | PowerShell is fine                              |

### Install

```bash
# At the project root:
npm install                # Electron + electron-builder

# Subprojects:
npm install --prefix frontend
npm install --prefix backend-node
```

### Run (one-shot, recommended)

The Electron main process spawns the Node backend as a child, so you only need one command:

```bash
# 1) Build the React frontend (only needed when frontend code changes)
npm run build:frontend

# 2) Launch the desktop app
npm start
```

A native window titled `SmartBrowser — Private. Masked. Free.` opens. Backend logs are prefixed with `[backend]` in the same terminal.

### Run (live-reload, optional)

If you want HMR for the React UI while developing:

```bash
npm run dev
```

This spawns the Node backend, the Vite dev server, and Electron (pointed at `http://localhost:5173`) concurrently. Requires the `concurrently` + `wait-on` dev deps.

---

## 5) Packaging a real `.exe` installer

```bash
npm run package
```

This:
1. Builds the React frontend with relative asset paths (`base: './'`).
2. Bundles `electron/`, `backend-node/`, and `frontend/dist/` into an Electron app.
3. Runs `electron-builder` with the NSIS target (Windows).

Output: `dist/SmartBrowser Setup 1.0.0.exe`. On macOS it produces a `.dmg`, on Linux an `AppImage` (build targets are configured in the root `package.json`).

A faster dry-run (skip installer creation, produce just the unpacked app folder):

```bash
npm run package:dir
```

---

## 6) How the VPN works (and how to make it actually mask your IP)

### The mechanism

When you click **Connect** in the VPN panel:

1. `VpnPanel` → `VpnApi.connect(serverId)` → backend updates its internal state.
2. `VpnPanel` → `window.smartBrowserAPI.applyProxy({enabled: true, host, port, type})` → IPC.
3. Electron main process: `session.defaultSession.setProxy({proxyRules: 'socks5://host:port', proxyBypassRules: '127.0.0.1;localhost;<-loopback>'})`.
4. From that moment, **every HTTP/HTTPS/DNS request** the app's tabs make goes through that SOCKS endpoint. Destination sites only see the exit IP.
5. `VpnApi.check()` fetches `api.ipify.org` once direct and once through the tunnel — the panel shows them side-by-side. The chip turns green only if they differ (i.e., the tunnel is verifiably masking your IP).

### What ships out of the box (free, no configuration)

The repo includes the **Tor Expert Bundle 15.0.14** (`tor/tor/tor.exe` + `tor/data/geoip*`) and five pre-baked `torrc` files in `tor/configs/`:

| `torrc` file        | SocksPort         | `ExitNodes`        | Server label in UI            |
| ------------------- | ----------------- | ------------------ | ----------------------------- |
| `torrc-anywhere`    | `127.0.0.1:9050`  | *(unrestricted)*   | Tor - Anywhere (random exit)  |
| `torrc-us`          | `127.0.0.1:9051`  | `{us} StrictNodes` | Tor - United States           |
| `torrc-de`          | `127.0.0.1:9052`  | `{de} StrictNodes` | Tor - Germany                 |
| `torrc-nl`          | `127.0.0.1:9053`  | `{nl} StrictNodes` | Tor - Netherlands             |
| `torrc-fr`          | `127.0.0.1:9054`  | `{fr} StrictNodes` | Tor - France                  |

When the app launches, `electron/main.js → startTor()` spawns one `tor.exe -f <cfg>` child process per entry. They bootstrap in parallel (≈ 20-90 s on first launch, faster on subsequent launches because each instance keeps its own cached consensus in `tor/configs/data-<region>/`). Once a circuit is up:

1. You pick a server in the VPN panel → **Connect**
2. `VpnPanel` → `applyProxy({ host: '127.0.0.1', port: 905X, type: 'SOCKS5' })` → IPC
3. Electron's `session.defaultSession.setProxy({ proxyRules: 'socks5://127.0.0.1:905X' })`
4. Every HTTP / HTTPS / DNS request from every tab now exits via a Tor node in the chosen country

Verified end-to-end: each country's exit IP geolocates correctly (US → US, DE → DE, NL → NL, FR → FR) and differs from your real IP. The `MASKED` chip only lights up after `/api/vpn/check` confirms a different visible IP.

### Why only US / DE / NL / FR?

These four are the countries where Tor has hundreds of exit nodes, so connections actually work. Tor has effectively zero exit nodes in India and only a handful in Singapore — restricting `ExitNodes` to either would result in circuits failing to build. If you want those regions you need a commercial VPN endpoint there (see below).

### Adding your own SOCKS5 / HTTP CONNECT endpoint

Any provider that offers SOCKS5 / HTTP CONNECT endpoints works: Mullvad, IVPN, ProtonVPN, NordVPN (in some plans), self-hosted Dante / Shadowsocks / 3proxy. Edit `backend-node/server.js → state.servers` and add an entry:

```js
{ id: 'my-vps-in', label: 'My VPS - Mumbai', country: 'IN', flag: 'IN',
  host: '203.0.113.5', port: 1080, type: 'SOCKS5', latencyMs: 35,
  lat: 19.076, lon: 72.8777 }
```

Restart the app. The server appears with its `{latencyMs}ms` chip instead of the warning `not configured` chip.

### What the panel honestly tells you

| Chip          | When                                                                 |
| ------------- | -------------------------------------------------------------------- |
| `OFF`         | You haven't pressed Connect                                          |
| `NOT MASKING` | You pressed Connect, but the chosen server has no host OR the tunnel test failed (no IP change observed) |
| `MASKED`      | `/api/vpn/check` confirmed your visible IP changed after going through the tunnel |

There's no way for the panel to lie — it only displays `MASKED` when an independent IP check returns a different IP from the direct one.

---

## 7) How website / URL masking works

This feature is **only active in the web-fallback mode** (opening the React UI in a regular browser instead of via Electron). It's documented here because the implementation is interesting and the code path is still in the repo.

### The technique

When you navigate to `youtube.com` in web-fallback mode:

1. The React app sets the iframe `src` to `/api/proxy?url=https%3A%2F%2Fyoutube.com`.
2. `ProxyController` in `backend-node/server.js` fetches the page with `node:http`/`https` (optionally through the SOCKS upstream).
3. The HTML rewriter walks the response and rewrites every `src` / `href` / `srcset` / `action` / `url(...)` / `@import` / `meta refresh` to `/api/proxy?url=...`.
4. A runtime hook is injected into `<head>` that wraps `fetch`, `XMLHttpRequest.open`, `window.open`, `history.pushState/replaceState`, anchor `click` events, and form `submit` events — so dynamically-built URLs also stay inside the tunnel.
5. `target="_blank"` / `_top` / `_parent` are statically rewritten to `_self`; a click hijacker `preventDefault()`s anything still left.
6. CSP / X-Frame-Options / COOP / COEP / HSTS are stripped so the page can render in an iframe.

The browser/network on your machine only ever issues requests to `localhost:8080` — there is **no DNS lookup for `youtube.com`** and **no TLS SNI containing `youtube.com`**.

In Electron mode the page is loaded by a native `WebContentsView` directly, so this layer isn't used. You get raw site compatibility (videos play, login works, etc.) in exchange for not getting host-masking; the trade-off is documented for honesty.

---

## 8) Backend API reference

All endpoints are mounted on `http://localhost:8080`. CORS is open.

### `GET /api/proxy?url=<encoded URL>`

Forwards the request to `<url>`. **All HTTP methods supported** (GET/POST/PUT/PATCH/DELETE/HEAD/OPTIONS). Request body is forwarded verbatim. Per-upstream-host cookie jar persists cross-request. HTML and CSS responses are rewritten so nested URLs stay inside the proxy.

### `GET /api/vpn/status`

```jsonc
{
  "enabled": false,            // true ONLY when isTunnelConfigured() && tunnelHealthy
  "desired": false,            // user pressed Connect
  "configured": false,         // active server has a non-empty host
  "activeServer": { "id": "tor-us", "label": "Tor - United States", … },
  "visibleIp":       "1.2.3.4",        // exit IP (or direct IP if tunnel is off)
  "visibleIpDirect": "1.2.3.4",        // your real ISP IP
  "health": "ok" | "unreachable" | "idle",
  "note":   "explanatory message or null"
}
```

### `GET /api/vpn/servers`

Returns the array from `state.servers` so the UI dropdown can render them.

### `POST /api/vpn/connect`

Body: `{ "serverId": "<id>" }`. Marks `desired = true`, sets `activeServerId`, runs an IP check, returns the new status.

### `POST /api/vpn/disconnect`

Sets `desired = false`, re-runs an IP check, returns the new status.

### `GET /api/vpn/check`

Forces an immediate IP check (direct + tunneled) and returns:

```json
{
  "direct":   "1.2.3.4",
  "tunneled": "5.6.7.8",
  "masked":   true,
  "server":   { "id": "...", "host": "...", "port": 1080, "type": "SOCKS5" }
}
```

---

## 9) Keyboard shortcuts

| Shortcut             | Action                                                                                 |
| -------------------- | -------------------------------------------------------------------------------------- |
| `F12` / `Ctrl+Shift+I` (inside a page)     | Open DevTools docked to the **right** of the SmartBrowser window |
| `F12` / `Ctrl+Shift+I` (on the SmartBrowser UI itself, via View menu) | Open DevTools for the host UI (omnibar, VPN panel, etc.) |
| `Ctrl+R` / `Ctrl+Shift+R`                 | Reload current page                                              |
| `Ctrl+T` (via the `+` button in the topbar) | New tab                                                       |
| **Right-click**                            | Context menu with Back / Forward / Reload / Copy / Paste / **Inspect Element** |

Inside docked DevTools, the standard Chromium **three-dot menu → "Dock side"** lets you switch to bottom, left, or undocked (separate window).

---

## 10) Honest limitations

A reverse-proxy + Electron browser cannot magically solve every privacy / compatibility problem. The honest list:

| What                                          | Why                                                                                 | Status                |
| --------------------------------------------- | ----------------------------------------------------------------------------------- | --------------------- |
| YouTube / Netflix / Spotify video playback in **web-fallback mode** | DRM (EME/Widevine), service workers, MSE, anti-proxy checks                | Broken (architectural) |
| YouTube etc. in **Electron mode**             | Works — native Chromium tab                                                          | ✅ Works               |
| Sites that detect proxy headers / TLS fingerprint (banking, Cloudflare turnstile, …) | They're designed to block all proxies, including commercial VPNs | Variable               |
| WebRTC IP leak                                | WebRTC bypasses HTTP; the OS-level SOCKS proxy doesn't catch UDP/STUN                | Mitigated by OS firewall, not by this app |
| DNS for the SmartBrowser host itself          | When VPN is OFF you have no DNS-level masking                                        | Use Tor or a VPN to hide it |
| File downloads through `/api/proxy`           | Stream support is basic; large downloads may buffer in memory                        | Acceptable; for big files browse the upstream directly via VPN |
| TLS client certificates                       | Re-presenting your client cert through the proxy isn't implemented                   | Out of scope          |

This is not an anonymity tool. Don't use it for activities where being identified as a proxy/VPN user would have consequences.

---

## 11) Troubleshooting

### "The window is black / blank"

You probably ran a pre-fix build of the frontend that used absolute `/assets/...` URLs.

```bash
npm run build:frontend     # rebuild with relative asset paths
npm start
```

### "Port 8080 already in use"

```powershell
# Windows PowerShell:
$pids = (Get-NetTCPConnection -LocalPort 8080 -State Listen).OwningProcess | Sort-Object -Unique
$pids | ForEach-Object { Stop-Process -Id $_ -Force }
```

```bash
# macOS / Linux:
lsof -ti tcp:8080 | xargs kill -9
```

Then re-launch with `npm start`.

### "VPN dropdown is empty"

The dropdown now shows a **Loading servers…** entry while it waits for the API. If it stays in that state, the backend is unreachable. Check the terminal you launched SmartBrowser from for `[backend] SmartBrowser backend ready  http://localhost:8080` — if you don't see that line, the spawn failed (usually port conflict, see above).

### "VPN says MASKED but I want to be sure"

Click **Re-check IP**. It hits an external IP-echo service (`api.ipify.org`) twice — once direct, once through the SOCKS upstream — and reports both. You can verify them externally at <https://whatismyipaddress.com/>.

### "Some site doesn't load right"

In Electron mode: that site is genuinely broken or it's detecting + blocking your VPN. Try direct (Disconnect), or try a different VPN exit location.

In web-fallback mode: the rewriter handles common patterns but not every dynamic-loading scheme. Open DevTools' Console and look for 404 / 502 entries on `/api/proxy?url=…` — those are URLs the rewriter missed. Open a ticket with the URL pattern.

### "I want to wipe all stored cookies / cache"

Delete the `persist:smartbrowser` partition folder:

| OS       | Location                                                                  |
| -------- | ------------------------------------------------------------------------- |
| Windows  | `%APPDATA%\SmartBrowser\Partitions\smartbrowser\`                         |
| macOS    | `~/Library/Application Support/SmartBrowser/Partitions/smartbrowser/`     |
| Linux    | `~/.config/SmartBrowser/Partitions/smartbrowser/`                         |

---

## 12) Tech stack

| Layer        | Technology                                                                                          |
| ------------ | --------------------------------------------------------------------------------------------------- |
| Desktop      | **Electron 31** (Chromium + Node)                                                                   |
| UI           | **React 18** + **Vite 5** + **MUI 5** + **Framer Motion** + **Axios**                               |
| 3D / FX      | **Three.js** via **`@react-three/fiber`** + **`@react-three/drei`**                                 |
| Backend      | **Node 20+**, **Express 4**, **socks-proxy-agent**, **https-proxy-agent**                           |
| Build        | **electron-builder** (NSIS / DMG / AppImage targets)                                                |

---

## License

MIT.
