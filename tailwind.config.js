/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/**/*.{js,ts,jsx,tsx}',
    './index.html'
  ],
  theme: {
    extend: {
      colors: {
        bg: '#1b1e27',
        surface: '#232634',
        border: '#383c4a',
        accent: '#7c3aed',
        'accent-hover': '#6d28d9',
        'text-primary': '#e2e8f0',
        'text-secondary': '#94a3b8',
        success: '#22c55e',
        error: '#ef4444',
        warning: '#f59e0b',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Consolas', 'monospace'],
      }
    },
  },
  plugins: [],
}
