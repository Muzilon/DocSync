import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // O .env fica na raiz do monorepo; só variáveis VITE_* chegam ao navegador.
  envDir: '../../',
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3001',
        rewrite: (caminho) => caminho.replace(/^\/api/, ''),
      },
    },
  },
});
