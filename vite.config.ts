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
  build: {
    rollupOptions: {
      output: {
        // bibliotecas em pacotes próprios: mudam pouco e ficam em cache entre versões do sistema
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (/[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/.test(id)) return 'react'
          if (id.includes('@supabase')) return 'supabase'
          if (id.includes('@radix-ui')) return 'radix'
          if (/zod|react-hook-form|@hookform/.test(id)) return 'formularios'
          return undefined
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
