# Changelog

All notable changes to SmartBrowser are documented here.

The format is loosely based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project does not follow strict semantic versioning yet; the `Unreleased`
section collects changes that have landed on `main` but are not yet tagged.

## [Unreleased]

## [v1.0.26] - 2026-05-29

### Fixed

- **Back / Forward buttons in the URL bar now actually work** when the
  previous entry was the home page or another `smartbrowser://` page.
  Previously they delegated to Electron's native `webContents` history,
  which is empty when you came from an internal React page — so the buttons
  silently did nothing. The chrome now walks the React-tracked `tab.history`
  first and forces a native re-navigation directly, falling back to native
  back/forward only when React history is exhausted (handy for in-page SPA
  routes). Silent in-page navigation also now correctly moves the cursor
  back/forward instead of appending duplicates when the URL matches an
  adjacent history entry.

### Added — Inline AI answers

- **AI widget now actually answers in-place** when you supply an API key.
  OpenAI (`gpt-4o-mini` / `gpt-4o` / `gpt-4-turbo` / `gpt-3.5-turbo`) and
  Google Gemini (`gemini-1.5-flash` / `gemini-1.5-pro` /
  `gemini-2.0-flash-exp`) are called directly from the renderer — both
  expose CORS-friendly endpoints. Answers render as a scrolling chat
  transcript inside the widget with a CLEAR button.
- **Settings → AI** has new fields for the OpenAI, Gemini, and Anthropic API
  keys (with show/hide toggles), plus model dropdowns. Keys are stored
  locally in `userData/sb-store/settings.json`. Direct links to each
  provider's key-issuing console are included.
- Without a key, the widget still falls back to opening the provider's
  website with the prompt pre-filled in the URL where possible
  (`?q=` works on ChatGPT, Claude, Perplexity) and copies the prompt to
  the clipboard either way.
- Anthropic Claude is listed in Settings but flagged as fallback-only
  because Anthropic's API blocks browser CORS today.

### Changed — Widgets resize is smooth

- **Halved the grid row height** (40 px instead of 80 px) so widget heights
  can be adjusted in 40 px increments instead of 80 px chunks — much closer
  to "free-form" sizing. All saved layouts are auto-migrated from v3 by
  doubling `y` and `h` so widgets keep their on-screen size.
- **Multi-side resize handles**: every widget now exposes a chunky red
  bottom-right corner *plus* pill-shaped pull handles on the east and
  south edges. On hover the side pills turn red so they're obvious.
- Default widget dimensions in the catalog were doubled (h-only) to match
  the new row height; CATALOG / DEFAULTS in `Widgets.jsx` updated.

### Files

- Changed: `electron/settings.js` (new `aiKeys` + `aiModels`, deep migration),
  `frontend/src/App.jsx` (back/forward + silent-nav cursor reconciliation),
  `frontend/src/components/Widgets.jsx` (rowHeight, handles, AiWidget
  inline answers, v3→v4 layout migration),
  `frontend/src/components/SettingsPage.jsx` (API key UI).

## [v1.0.25] - 2026-05-29

### Added — Notes everywhere

- **Notes panel in the navigation bar**: a sticky-note icon now sits next to
  the VPN shield. Click it to slide out a full Notes panel with a left-hand
  note list (search, dates, previews) and a right-hand editor. Notes are
  persisted on disk under `userData/sb-store/notes.json` via a new
  `electron/notes.js` module + IPC bridge.
- **Multi-note support**: create, rename, search, and delete notes; the panel
  auto-saves 500 ms after every edit.
- **Inline images in notes**: paste images straight from the clipboard,
  drag-and-drop image files onto the editor, or use the "Add image" button.
  Images are stored as data URIs inside each note (cap of ~2 MB per note to
  keep the JSON store responsive). A live thumbnail gallery shows every image
  with a one-click remove.
- **Notes widget ↔ panel link**: the home-page Notes widget now reads and
  writes the *same* notes as the panel — change a note in either place and
  the other updates. The widget picks the most recent note by default and
  has a dropdown to switch to any note. Pasting an image into the widget
  adds it to the underlying note, and clicking any thumbnail opens that note
  in the full panel.

### Added — Tab right-click menu

- **Per-tab context menu** matching Chrome / Brave: New tab to the right,
  Reload, Duplicate, **Pin / Unpin** (pinned tabs become a 40 px favicon-only
  chip and are immune to middle-click close), Close, Close other tabs, Close
  tabs to the right (with live count), Close duplicate tabs, **Reopen closed
  tab** (Ctrl+Shift+T).
- **Recently-closed stack** in `App.jsx` remembers up to 20 closed tabs so
  Reopen actually has something to restore.
- **Keyboard shortcuts**: `Ctrl+T` opens a new tab, `Ctrl+W` closes the
  current tab, `Ctrl+Shift+T` reopens the last closed tab.

### Added — Page right-click menu enhancements

The webview's native context menu (already had Back / Forward / Reload /
Copy / Paste / Inspect) now also includes:

- **Save page as…** (Ctrl+S) – downloads the current page through Electron's
  native downloads manager (tracked by the downloads page).
- **Print…** (Ctrl+P) – opens the OS print dialog.
- **Create QR code for this page** – opens a QR PNG of the current URL in a
  new tab (handy for hand-off to phones).
- **Translate to English** – opens Google Translate with the current page.
- **View page source** (Ctrl+U) – opens `view-source:` in a new tab.
- **Search the web for "…"** when text is selected — uses your configured
  default search engine.
- **Open / copy / save link** when the click hit an `<a href>`.
- **Open / copy / save image** when the click hit an `<img>`.

### Files

- New: `electron/notes.js`, `frontend/src/components/NotesPanel.jsx`.
- Changed: `electron/main.js`, `electron/preload.js`,
  `frontend/src/App.jsx`, `frontend/src/components/TopBar.jsx`,
  `frontend/src/components/TabsBar.jsx`,
  `frontend/src/components/Widgets.jsx`.

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

### Added

- **Fully draggable + resizable widget grid** (powered by `react-grid-layout`):
  every widget on the new-tab page can now be dragged from its header to any
  empty slot, and resized to any dimensions by dragging the bottom-right
  corner. Layout persists across restarts. The grid is 12 columns wide with
  ~80 px rows, so widgets snap to a fine grid you can compose like Notion
  blocks. Each widget type has sensible default and minimum sizes (e.g. the
  news widget defaults to full-width 12×6, stocks 6×4, clock 4×2).
- **News is now a widget**, not a separate full-width section: drag it
  anywhere, resize it, remove it, or add multiple instances with different
  sections (Top / Markets / Tech). Old setups are auto-migrated so existing
  widgets stay placed and a default news widget is added at the bottom.
- **History page** (`smartbrowser://history`): every top-level navigation is
  recorded with URL, title, favicon and timestamp (capped at 5000 entries).
  Searchable, day-grouped, with per-entry remove + bulk "Clear last hour /
  24 h / 7 days / all" controls. Persisted to
  `userData/sb-store/history.json` and can be disabled from Settings.
- **Downloads page** (`smartbrowser://downloads`): hooks into the shared
  session's `will-download`, so every download started by any tab shows up
  live with progress, size and state. Per-item pause / resume / cancel and
  open file / show in folder, plus a "Clear list" action. Persisted across
  restarts.
- **Settings page** (`smartbrowser://settings`): default search engine
  (DuckDuckGo / Google / Brave / Bing / Startpage), ad-blocker on/off (with
  live blocked-request counter), history recording on/off, home-page section
  toggles (favorites / widgets / news), default AI assistant, plus a
  "Check for updates" button wired to the in-app updater.
- **Password manager** (`smartbrowser://passwords`): manual vault with
  add / edit / delete, password reveal & copy-to-clipboard, search. Passwords
  are encrypted at rest with Electron's `safeStorage` (Windows DPAPI / macOS
  Keychain / Linux libsecret) so they're tied to the OS user account.
- **AI shortcuts row on the new-tab page**: one-click buttons for ChatGPT,
  Gemini, Claude and Perplexity. Opens each service's web UI in a new tab —
  you stay signed in via that service's own cookies, no API keys required.
- **AI widget** (`Ask AI`): pick a service, type a prompt, hit "Ask"
  (or Ctrl+Enter). The widget copies the prompt to your clipboard and opens
  the chosen service's chat page in a new tab. Where the service supports it
  (Claude, Perplexity), the prompt is also passed as a `?q=` URL parameter so
  the chat box pre-fills automatically.
- **Hamburger menu in the URL bar**: quick links to History, Downloads,
  Passwords, Settings, and the new-tab page — Chrome/Brave/Edge style.
- **Default search engine respected by the omnibox**: typing a non-URL query
  in the URL bar uses the engine selected in Settings (DuckDuckGo by default).

### Changed

- **Chrome/Brave-style dynamic tab strip**: tabs are now custom flex children
  instead of MUI `<Tabs>`. With one tab open, the tab grows to its max width
  (320 px active, 240 px inactive). As more tabs are opened, they share the
  available row space proportionally and shrink down to their min width
  (140 px active, 80 px inactive). The active tab always uses a 1.6× grow
  factor and a 0.6× shrink factor, so it stays visibly wider than the others
  at all tab counts. The **+** button now sits immediately after the last tab
  (not at the far right of the bar), and the active tab has a brighter blue
  surface plus a gradient accent strip along its bottom edge.
- **Brave-style integrated title bar**: the native OS title bar is now hidden
  (`titleBarStyle: 'hidden'`). On Windows + Linux the standard min/max/close
  buttons are drawn as a transparent overlay directly inside the tab strip
  (`titleBarOverlay`), so there's no more dead horizontal bar above the tabs.
  On macOS the traffic lights sit in the top-left corner. The tab strip is a
  drag region (window-move works exactly as before); tabs and toolbar buttons
  are individually opted out of the drag region with `WebkitAppRegion`.
- **New-tab page is more useful by default**: the hero (logo + tagline +
  omnibar) was previously sized to fill the whole viewport, which pushed the
  Widgets dashboard and Economic Times news feed below the fold. The hero is
  now compact, so widgets and news are visible without scrolling on a 1080p
  display, while still scrollable for the full feed.

### Fixed

- **VPN didn't actually route tab traffic (and ad blocker / downloads were
  attaching to the wrong session too)**: the WebContentsView for each tab was
  configured with both `session: session.defaultSession` AND
  `partition: 'persist:smartbrowser'`. In Electron, `partition` wins over
  `session` when both are set, so tabs were quietly running on a different
  session than the one we were attaching the VPN proxy / ad-blocker request
  filter / downloads listener / cleaned User-Agent to. Result: clicking
  "Connect" flipped `setProxy` on a session no tab actually used, so traffic
  went direct and the visible IP didn't change.
  Everything is now unified onto a single `BROWSER_PARTITION` session so the
  proxy / blocker / downloads tracker / UA all apply to real tab traffic.
- **VPN panel didn't fit narrow windows**: the panel was a fixed 380 px
  floating dialog, which spilled off-screen when the window was small. It now
  becomes a full-width bottom sheet at `sm` breakpoint (and below), with a
  scrollable interior so it works at tablet / phone-like widths.
- **Home page wouldn't scroll past the visible viewport**: the BrowserView
  wrapper and the per-tab flex containers were missing `min-height: 0`, which
  is the standard flex-and-overflow trap — without it, an `overflow: auto`
  child grows to fit its content instead of scrolling. Now the page scrolls
  end-to-end so the full Widgets dashboard + news + anything else you add
  is reachable.
- **Installer error "Error opening file for writing" when SmartBrowser was
  running**: NSIS would refuse to overwrite `SmartBrowser.exe` (and Electron's
  helper EXEs that share the same name) if any instance was still running,
  popping an Abort/Retry/Ignore dialog. The installer now runs
  `taskkill /IM SmartBrowser.exe` (graceful) followed by
  `taskkill /F /T /IM SmartBrowser.exe` (force + tree) inside `.onInit` AND
  at the top of the install section, via `nsExec::ExecToLog` so no console
  window flashes. Works for both silent (auto-update) and interactive
  (double-click the Setup .exe) installs.
- **Auto-updater STILL showed a console window (round 2)**: the previous
  fix used a VBS wrapper to hide the initial cmd launch, but every
  `tasklist | find` iteration inside the cmd wait-loop re-flashed through
  Windows Terminal, and closing that window aborted the install entirely.
  The helper has now been rewritten as a pure VBS script — process polling
  uses WMI (`Win32_Process`) in-process, the installer is invoked via
  `WScript.Shell.Run … 0`, and `wscript.exe` has no console at all. After
  the wait-loop expires the script also force-terminates any lingering
  Electron helper processes via WMI so the installer isn't blocked by
  file locks. End to end: zero visible windows.
- **Auto-updater shows a visible console window on Windows 11** (round 1):
  the helper was launched via a tiny `.vbs` wrapper (`WScript.Shell.Run … 0`).
  Insufficient — see above.
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
