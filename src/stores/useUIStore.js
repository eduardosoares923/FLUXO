import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const getCurrentMonth = () => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
};

export const useUIStore = create(
  persist(
    (set) => ({
      // Tema: 'dark' (padrão do FLUXO) ou 'light'
      theme: 'dark',
      setTheme: (theme) => {
        document.documentElement.setAttribute('data-theme', theme);
        set({ theme });
      },
      toggleTheme: () =>
        set((state) => {
          const next = state.theme === 'dark' ? 'light' : 'dark';
          document.documentElement.setAttribute('data-theme', next);
          return { theme: next };
        }),

      // Filtros de visualização compartilhados entre telas
      selectedPeriod: getCurrentMonth(),
      setSelectedPeriod: (period) => set({ selectedPeriod: period }),

      selectedPerson: 'all',
      setSelectedPerson: (person) => set({ selectedPerson: person }),

      searchTerm: '',
      setSearchTerm: (term) => set({ searchTerm: term }),

      resetFilters: () =>
        set({
          selectedPeriod: getCurrentMonth(),
          selectedPerson: 'all',
          searchTerm: '',
        }),
    }),
    {
      name: 'fluxo_ui_preferences',
      partialize: (state) => ({
        theme: state.theme,
        selectedPeriod: state.selectedPeriod,
      }),
      onRehydrateStorage: () => (state) => {
        if (state?.theme) {
          document.documentElement.setAttribute('data-theme', state.theme);
        }
      },
    }
  )
);
