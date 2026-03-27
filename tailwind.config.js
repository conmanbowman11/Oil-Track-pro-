/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,jsx}',
    './components/**/*.{js,jsx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f6ece5',
          100: '#edcfbb',
          200: '#d9a07a',
          500: '#c45d2c',
          600: '#a84b22',
          700: '#8c3c1b',
        },
      },
      fontFamily: {
        sans: ['Outfit', 'sans-serif'],
        mono: ['IBM Plex Mono', 'monospace'],
      },
    },
  },
  plugins: [],
};
