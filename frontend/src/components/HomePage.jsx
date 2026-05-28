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
      {/* True edge-to-edge — zero horizontal padding so widgets (including
          a widget pinned at x=0) really touch the screen edge. The dotted
          background and individual widget chrome give enough visual breathing
          room without an outer gutter. */}
      <Box sx={{ width: '100%', px: 0, boxSizing: 'border-box' }}>
        <Widgets onOpen={onOpen} />
      </Box>
    </Box>
  );
}
