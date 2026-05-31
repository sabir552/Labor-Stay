/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: {
          DEFAULT: '#1A3C5E',
          50:  '#E8EEF4',
          100: '#C8D6E3',
          200: '#94B0C7',
          300: '#5F88AA',
          400: '#3A6388',
          500: '#1A3C5E',
          600: '#15314C',
          700: '#10263A',
          800: '#0B1B29',
          900: '#060F18',
        },
        gold: {
          DEFAULT: '#E8A020',
          50:  '#FCF2DE',
          100: '#F8E1B0',
          200: '#F2C76A',
          300: '#EDB245',
          400: '#E8A020',
          500: '#C58415',
          600: '#9B6810',
          700: '#724C0B',
          800: '#493006',
          900: '#241803',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        arabic: ['"Cairo"', '"Noto Sans Arabic"', 'sans-serif'],
      },
      boxShadow: {
        soft: '0 4px 14px rgba(26, 60, 94, 0.08)',
        lift: '0 12px 32px rgba(26, 60, 94, 0.14)',
      },
    },
  },
  plugins: [],
};
