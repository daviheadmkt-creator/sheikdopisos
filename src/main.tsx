import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { App } from './App'
import { AuthProvider } from './features/auth/AuthProvider'
import { InstalarApp } from './components/common/InstalarApp'
import { iniciarPwa } from './lib/pwa'
import './index.css'

iniciarPwa()

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false },
    mutations: { retry: 0 }, // operações de escrita nunca são repetidas automaticamente
  },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <App />
        <InstalarApp />
        <Toaster position="top-right" richColors closeButton />
      </AuthProvider>
    </QueryClientProvider>
  </React.StrictMode>,
)
