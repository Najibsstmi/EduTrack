const SESSION_KEY = 'pajsk_entry_session'

export const getSessionToken = () => sessionStorage.getItem(SESSION_KEY) || ''

export const setSessionToken = (token: string) => {
  sessionStorage.setItem(SESSION_KEY, token)
}

export const clearSessionToken = () => {
  sessionStorage.removeItem(SESSION_KEY)
}
