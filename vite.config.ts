import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const API = process.env.CADRAGE_API ?? 'http://127.0.0.1:8787';

export default defineConfig({
  plugins: [react()],
  server: {
    // Le navigateur ne parle qu'à Vite ; l'API est servie sous la même origine,
    // donc pas de CORS ni de configuration à tenir de deux côtés.
    proxy: {
      '/api': { target: API, changeOrigin: true },
    },
  },
});
