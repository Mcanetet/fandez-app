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
          bg: 'var(--zilo-bg)',
          surface: 'var(--zilo-surface)',
          card: 'var(--zilo-card)',
          elevated: 'var(--zilo-elevated)',
          border: 'var(--zilo-border)',
          accent: 'var(--zilo-accent)',
          'accent-soft': 'var(--zilo-accent-soft)',
          'accent-strong': 'var(--zilo-accent-strong)',
          text: 'var(--zilo-text)',
          muted: 'var(--zilo-muted)',
          success: 'var(--zilo-success)',
          warning: 'var(--zilo-warning)',
          danger: 'var(--zilo-danger)'
        },
        aland: {
          DEFAULT: 'var(--aland)',
          soft: 'var(--aland-soft)',
          strong: 'var(--aland-strong)'
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
