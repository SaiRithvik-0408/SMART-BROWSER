import React from 'react';
import { Box, Typography } from '@mui/material';
import { motion } from 'framer-motion';
import Widgets from './Widgets';
import Favorites from './Favorites';

// Home page used to host a static search Paper + AiShortcuts row above the
// dashboard. Both are now first-class widgets (see Widgets.jsx) so the user
// can place them anywhere — top-right, bottom-left, hidden entirely. The
// hero is intentionally tiny: just the logo as a wordmark. Everything else
// is the widget grid.
export default function HomePage({ onOpen }) {
  return (
    <Box sx={{
      position: 'relative', minHeight: '100%', display: 'flex',
      flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start',
      pb: 6, color: '#e6e9f5',
    }}>
      <Favorites onOpen={onOpen} />

      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', px: 3, width: '100%' }}>
        <Box sx={{
          width: '100%',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          pt: { xs: 2, md: 3 }, pb: { xs: 1, md: 1.5 },
        }}>
          <motion.div initial={{ y: 12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.45 }}>
            <Typography variant="h4" sx={{
              fontWeight: 800, letterSpacing: -1.0, textAlign: 'center',
              background: 'linear-gradient(90deg,#7aa2ff,#a78bfa,#34d399)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            }}>
              Smart<span style={{ fontWeight: 400 }}>Browser</span>
            </Typography>
            <Typography variant="caption" sx={{ display: 'block', textAlign: 'center',
              color: '#9aa3c7', mt: 0.25, letterSpacing: 1, textTransform: 'uppercase' }}>
              Private · Masked · Free
            </Typography>
          </motion.div>
        </Box>

        <Widgets onOpen={onOpen} />
      </Box>
    </Box>
  );
}
