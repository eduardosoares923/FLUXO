/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        ink: 'var(--ink)',
        muted: 'var(--muted)',
        card: 'var(--card)',
        border: 'var(--border)',
        pri: 'var(--pri)',
        priSoft: 'var(--priSoft)',
        priInk: 'var(--priInk)',
        spend: 'var(--spend)',
        spendText: 'var(--spendText)',
        spendSoft: 'var(--spendSoft)',
        neutral: 'var(--neutral)',
        track: 'var(--track)',
        nav: 'var(--nav)',
        navMuted: 'var(--navMuted)',
        navActBg: 'var(--navActBg)',
        navActIcon: 'var(--navActIcon)',
        fab: 'var(--fab)',
        fabIcon: 'var(--fabIcon)',
        seg: 'var(--seg)',
        segOn: 'var(--segOn)',
        heroStart: 'var(--heroStart)',
        heroEnd: 'var(--heroEnd)',
        heroInk: 'var(--heroInk)',
        heroMuted: 'var(--heroMuted)',
        wordA: 'var(--wordA)',
        wordB: 'var(--wordB)',
      },
      fontFamily: {
        sans: ['"DM Sans"', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['"Bricolage Grotesque"', 'system-ui', '-apple-system', 'sans-serif'],
      },
      borderRadius: {
        'card-sm': '24px',
        card: '26px',
        'card-lg': '28px',
        field: '18px',
        btn: '18px',
        pill: '999px',
      },
    },
  },
  corePlugins: {
    // Mantém preflight desligado para preservar compatibilidade com regras base customizadas
    preflight: false,
  },
  plugins: [],
}
