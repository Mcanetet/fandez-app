/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './views/**/*.ejs',
    './public/js/**/*.js',
    './brand/**/*.ejs'
  ],
  theme: {
    extend: {
      colors: {
        zilo: {
          bg: '#FFFFFF',
          surface: '#FFFFFF',
          card: '#FFFFFF',
          elevated: '#FFFFFF',
          border: '#E6E0D8',
          accent: '#C45C14',
          'accent-soft': '#F6E6D4',
          'accent-strong': '#A84E10',
          text: '#1A1814',
          muted: '#6B635A',
          success: '#2F6B4F',
          warning: '#B47814',
          danger: '#B83A2E'
        },
        aland: {
          DEFAULT: '#2A6A5B',
          soft: '#E4F0EC',
          strong: '#1F5045'
        }
      },
      fontFamily: {
        sans: ['"Source Sans 3"', 'system-ui', 'sans-serif'],
        display: ['"Bricolage Grotesque"', '"Source Sans 3"', 'system-ui', 'sans-serif'],
        brand: ['Unbounded', '"Bricolage Grotesque"', 'system-ui', 'sans-serif']
      },
      borderRadius: { '4xl': '2rem' },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4,0,0.6,1) infinite',
        'slide-up': 'slideUp 0.35s ease-out',
        'fade-in': 'fadeIn 0.25s ease-out',
        radar: 'radarPulse 2s ease-out infinite',
        'bounce-in': 'bounceIn 0.4s ease-out',
        shimmer: 'shimmer 2.5s ease-in-out infinite'
      },
      keyframes: {
        slideUp: {
          from: { transform: 'translateY(100%)', opacity: '0' },
          to: { transform: 'translateY(0)', opacity: '1' }
        },
        fadeIn: {
          from: { opacity: '0' },
          to: { opacity: '1' }
        },
        radarPulse: {
          '0%': { transform: 'scale(0.3)', opacity: '0.8' },
          '100%': { transform: 'scale(1.4)', opacity: '0' }
        },
        bounceIn: {
          '0%': { transform: 'scale(0.92)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' }
        },
        shimmer: {
          '0%,100%': { opacity: '0.5' },
          '50%': { opacity: '1' }
        }
      },
      boxShadow: {
        zilo: '0 1px 2px rgba(26,24,20,0.05), 0 6px 16px rgba(26,24,20,0.06)',
        'zilo-glow': '0 1px 2px rgba(26,24,20,0.05)'
      }
    }
  },
  plugins: []
};
