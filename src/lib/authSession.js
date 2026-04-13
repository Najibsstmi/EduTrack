import { supabase } from './supabaseClient'

const AUTH_ERROR_PATTERNS = [
  'Invalid Refresh Token',
  'Refresh Token Not Found',
  'JWT expired',
  'refresh_token_not_found',
]

export const isRefreshTokenError = (error) => {
  const msg = String(error?.message || '')
  return AUTH_ERROR_PATTERNS.some((pattern) => msg.includes(pattern))
}

// backward-compat alias
export const isAuthSessionError = isRefreshTokenError

export const forceCleanLogout = async () => {
  try {
    await supabase.auth.signOut()
  } catch (error) {
    console.error('signOut error:', error)
  } finally {
    try {
      localStorage.clear()
      sessionStorage.clear()
    } catch (storageError) {
      console.error('storage clear error:', storageError)
    }

    window.location.replace('/login')
  }
}
