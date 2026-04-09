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
    },
  },
  plugins: [],
};
