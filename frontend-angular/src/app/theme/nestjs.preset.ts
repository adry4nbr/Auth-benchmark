import { definePreset } from '@primeuix/themes';
import Aura from '@primeuix/themes/aura';

const NestjsPreset = definePreset(Aura, {
  semantic: {
    primary: {
      50: '#fdf1f4',
      100: '#fce4e9',
      200: '#f7c4d0',
      300: '#f29caf',
      400: '#eb6180',
      500: '#e3204d',
      600: '#c1193f',
      700: '#9d1433',
      800: '#791028',
      900: '#550b1c',
      950: '#3a0713',
    },
  },
});

export default NestjsPreset;
