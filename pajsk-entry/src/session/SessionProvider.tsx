import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { apiRequest } from '../lib/api'
import { clearSessionToken, getSessionToken, setSessionToken } from '../lib/session'
import type { BootstrapData } from '../types'
import { SessionContext } from './session-context'

export function SessionProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<BootstrapData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    const token = getSessionToken()
    if (!token) {
      setData(null)
      setLoading(false)
      return
    }

    setLoading(true)
    setError('')
    try {
      const result = await apiRequest<BootstrapData>('bootstrap', {}, { sessionToken: token })
      setData(result)
    } catch (requestError) {
      clearSessionToken()
      setData(null)
      setError(requestError instanceof Error ? requestError.message : 'Sesi tidak dapat dimuatkan.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const login = useCallback(
    async (code: string) => {
      setLoading(true)
      setError('')
      try {
        const result = await apiRequest<{ token: string }>('login', { code }, { sessionToken: '' })
        setSessionToken(result.token)
        await refresh()
      } catch (requestError) {
        setError(requestError instanceof Error ? requestError.message : 'Kod akses tidak dapat disahkan.')
        throw requestError
      } finally {
        setLoading(false)
      }
    },
    [refresh]
  )

  const logout = useCallback(async () => {
    try {
      await apiRequest('logout')
    } catch {
      // Clear the local session even if the network is unavailable.
    } finally {
      clearSessionToken()
      setData(null)
      setError('')
    }
  }, [])

  const value = useMemo(
    () => ({ data, loading, error, login, logout, refresh }),
    [data, error, loading, login, logout, refresh]
  )

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}
