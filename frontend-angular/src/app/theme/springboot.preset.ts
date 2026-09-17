import { definePreset } from '@primeuix/themes';
import Aura from '@primeuix/themes/aura';

const SpringBootPreset = definePreset(Aura, {
  semantic: {
    primary: {
      50: '#f7fbf4',
      100: '#eef7e8',
      200: '#daeecd',
      300: '#c1e3ab',
      400: '#9dd279',
      500: '#6cb53d',
      600: '#5a9732',
      700: '#487828',
      800: '#365a1e',
      900: '#233b14',
      950: '#16240c',
    },
  },
});

export default SpringBootPreset;
