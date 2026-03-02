/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/**/*.{html,tsx,ts,jsx,js}'],
  theme: {
    extend: {
      colors: {
        specter: {
          violet: '#7C3AED',
          'violet-light': '#8B5CF6',
          'violet-dark': '#6D28D9',
          dark: '#0a0a0f',
          darker: '#050508',
          surface: '#111118',
          border: 'rgba(255, 255, 255, 0.06)'
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace']
      },
      backdropBlur: {
        '2xl': '40px',
        '3xl': '64px'
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.4s ease-out',
        shimmer: 'shimmer 2s infinite'
      }
    }
  },
  plugins: []
}
