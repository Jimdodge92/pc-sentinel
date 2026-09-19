/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        sentinel: {
          950: '#090d16',
          900: '#0f172a',
          850: '#131e35',
          800: '#1e293b',
          700: '#334155',
          600: '#475569',
        }
      }
    },
  },
  plugins: [],
}
