import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  envPrefix: ['VITE_', 'TAURI_ENV_'],
  build: {
    target: 'es2022',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (/recharts|d3-|victory|react-smooth/.test(id)) return 'charts';
            if (id.includes('@xyflow')) return 'network-map';
            if (/react-dom|react-router|\/react\//.test(id)) return 'react';
          }
        },
      },
    },
  },
  test: { environment: 'jsdom', setupFiles: ['./tests/setup.ts'], css: false },
});
