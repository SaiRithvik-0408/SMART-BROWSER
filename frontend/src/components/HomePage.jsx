import React from 'react';
import { Box } from '@mui/material';
import Widgets from './Widgets';
import Favorites from './Favorites';

// Home page is now nothing but the favorites bar + the widget grid. The
// SmartBrowser wordmark itself is a singleton widget (see Widgets.jsx →
// BrandWidget) so it can be repositioned and resized like everything else.
export default function HomePage({ onOpen }) {
  return (
    <Box sx={{
      position: 'relative', minHeight: '100%', display: 'flex',
      flexDirection: 'column', alignItems: 'stretch', justifyContent: 'flex-start',
      pt: 1, pb: 6, color: '#e6e9f5', width: '100%',
    }}>
      <Favorites onOpen={onOpen} />
      {/* Grid is now edge-to-edge — no centered max-width wrapper. The grid
          itself measures its container and lays out widgets across the
          full available width. */}
      <Box sx={{ width: '100%', px: 1.5, boxSizing: 'border-box' }}>
        <Widgets onOpen={onOpen} />
      </Box>
    </Box>
  );
}
