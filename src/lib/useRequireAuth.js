import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from './supabaseClient'

export function useRequireAuth() {
  const navigate = useNavigate()
  const [checkingAuth, setCheckingAuth] = useState(true)

  useEffect(() => {
    let isMounted = true

    const checkAuth = async () => {
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser()

      if (error || !user) {
        navigate('/login', { replace: true })
        return
      }

      if (isMounted) {
        setCheckingAuth(false)
      }
    }

    checkAuth()

    return () => {
      isMounted = false
    }
  }, [navigate])

  return checkingAuth
}
