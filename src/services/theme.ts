import { isTauri } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useUI, type Theme } from '../stores/ui';

export function applyTheme(theme: Theme) {
  const systemDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  const resolved = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme;
  document.documentElement.dataset.theme = resolved;
  document.documentElement.style.colorScheme = resolved;
  return resolved;
}

export function watchTheme() {
  const sync = () => {
    const theme = applyTheme(useUI.getState().theme);
    useUI.setState({ resolvedTheme: theme });
    if (isTauri())
      void getCurrentWindow()
        .setTheme(useUI.getState().theme === 'system' ? null : theme)
        .then(() => getCurrentWindow().setBackgroundColor(theme === 'dark' ? '#08090b' : '#f7f8fa'))
        .catch(() => {});
  };
  sync();
  const unsubscribe = useUI.subscribe((state, previous) => {
    if (state.theme !== previous.theme) sync();
  });
  const media = window.matchMedia?.('(prefers-color-scheme: dark)');
  media?.addEventListener('change', sync);
  return () => {
    unsubscribe();
    media?.removeEventListener('change', sync);
  };
}
