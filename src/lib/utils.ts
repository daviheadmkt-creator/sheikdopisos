import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Remove caracteres que quebram o filtro "or" do PostgREST. */
export const sanitizarBusca = (v: string) => v.replace(/[,()*%\\:"']/g, ' ').trim()

/** Converte '' em null para campos opcionais antes de enviar ao banco. */
export const vazioParaNull = <T extends Record<string, unknown>>(obj: T): T =>
  Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, v === '' ? null : v])) as T
