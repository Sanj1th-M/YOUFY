export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        primary:  '#1DB954',
        surface:  '#000000',
        elevated: '#121212',
        subtle:   '#282828',
        muted:    '#B3B3B3',
        card:     '#181818',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      animation: {
        'glow-pulse': 'glow 2s ease-in-out infinite',
      },
      keyframes: {
        glow: {
          '0%, 100%': { 
            boxShadow: '0 0 5px rgba(252, 255, 249, 0.2)', 
            transform: 'scale(1)' 
          },
          '50%': { 
            boxShadow: '0 0 15px rgba(252, 255, 249, 0.5)', 
            transform: 'scale(1.05)' 
          },
        }
      }
    },
  },
  plugins: [],
};
