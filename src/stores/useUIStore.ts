import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ThemeMode = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_OPTIONS: { value: ThemeMode; label: string }[] = [
  { value: 'light', label: 'Floresta, claro' },
  { value: 'dark', label: 'Verde calmo, escuro' },
  { value: 'system', label: 'Automático' },
];

const getCurrentMonth = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

function getSystemTheme(): ResolvedTheme {
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return 'light';
}

export function resolveTheme(mode: ThemeMode): ResolvedTheme {
  if (mode === 'light' || mode === 'dark') return mode;
  return getSystemTheme();
}

export function applyResolvedTheme(resolved: ResolvedTheme) {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme', resolved);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute('content', resolved === 'dark' ? '#0A1110' : '#F3F1E9');
  }
}

function saveThemeModeSafe(mode: ThemeMode) {
  try {
    localStorage.setItem('wynd_theme_mode', mode);
  } catch {
    // Ignora falha de localStorage em modo privado restrito
  }
}

function readInitialThemeMode(): ThemeMode {
  try {
    const saved = localStorage.getItem('wynd_theme_mode');
    if (saved === 'light' || saved === 'dark' || saved === 'system') return saved;
  } catch {
    // Ignora falha de localStorage
  }
  return 'system';
}

interface UIStore {
  themeMode: ThemeMode;
  theme: ResolvedTheme;
  setThemeMode: (mode: ThemeMode) => void;
  setTheme: (t: 'dark' | 'light' | 'system') => void;
  toggleTheme: () => void;
  selectedPeriod: string;
  setSelectedPeriod: (p: string) => void;
  selectedPerson: string;
  setSelectedPerson: (p: string) => void;
  searchTerm: string;
  setSearchTerm: (t: string) => void;
  privacyMode: boolean;
  togglePrivacyMode: () => void;
  resetFilters: () => void;
}

const initialMode = readInitialThemeMode();
const initialResolved = resolveTheme(initialMode);

export const useUIStore = create<UIStore>()(
  persist(
    (set, get) => ({
      themeMode: initialMode,
      theme: initialResolved,
      setThemeMode: (themeMode) => {
        saveThemeModeSafe(themeMode);
        const resolved = resolveTheme(themeMode);
        applyResolvedTheme(resolved);
        set({ themeMode, theme: resolved });
      },
      setTheme: (t) => {
        const mode: ThemeMode = t === 'system' ? 'system' : t === 'light' ? 'light' : 'dark';
        saveThemeModeSafe(mode);
        const resolved = resolveTheme(mode);
        applyResolvedTheme(resolved);
        set({ themeMode: mode, theme: resolved });
      },
      toggleTheme: () => {
        const current = get().theme;
        const next: ResolvedTheme = current === 'dark' ? 'light' : 'dark';
        saveThemeModeSafe(next);
        applyResolvedTheme(next);
        set({ themeMode: next, theme: next });
      },
      selectedPeriod: getCurrentMonth(),
      setSelectedPeriod: (period) => set({ selectedPeriod: period }),
      selectedPerson: 'all',
      setSelectedPerson: (person) => set({ selectedPerson: person }),
      searchTerm: '',
      setSearchTerm: (term) => set({ searchTerm: term }),
      privacyMode: false,
      togglePrivacyMode: () => set((state) => ({ privacyMode: !state.privacyMode })),
      resetFilters: () =>
        set({ selectedPeriod: getCurrentMonth(), selectedPerson: 'all', searchTerm: '' }),
    }),
    {
      name: 'fluxo_ui_preferences',
      partialize: (state) => ({
        themeMode: state.themeMode,
        theme: state.theme,
        selectedPeriod: state.selectedPeriod,
        privacyMode: state.privacyMode,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          const mode = state.themeMode || state.theme || 'system';
          const resolved = resolveTheme(mode);
          saveThemeModeSafe(mode);
          applyResolvedTheme(resolved);
        }
      },
    }
  )
);

if (typeof window !== 'undefined' && window.matchMedia) {
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const handleChange = () => {
    const state = useUIStore.getState();
    if (state.themeMode === 'system') {
      const resolved = getSystemTheme();
      applyResolvedTheme(resolved);
      useUIStore.setState({ theme: resolved });
    }
  };
  if (typeof mq.addEventListener === 'function') {
    mq.addEventListener('change', handleChange);
  }
}

if (typeof document !== 'undefined' && typeof MutationObserver !== 'undefined') {
  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === 'attributes' && m.attributeName === 'data-theme') {
        const attr = document.documentElement.getAttribute('data-theme');
        if (attr === 'dark' || attr === 'light') {
          const meta = document.querySelector('meta[name="theme-color"]');
          if (meta) {
            meta.setAttribute('content', attr === 'dark' ? '#0A1110' : '#F3F1E9');
          }
          if (useUIStore.getState().theme !== attr) {
            useUIStore.setState({ theme: attr });
          }
        }
      }
    }
  });
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
}
