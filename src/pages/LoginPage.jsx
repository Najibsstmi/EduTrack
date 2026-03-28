import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'

function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      alert(error.message)
      setLoading(false)
      return
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      alert('Gagal dapatkan maklumat pengguna')
      setLoading(false)
      return
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, full_name, email, role, approval_status, is_master_admin, is_school_admin')
      .eq('id', user.id)
      .maybeSingle()

    if (profileError || !profile) {
      alert('Profil pengguna tidak ditemui')
      setLoading(false)
      return
    }

    alert('Login berjaya')

    if (profile?.is_master_admin) {
      navigate('/master-admin')
    } else if ((profile?.is_school_admin === true || profile?.role === 'school_admin') && profile?.approval_status === 'approved') {
      navigate('/school-admin')
    } else if (profile?.approval_status === 'pending') {
      navigate('/pending')
    } else if (profile?.approval_status === 'approved') {
      navigate('/dashboard')
    } else {
      navigate('/login')
    }

    setLoading(false)
  }

  return (
    <div style={{ padding: '20px' }}>
      <h1>Login EduTrack</h1>

      <form onSubmit={handleLogin}>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <br /><br />

        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <br /><br />

        <button type="submit" disabled={loading}>
          {loading ? 'Loading...' : 'Login'}
        </button>
      </form>
    </div>
  )
}

export default LoginPage