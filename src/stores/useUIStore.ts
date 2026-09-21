import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const getCurrentMonth = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

interface UIStore {
  theme: 'dark' | 'light'; setTheme: (t: 'dark' | 'light') => void; toggleTheme: () => void;
  selectedPeriod: string; setSelectedPeriod: (p: string) => void;
  selectedPerson: string; setSelectedPerson: (p: string) => void;
  searchTerm: string; setSearchTerm: (t: string) => void;
  resetFilters: () => void;
}

export const useUIStore = create<UIStore>()(persist((set) => ({
  theme: 'dark',
  setTheme: (theme) => { document.documentElement.setAttribute('data-theme', theme); set({ theme }); },
  toggleTheme: () => set((state) => { const next = state.theme === 'dark' ? 'light' : 'dark'; document.documentElement.setAttribute('data-theme', next); return { theme: next }; }),
  selectedPeriod: getCurrentMonth(), setSelectedPeriod: (period) => set({ selectedPeriod: period }),
  selectedPerson: 'all', setSelectedPerson: (person) => set({ selectedPerson: person }),
  searchTerm: '', setSearchTerm: (term) => set({ searchTerm: term }),
  resetFilters: () => set({ selectedPeriod: getCurrentMonth(), selectedPerson: 'all', searchTerm: '' }),
}), {
  name: 'fluxo_ui_preferences', partialize: (state) => ({ theme: state.theme, selectedPeriod: state.selectedPeriod }),
  onRehydrateStorage: () => (state) => { if (state?.theme) document.documentElement.setAttribute('data-theme', state.theme); },
}));

