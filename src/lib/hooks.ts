import { useEffect, useState } from 'react'

export function useDebounce<T>(valor: T, atraso = 350): T {
  const [v, setV] = useState(valor)
  useEffect(() => {
    const t = window.setTimeout(() => setV(valor), atraso)
    return () => window.clearTimeout(t)
  }, [valor, atraso])
  return v
}
