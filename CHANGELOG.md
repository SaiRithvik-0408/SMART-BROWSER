# Changelog

All notable changes to SmartBrowser are documented here.

The format is loosely based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project does not follow strict semantic versioning yet; the `Unreleased`
section collects changes that have landed on `main` but are not yet tagged.

## [Unreleased]

### Added

- **Home page redesign (Nothing-UI inspired)**: monospace type, uppercase
  labels, flat black surfaces, dotted-grid texture, single red accent.
- **Resizable, grid-based widgets**: each widget has a resize control that
  cycles size presets (S / M / L / XL) via CSS-grid column + row spans; layout
  persists to `localStorage` (`smartbrowser.widgets.v2`).
- **Favorites header**: an editable bar at the top of the home page to add /
  remove favorite sites (with favicons), persisted to
  `localStorage` (`smartbrowser.favorites.v1`).
- **News feed**: a "Top Stories" section appears as you scroll the home page,
  pulled from the free, key-less, CORS-enabled Hacker News API; click a card to
  open the story in a tab.

- **Built-in ad / tracker blocker** (`electron/adblock.js`).
  - Network-level blocking via `session.webRequest.onBeforeRequest` against a
    built-in list of ~120 ad / analytics / tracker hosts (parent-domain aware).
  - URL-path blocking for ad-serving endpoints (`/pagead/`, `/get_video_ads`,
    `/api/stats/ads`, `/ptracking`, `/gampad/`, …) — also removes **YouTube**
    video ads served from first-party hosts.
  - Cosmetic CSS injection on `dom-ready` to hide leftover ad containers.
  - On by default; toggleable and inspectable via IPC
    (`window.smartBrowserAPI.adblock.setEnabled` / `.stats`).
- **Customizable widget dashboard** on the home page
  (`frontend/src/components/Widgets.jsx`).
  - Widgets: Clock, Calendar, Notes, Quick Links, World Clock.
  - Add, remove, and reorder widgets; per-widget customization (notes text,
    link list, world-clock timezone).
  - Layout + config persisted to `localStorage` (`smartbrowser.widgets.v1`).
- **In-app auto-update** (`electron/updater.js` + `UpdateBanner.jsx`).
  - Checks GitHub Releases on launch (and every 6h) and compares against
    `app.getVersion()`.
  - Shows an "Update available" banner below the tab bar.
  - One-click install: on **Windows**, downloads the `Setup-<ver>.exe`
    installer, then a detached `.cmd` helper waits for exit, runs it silently
    (`/S`), and relaunches — with a live progress bar (falls back to ZIP
    extract + `robocopy` if only a ZIP asset exists). On **macOS/Linux**,
    downloads and opens the `.dmg` / `.AppImage`.
  - New IPC surface `updates` in `electron/preload.js`
    (`check` / `apply` / `onAvailable` / `onProgress` / `onError`).
- New IPC surface `adblock` in `electron/preload.js`.
- **Single-file Windows installer** (`scripts/installer.nsi`).
  - Releases now ship `SmartBrowser-Setup-<ver>-win-x64.exe` instead of a loose
    ZIP. NSIS is installed in CI via Chocolatey and compiles the hand-built
    `win-unpacked` folder into the installer.
  - Per-user install to `%LOCALAPPDATA%\Programs\SmartBrowser` (no admin/UAC,
    like Chrome), Start Menu + Desktop shortcuts, Add/Remove Programs entry,
    and silent install (`/S`) support for the auto-updater.

### Changed

- **User agent** now mimics stock Chrome: the `Electron/<ver>` and
  `smart-browser/<ver>` tokens are stripped from the session UA on startup.
  Stops the DuckDuckGo "upgrade your browser" promo and avoids fingerprinting
  the app as an Electron shell.
- **Reddit links** are upgraded from `old.reddit.com` / `i.reddit.com` to
  `www.reddit.com` on every navigation (tab create, navigate, `will-navigate`).
  The home-page Reddit shortcut now points at `https://www.reddit.com`.
- Home-page hero now lays out from the top (`flex-start`) so the new dashboard
  doesn't clip on shorter windows.
- Home-page feature cards updated to describe the ad blocker and customizable
  dashboard.

### Fixed

- **Windows ZIP packaging**: the release ZIP now extracts into a single
  `SmartBrowser/` folder instead of dumping all files loose into the current
  directory (`.github/workflows/release.yml`).
- **Version stamping**: the release workflow now writes the git tag version
  (e.g. `v1.0.13` → `1.0.13`) into `package.json` before packaging, so
  `app.getVersion()` matches the published release and the in-app updater
  doesn't show "update available" in a loop.
- **YouTube slowness**: addressed by the ad/tracker blocker. In Electron mode
  tabs load directly (not through `/api/proxy`), so the latency was ad/tracker
  overhead rather than proxy routing.

## [1.0.x] — GitHub Pages & CI

### Fixed

- GitHub Pages deploy workflow now triggers only from `main` (the `release`
  branch was blocked by environment protection rules).
- Documented enabling GitHub Pages with the **GitHub Actions** source.

## [1.0.0] — Initial release

- Privacy-first Electron desktop browser with native Chromium
  `WebContentsView` tabs.
- Built-in multi-region Tor VPN (Anywhere / US / DE / NL / FR) via per-instance
  SOCKS5 ports and country-locked `ExitNodes`.
- Node.js reverse-proxy backend with URL/website masking (web-fallback mode).
- React / MUI / Three.js UI shell.
