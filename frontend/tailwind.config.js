/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        fire: {
          orange: '#f97316',
          pink: '#ec4899',
          purple: '#8b5cf6'
        },
        fuel: '#fbbf24',
        oxygen: '#3b82f6',
        heat: '#ef4444'
      }
    }
  },
  plugins: []
}
