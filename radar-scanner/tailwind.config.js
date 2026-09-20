/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: { mono: ['"JetBrains Mono"', 'monospace'] },
      colors: {
        radar: { cyan: '#18b8d6', green: '#22c55e', red: '#ef4444', amber: '#f59e0b', navy: '#050d14' }
      }
    }
  },
  plugins: []
}
