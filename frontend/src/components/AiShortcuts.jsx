import React from 'react';
import { Box, Typography, ButtonBase, Stack } from '@mui/material';

// AI service shortcuts shown on the home page. Clicking one opens the
// service's web UI in a new tab — the user stays logged in via that site's
// own cookie session, so there's no API key plumbing in SmartBrowser.
const SERVICES = [
  {
    id: 'chatgpt',
    label: 'ChatGPT',
    url: 'https://chatgpt.com/',
    accent: '#10a37f',
    glyph: (
      <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
        <path d="M22.28 9.82a5.7 5.7 0 0 0-.49-4.69 5.78 5.78 0 0 0-6.22-2.78A5.74 5.74 0 0 0 4.84 4.42 5.7 5.7 0 0 0 1.04 7.2a5.78 5.78 0 0 0 .71 6.77 5.7 5.7 0 0 0 .49 4.69 5.78 5.78 0 0 0 6.22 2.78 5.74 5.74 0 0 0 10.73-.07 5.7 5.7 0 0 0 3.8-2.77 5.78 5.78 0 0 0-.71-6.78ZM13.06 20.95a4.28 4.28 0 0 1-2.74-1l.13-.07 4.55-2.63a.74.74 0 0 0 .37-.65v-6.4l1.93 1.11a.07.07 0 0 1 .04.05v5.32a4.29 4.29 0 0 1-4.28 4.27ZM3.8 17a4.27 4.27 0 0 1-.52-2.92l.13.08 4.55 2.63a.73.73 0 0 0 .74 0L14.27 13.6v2.22a.06.06 0 0 1-.03.06l-4.6 2.65A4.27 4.27 0 0 1 3.8 17Zm-1.2-9.96a4.27 4.27 0 0 1 2.24-1.88V10.62a.74.74 0 0 0 .37.65l5.53 3.19-1.93 1.12a.07.07 0 0 1-.06 0L4.16 12.92A4.27 4.27 0 0 1 2.6 7.04Zm15.78 3.68-5.54-3.21 1.92-1.11a.07.07 0 0 1 .07 0l4.6 2.66a4.27 4.27 0 0 1-.65 7.71v-5.4a.74.74 0 0 0-.4-.65ZM20.3 7.74l-.13-.08-4.54-2.65a.74.74 0 0 0-.75 0L9.73 8.4V6.17a.06.06 0 0 1 .03-.06l4.6-2.65a4.28 4.28 0 0 1 6.35 4.43Zm-12 4.34-1.93-1.11a.07.07 0 0 1-.04-.05V5.6a4.28 4.28 0 0 1 7-3.28l-.13.07L8.66 5.02a.74.74 0 0 0-.37.64v6.42Zm1.04-2.26L11.82 8.4l2.46 1.42v2.83l-2.45 1.42L9.36 12.66Z" />
      </svg>
    ),
  },
  {
    id: 'gemini',
    label: 'Gemini',
    url: 'https://gemini.google.com/app',
    accent: '#4285f4',
    glyph: (
      <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
        <path d="M12 2 14.5 9.5 22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5Z" />
      </svg>
    ),
  },
  {
    id: 'claude',
    label: 'Claude',
    url: 'https://claude.ai/new',
    accent: '#d97706',
    glyph: (
      <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
        <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm0 5a5 5 0 0 1 5 5 5 5 0 0 1-5 5 5 5 0 0 1-5-5 5 5 0 0 1 5-5Z" />
      </svg>
    ),
  },
  {
    id: 'perplexity',
    label: 'Perplexity',
    url: 'https://www.perplexity.ai/',
    accent: '#20808d',
    glyph: (
      <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
        <path d="M12 2 3 7v10l9 5 9-5V7Zm0 2.31 6.95 3.86L12 12 5.05 8.17ZM4 9.31l7 3.89v7.49l-7-3.89Zm9 11.38v-7.49l7-3.89v7.49Z" />
      </svg>
    ),
  },
];

export default function AiShortcuts({ onOpen }) {
  return (
    <Box sx={{ width: 'min(680px, 92vw)', mt: 1.5 }}>
      <Stack direction="row" spacing={1} justifyContent="center" flexWrap="wrap" useFlexGap>
        {SERVICES.map((s) => (
          <ButtonBase
            key={s.id}
            onClick={() => onOpen(s.url)}
            sx={{
              px: 1.5, py: 0.75, borderRadius: 999,
              display: 'flex', alignItems: 'center', gap: 1,
              color: '#e6e9f5',
              background: 'rgba(8,9,14,0.6)',
              border: '1px solid rgba(255,255,255,0.08)',
              transition: 'background 140ms ease, border-color 140ms ease, transform 140ms ease',
              '&:hover': {
                background: `${s.accent}1f`,
                borderColor: `${s.accent}55`,
                transform: 'translateY(-1px)',
              },
            }}
          >
            <Box sx={{ color: s.accent, display: 'flex' }}>{s.glyph}</Box>
            <Typography sx={{ fontSize: 13, fontWeight: 600, letterSpacing: 0.2 }}>{s.label}</Typography>
          </ButtonBase>
        ))}
      </Stack>
    </Box>
  );
}

export { SERVICES as AI_SERVICES };
