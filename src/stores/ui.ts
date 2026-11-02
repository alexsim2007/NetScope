import { create } from 'zustand';
export type Theme = 'system' | 'light' | 'dark';
const savedTheme = localStorage.getItem('netscope.theme');
interface UIState {
  theme: Theme;
  resolvedTheme: 'light' | 'dark';
  setTheme: (theme: Theme) => void;
  collapsed: boolean;
  selectedId: string | null;
  setupOpen: boolean;
  toast: string | null;
  toggleSidebar: () => void;
  selectDevice: (id: string | null) => void;
  setSetup: (value: boolean) => void;
  notify: (message: string) => void;
}
let toastTimer: ReturnType<typeof setTimeout> | undefined;
export const useUI = create<UIState>((set) => ({
  theme: savedTheme === 'light' || savedTheme === 'dark' ? savedTheme : 'system',
  resolvedTheme: window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
  setTheme: (theme) => {
    localStorage.setItem('netscope.theme', theme);
    set({ theme });
  },
  collapsed: localStorage.getItem('netscope.sidebar') === 'collapsed',
  selectedId: null,
  setupOpen: false,
  toast: null,
  toggleSidebar: () =>
    set((s) => {
      localStorage.setItem('netscope.sidebar', s.collapsed ? 'expanded' : 'collapsed');
      return { collapsed: !s.collapsed };
    }),
  selectDevice: (selectedId) => set({ selectedId }),
  setSetup: (setupOpen) => set({ setupOpen }),
  notify: (toast) => {
    clearTimeout(toastTimer);
    set({ toast });
    toastTimer = setTimeout(() => set({ toast: null }), 5000);
  },
}));
