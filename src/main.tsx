import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './app/App';
import { applyTheme } from './services/theme';
import { useUI } from './stores/ui';
import './styles/global.css';
import './styles/workspace.css';
applyTheme(useUI.getState().theme);
if (import.meta.env.DEV && import.meta.env.MODE === 'e2e') {
  const { installDemoHarness } = await import('../tests/e2e/demo-harness');
  installDemoHarness();
}
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
    mutations: { retry: 0 },
  },
});
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
