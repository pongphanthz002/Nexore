import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        black: {
          50: '#0a0a0a',
          100: '#121212',
          200: '#1a1a1a',
          300: '#222222',
          400: '#2a2a2a',
          500: '#333333',
          600: '#404040',
          700: '#4a4a4a',
          800: '#555555',
          900: '#666666',
        },
        neon: {
          green: {
            50: '#e6fffa',
            100: '#b2f5ea',
            200: '#81e6d9',
            300: '#4fd1c5',
            400: '#38b2ac',
            500: '#319795',
            600: '#2c7a7b',
            700: '#285e61',
            800: '#234e52',
            900: '#1d4044',
          },
          bright: '#00ff41',
          glow: '#39ff14',
        },
      },
      boxShadow: {
        'neon': '0 0 5px #39ff14, 0 0 20px #39ff14',
        'neon-strong': '0 0 10px #39ff14, 0 0 40px #39ff14, 0 0 80px #39ff14',
      },
    },
  },
  plugins: [],
};
export default config;
