import { createTheme } from '@mui/material';

const theme = createTheme({
  palette: {
    mode: 'dark',
    primary:   { main: '#7aa2ff' },
    secondary: { main: '#a78bfa' },
    success:   { main: '#34d399' },
    warning:   { main: '#fbbf24' },
    error:     { main: '#f87171' },
    background: {
      default: '#05060f',
      paper:   'rgba(20, 26, 54, 0.72)',
    },
    divider: 'rgba(122,162,255,0.18)',
    text: { primary: '#e6e9f5', secondary: '#9aa3c7' },
  },
  shape: { borderRadius: 14 },
  typography: {
    fontFamily: "'Inter', system-ui, sans-serif",
    button: { textTransform: 'none', fontWeight: 600 },
    h6: { fontWeight: 700, letterSpacing: 0.2 },
  },
  components: {
    MuiPaper: {
      styleOverrides: {
        root: {
          backdropFilter: 'blur(18px) saturate(140%)',
          backgroundImage:
            'linear-gradient(180deg, rgba(30,40,90,0.55), rgba(15,20,50,0.65))',
          border: '1px solid rgba(122,162,255,0.18)',
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: { borderRadius: 12 },
        containedPrimary: {
          boxShadow: '0 8px 24px rgba(122,162,255,0.35)',
        },
      },
    },
    MuiTab: { styleOverrides: { root: { textTransform: 'none' } } },
  },
});

export default theme;
