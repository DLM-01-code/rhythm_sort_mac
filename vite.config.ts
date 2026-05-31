import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  base: './',
  server: {
    port: 8080,
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    // Копируем public/ в dist/ при сборке — там лежит icon.png
    rollupOptions: {
      output: {
        manualChunks: undefined,
      },
    },
  },
  // public dir по умолчанию ./public — Vite копирует его в dist автоматически
  publicDir: 'public',
})
