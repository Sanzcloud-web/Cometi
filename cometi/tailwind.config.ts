import type { Config } from 'tailwindcss';
import typography from '@tailwindcss/typography';

const config: Config = {
  content: ['./sidepanel.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {},
  },
  plugins: [typography],
};

export default config;
