/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      // ===== COLOR PALETTE =====
      colors: {
        slate: {
          50: '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
          300: '#cbd5e1',
          400: '#94a3b8',
          500: '#64748b',
          600: '#475569',
          700: '#334155',
          750: '#2d3748',
          800: '#1e293b',
          850: '#1a2332',
          900: '#0f172a',
          950: '#0a0f1f',
        },
        blue: {
          50: '#f0f9ff',
          100: '#e0f2fe',
          200: '#bae6fd',
          300: '#7dd3fc',
          400: '#38bdf8',
          500: '#06b6d4',
          600: '#0891b2',
          700: '#0e7490',
          800: '#155e75',
          900: '#164e63',
          950: '#0c2d3a',
        },
        cyan: {
          400: '#22d3ee',
          500: '#06b6d4',
          600: '#0891b2',
        },
        emerald: {
          400: '#34d399',
          500: '#10b981',
          600: '#059669',
        },
        orange: {
          400: '#fb923c',
          500: '#f97316',
          600: '#ea580c',
        },
        red: {
          400: '#f87171',
          500: '#ef4444',
          600: '#dc2626',
        },
        purple: {
          400: '#c084fc',
          500: '#a855f7',
          600: '#9333ea',
        },
      },

      // ===== SPACING (8px system) =====
      spacing: {
        px: '1px',
        0: '0px',
        0.5: '0.125rem',
        1: '0.25rem',
        1.5: '0.375rem',
        2: '0.5rem',
        2.5: '0.625rem',
        3: '0.75rem',
        3.5: '0.875rem',
        4: '1rem',
        5: '1.25rem',
        6: '1.5rem',
        7: '1.75rem',
        8: '2rem',
        9: '2.25rem',
        10: '2.5rem',
        12: '3rem',
        14: '3.5rem',
        16: '4rem',
        20: '5rem',
        24: '6rem',
        28: '7rem',
        32: '8rem',
        36: '9rem',
        40: '10rem',
        44: '11rem',
        48: '12rem',
        52: '13rem',
        56: '14rem',
        60: '15rem',
        64: '16rem',
        72: '18rem',
        80: '20rem',
        96: '24rem',
      },

      // ===== TYPOGRAPHY =====
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'sans-serif'],
        mono: ['"Monaco"', '"Courier New"', 'monospace'],
      },
      fontSize: {
        xs: ['0.75rem', { lineHeight: '1rem' }],
        sm: ['0.875rem', { lineHeight: '1.25rem' }],
        base: ['1rem', { lineHeight: '1.5rem' }],
        lg: ['1.125rem', { lineHeight: '1.75rem' }],
        xl: ['1.25rem', { lineHeight: '1.75rem' }],
        '2xl': ['1.5rem', { lineHeight: '2rem' }],
        '3xl': ['1.875rem', { lineHeight: '2.25rem' }],
        '4xl': ['2.25rem', { lineHeight: '2.5rem' }],
      },
      fontWeight: {
        thin: '100',
        extralight: '200',
        light: '300',
        normal: '400',
        medium: '500',
        semibold: '600',
        bold: '700',
        extrabold: '800',
        black: '900',
      },

      // ===== SHADOWS =====
      boxShadow: {
        xs: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
        sm: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
        md: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
        lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
        xl: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
        '2xl': '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        inner: 'inset 0 2px 4px 0 rgba(0, 0, 0, 0.05)',
        none: 'none',
        glow: '0 0 20px rgba(59, 130, 246, 0.3)',
        'glow-lg': '0 0 30px rgba(59, 130, 246, 0.4)',
        'glow-red': '0 0 20px rgba(239, 68, 68, 0.3)',
        'glow-green': '0 0 20px rgba(34, 197, 94, 0.3)',
      },

      // ===== BORDER RADIUS =====
      borderRadius: {
        none: '0px',
        sm: '0.125rem',
        DEFAULT: '0.25rem',
        md: '0.375rem',
        lg: '0.5rem',
        xl: '0.75rem',
        '2xl': '1rem',
        '3xl': '1.5rem',
        full: '9999px',
      },

      // ===== TRANSITIONS & ANIMATIONS =====
      transitionDuration: {
        fast: '150ms',
        base: '200ms',
        slow: '300ms',
        slower: '500ms',
      },
      transitionTimingFunction: {
        'ease-out': 'cubic-bezier(0.4, 0, 0.2, 1)',
        'ease-in': 'cubic-bezier(0.4, 0, 0.2, 1)',
        'ease-in-out': 'cubic-bezier(0.4, 0, 0.2, 1)',
      },
      animation: {
        'fade-in': 'fadeIn 200ms ease-out',
        'slide-in-left': 'slideInLeft 200ms ease-out',
        'slide-in-right': 'slideInRight 200ms ease-out',
        'bounce-in': 'bounceIn 300ms cubic-bezier(0.34, 1.56, 0.64, 1)',
        'pulse-hot': 'pulseHot 2s infinite',
        'shimmer': 'shimmer 2s infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideInLeft: {
          '0%': { opacity: '0', transform: 'translateX(-20px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        slideInRight: {
          '0%': { opacity: '0', transform: 'translateX(20px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        bounceIn: {
          '0%': { opacity: '0', transform: 'scale(0.95) translateY(10px)' },
          '50%': { opacity: '1' },
          '100%': { opacity: '1', transform: 'scale(1) translateY(0)' },
        },
        pulseHot: {
          '0%, 100%': { 'box-shadow': '0 0 0 0 rgba(239, 68, 68, 0.7)' },
          '50%': { 'box-shadow': '0 0 0 6px rgba(239, 68, 68, 0)' },
        },
        shimmer: {
          '0%': { 'background-position': '-1000px 0' },
          '100%': { 'background-position': '1000px 0' },
        },
      },

      // ===== BACKGROUNDS =====
      backgroundImage: {
        'gradient-primary': 'linear-gradient(135deg, #3b82f6 0%, #06b6d4 100%)',
        'gradient-success': 'linear-gradient(135deg, #22c55e 0%, #10b981 100%)',
        'gradient-warning': 'linear-gradient(135deg, #f59e0b 0%, #f97316 100%)',
        'gradient-danger': 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
        'gradient-purple': 'linear-gradient(135deg, #a855f7 0%, #ec4899 100%)',
        'gradient-soft': 'linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(6, 182, 212, 0.1) 100%)',
      },

      // ===== BACKDROP FILTER =====
      backdropFilter: {
        'blur-md': 'blur(12px)',
        'blur-lg': 'blur(16px)',
        'blur-xl': 'blur(20px)',
      },
      backdropBlur: {
        xs: '4px',
        sm: '8px',
        md: '12px',
        lg: '16px',
        xl: '20px',
      },

      // ===== Z-INDEX =====
      zIndex: {
        hide: '-1',
        auto: 'auto',
        0: '0',
        10: '10',
        20: '20',
        30: '30',
        40: '40',
        50: '50',
        60: '60',
        70: '70',
        80: '80',
        90: '90',
        100: '100',
      },

      // ===== OPACITY =====
      opacity: {
        0: '0',
        5: '0.05',
        10: '0.1',
        20: '0.2',
        30: '0.3',
        40: '0.4',
        50: '0.5',
        60: '0.6',
        70: '0.7',
        80: '0.8',
        90: '0.9',
        95: '0.95',
        100: '1',
      },

      // ===== FILTERS =====
      filter: {
        'blur-0': 'blur(0)',
        'blur-1': 'blur(1px)',
        'blur-2': 'blur(2px)',
      },

      // ===== WIDTH & HEIGHT =====
      width: {
        'sidebar-collapsed': '80px',
        'sidebar-expanded': '288px',
      },

      // ===== ASPECT RATIO =====
      aspectRatio: {
        auto: 'auto',
        square: '1 / 1',
        video: '16 / 9',
        '3/2': '3 / 2',
        '4/3': '4 / 3',
      },
    },
  },

  // ===== PLUGINS =====
  plugins: [
    // Custom utilities
    ({ addUtilities, addComponents }) => {
      addUtilities({
        '.glass': {
          '@apply backdrop-blur-md bg-white/10': {},
        },
        '.glass-light': {
          '@apply backdrop-blur-md bg-white/20': {},
        },
        '.glass-dark': {
          '@apply backdrop-blur-md bg-black/20': {},
        },
        '.card': {
          '@apply bg-slate-800/50 border border-slate-700/50 rounded-lg p-6': {},
        },
        '.btn': {
          '@apply inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium transition-all duration-200': {},
        },
        '.btn-primary': {
          '@apply btn bg-gradient-to-r from-blue-600 to-cyan-600 text-white hover:from-blue-700 hover:to-cyan-700 shadow-lg hover:shadow-xl': {},
        },
        '.btn-secondary': {
          '@apply btn bg-slate-800 text-slate-200 hover:bg-slate-700 border border-slate-700': {},
        },
        '.badge': {
          '@apply inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold': {},
        },
        '.badge-primary': {
          '@apply badge bg-blue-500/20 text-blue-400 border border-blue-500/30': {},
        },
        '.badge-success': {
          '@apply badge bg-emerald-500/20 text-emerald-400 border border-emerald-500/30': {},
        },
        '.badge-warning': {
          '@apply badge bg-orange-500/20 text-orange-400 border border-orange-500/30': {},
        },
        '.badge-danger': {
          '@apply badge bg-red-500/20 text-red-400 border border-red-500/30': {},
        },
        '.input': {
          '@apply w-full px-4 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all': {},
        },
        '.input:disabled': {
          '@apply opacity-50 cursor-not-allowed': {},
        },
        '.text-gradient': {
          '@apply bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent': {},
        },
        '.scrollbar-thin': {
          'scrollbar-width': 'thin',
          'scrollbar-color': 'rgba(71, 85, 105, 0.5) rgba(71, 85, 105, 0.1)',
        },
        '.scrollbar-thumb': {
          '&::-webkit-scrollbar': {
            'width': '8px',
            'height': '8px',
          },
          '&::-webkit-scrollbar-track': {
            'background': 'rgba(71, 85, 105, 0.1)',
          },
          '&::-webkit-scrollbar-thumb': {
            'background': 'rgba(71, 85, 105, 0.3)',
            'border-radius': '4px',
          },
          '&::-webkit-scrollbar-thumb:hover': {
            'background': 'rgba(71, 85, 105, 0.5)',
          },
        },
      });

      addComponents({
        '.modal-backdrop': {
          '@apply fixed inset-0 bg-black/50 backdrop-blur-sm z-50': {},
        },
        '.modal-content': {
          '@apply bg-slate-900 border border-slate-700/50 rounded-xl shadow-2xl': {},
        },
        '.table-head': {
          '@apply bg-slate-800/50 text-slate-400 text-xs font-semibold uppercase tracking-wider': {},
        },
        '.table-row': {
          '@apply border-b border-slate-700/50 hover:bg-slate-700/30 transition-colors': {},
        },
      });
    },
  ],
};
