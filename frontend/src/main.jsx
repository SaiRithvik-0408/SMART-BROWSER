import React from 'react';
import ReactDOM from 'react-dom/client';
import { ThemeProvider, CssBaseline } from '@mui/material';
import App from './App.jsx';
import PanelHost from './PanelHost.jsx';
import theme from './theme.js';

// The same bundle boots two renderers: the main browser shell, and the
// floating overlay panel view (loaded by main as index.html?overlay=1).
// The overlay renderer only mounts PanelHost so the panels float above the
// page in their own native view without resizing the website.
const isOverlay = new URLSearchParams(window.location.search).get('overlay') === '1';

// The overlay view must be transparent so its dim backdrop composites over
// the page underneath. Override the opaque html/body/#root background from
// index.html (and skip CssBaseline, which would re-paint body with the theme
// background) when booting in overlay mode.
if (isOverlay) {
  const s = document.createElement('style');
  s.textContent = 'html,body,#root{background:transparent !important;}';
  document.head.appendChild(s);
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      {isOverlay ? null : <CssBaseline />}
      {isOverlay ? <PanelHost /> : <App />}
    </ThemeProvider>
  </React.StrictMode>
);
