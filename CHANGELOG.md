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
- **News feed (Economic Times)**: a news section appears as you scroll the home
  page, pulled from Economic Times RSS feeds (Top / Markets / Tech sections,
  switchable). Fetched via the local backend `/api/proxy` since ET doesn't
  ship CORS headers.
- **Stock watchlist widget**: real-time-ish quotes via Yahoo Finance's
  key-less chart API (routed through the local proxy). Defaults to five major
  US ETFs (SPY, QQQ, VOO, VTI, DIA); add/remove your own tickers; auto-refresh
  every minute. Up/down colored with arrows and percent change.

### Changed

- **Browser layout**: tabs strip moved to the **top of the window** (above the
  URL bar) with a `+` new-tab button at the end — matches Chrome / Brave.
  Removed the duplicate `+` from the URL bar.
- **Home page**: hero (logo + search) now sits roughly a third of the way down
  the viewport instead of at the top, giving the favorites header and the
  widget dashboard cleaner separation.

### Fixed

- **Auto-updater shows a visible console window on Windows 11**: the helper
  is now launched via a tiny `.vbs` wrapper (`WScript.Shell.Run … 0`), the
  only reliable way to suppress the console window when Windows Terminal hosts
  cmd. Node's `windowsHide: true` is ignored in that case.
- **Auto-updater wait-loop could hang forever**: capped at 30 seconds and
  proceeds to install regardless. Electron spawns multiple helper processes
  that share the `SmartBrowser.exe` name; a lingering renderer would
  previously block the loop indefinitely.
- **App didn't always exit before update**: now calls `app.quit()` followed
  by a force `app.exit(0)` after 1.5 s so the installer can replace files.
- **Task Manager shows the app as "Electron"**: the Windows packaging step
  now uses `rcedit` to set the PE version-info resource on
  `SmartBrowser.exe` (ProductName, FileDescription, CompanyName,
  OriginalFilename, File/Product Version). Task Manager + the Properties
  dialog now show **SmartBrowser** instead of Electron.
- **Window title was "SmartBrowser — Private. Masked. Free." everywhere**:
  the title now follows the active tab, Brave-style:
  `"<page title> — SmartBrowser"`, or just `SmartBrowser` on the home tab.
  Renderer-side title changes can no longer overwrite it.
- **Ad blocker missed YouTube Premium upsells / "Remove ads" button**: the
  cosmetic CSS now uses Chromium `:has()` to target `yt-button-view-model`
  by aria-label, and a small injected MutationObserver also hides Premium
  CTA elements by text content as YouTube lazy-renders them.

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
