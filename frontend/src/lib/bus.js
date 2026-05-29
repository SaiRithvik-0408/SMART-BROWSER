// =========================================================================
// Cross-renderer event bus.
//
// The app now boots TWO renderers from the same origin: the main browser
// shell and the floating overlay panel view (PanelHost). Plain
// `window.dispatchEvent(new CustomEvent(...))` only reaches listeners in
// the SAME window, so settings changed in the overlay (layouts, grid
// columns, background) wouldn't live-update the home page in the main
// window.
//
// BroadcastChannel delivers messages to every same-origin context, so we
// fan events out over it AND the local window (so a single-renderer web
// build still works even where BroadcastChannel is unavailable).
// =========================================================================

const CHANNEL_NAME = 'sb-bus';
let channel = null;

function getChannel() {
  if (channel) return channel;
  try {
    if (typeof BroadcastChannel !== 'undefined') channel = new BroadcastChannel(CHANNEL_NAME);
  } catch { channel = null; }
  return channel;
}

// Fire an event locally (same window) and across all same-origin renderers.
export function emit(type, detail) {
  try { window.dispatchEvent(new CustomEvent(type, { detail })); } catch {}
  try { getChannel()?.postMessage({ type, detail }); } catch {}
}

// Subscribe to an event from either source. Returns an unsubscribe fn.
export function on(type, cb) {
  const winHandler = (e) => cb(e?.detail);
  window.addEventListener(type, winHandler);

  const ch = getChannel();
  const chHandler = (e) => { if (e?.data?.type === type) cb(e.data.detail); };
  ch?.addEventListener('message', chHandler);

  return () => {
    window.removeEventListener(type, winHandler);
    ch?.removeEventListener('message', chHandler);
  };
}
