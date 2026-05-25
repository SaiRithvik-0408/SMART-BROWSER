import React from 'react';
import { Box, Tabs, Tab, IconButton, Stack, Typography } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import PublicIcon from '@mui/icons-material/Public';

export default function TabsBar({ tabs, activeId, onSelect, onClose }) {
  return (
    <Box sx={{ px: 1, position: 'relative', zIndex: 5 }}>
      <Tabs
        value={activeId} onChange={(_, v) => onSelect(v)}
        variant="scrollable" scrollButtons="auto"
        sx={{
          minHeight: 38,
          '& .MuiTabs-indicator': { background: 'linear-gradient(90deg,#7aa2ff,#a78bfa)', height: 3, borderRadius: 2 },
        }}
      >
        {tabs.map(t => (
          <Tab
            key={t.id} value={t.id}
            sx={{ minHeight: 38, py: 0.5, px: 1.5, mr: 0.5,
              borderRadius: '12px 12px 0 0',
              backgroundColor: t.id === activeId ? 'rgba(122,162,255,0.10)' : 'transparent' }}
            label={
              <Stack direction="row" alignItems="center" spacing={1} sx={{ maxWidth: 220 }}>
                <PublicIcon fontSize="small" sx={{ opacity: 0.7 }} />
                <Typography variant="body2" noWrap sx={{ maxWidth: 150 }}>
                  {t.title || 'New tab'}
                </Typography>
                <IconButton
                  size="small"
                  onClick={(e) => { e.stopPropagation(); onClose(t.id); }}
                  sx={{ ml: 0.5 }}
                >
                  <CloseIcon sx={{ fontSize: 14 }} />
                </IconButton>
              </Stack>
            }
          />
        ))}
      </Tabs>
    </Box>
  );
}
