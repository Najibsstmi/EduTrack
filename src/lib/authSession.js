import { supabase } from './supabaseClient'

const AUTH_ERROR_PATTERNS = [
  'Invalid Refresh Token',
  'Refresh Token Not Found',
  'JWT expired',
]

export const isAuthSessionError = (error) => {
  const msg = String(error?.message || '')
  return AUTH_ERROR_PATTERNS.some((pattern) => msg.includes(pattern))
}

const clearSupabaseStorageKeys = () => {
  try {
    localStorage.removeItem('supabase.auth.token')

    const localKeys = Object.keys(localStorage)
    localKeys
      .filter((key) => key.startsWith('sb-') && key.includes('auth-token'))
      .forEach((key) => localStorage.removeItem(key))
  } catch (error) {
    console.error('localStorage cleanup error:', error)
  }

  try {
    const sessionKeys = Object.keys(sessionStorage)
    sessionKeys
      .filter((key) => key.startsWith('sb-') && key.includes('auth-token'))
      .forEach((key) => sessionStorage.removeItem(key))

    sessionStorage.clear()
  } catch (error) {
    console.error('sessionStorage cleanup error:', error)
  }
}

export const forceCleanLogout = async () => {
  try {
    await supabase.auth.signOut()
  } catch (error) {
    console.error('signOut error:', error)
  } finally {
    clearSupabaseStorageKeys()
    window.location.replace('/login')
  }
}
