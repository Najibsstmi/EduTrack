import { createContext } from 'react'
import type { BootstrapData } from '../types'

export interface SessionContextValue {
  data: BootstrapData | null
  loading: boolean
  error: string
  login: (code: string) => Promise<void>
  logout: () => Promise<void>
  refresh: () => Promise<void>
}

export const SessionContext = createContext<SessionContextValue | null>(null)
