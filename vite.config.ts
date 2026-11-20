import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [react()],
  // A pasta "assets" guarda o logotipo original e demais arquivos estáticos,
  // servidos na raiz do site (ex.: assets/logo-sheik.png -> /logo-sheik.png).
  publicDir: 'assets',
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
