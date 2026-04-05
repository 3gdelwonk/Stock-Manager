/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './crew/index.html', './stockintel/index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      screens: {
        'safe': { raw: '(min-height: 0px)' },
      },
      keyframes: {
        'scanner-line': {
          '0%, 100%': { top: '8px', opacity: '0.4' },
          '50%': { top: 'calc(100% - 10px)', opacity: '1' },
        },
      },
      animation: {
        'scanner-line': 'scanner-line 2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
