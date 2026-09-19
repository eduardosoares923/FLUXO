/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  corePlugins: {
    // CRÍTICO: desliga o reset nativo do Tailwind para não quebrar o CSS antigo!
    preflight: false,
  },
  plugins: [],
}

