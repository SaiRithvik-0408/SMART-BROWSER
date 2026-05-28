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
      flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start',
      pt: 1, pb: 6, color: '#e6e9f5',
    }}>
      <Favorites onOpen={onOpen} />
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', px: 3, width: '100%' }}>
        <Widgets onOpen={onOpen} />
      </Box>
    </Box>
  );
}
