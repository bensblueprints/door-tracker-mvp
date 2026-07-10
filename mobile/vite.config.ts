import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './', // required for Capacitor's file:// asset loading
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
});
