import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'

function DashboardPage() {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    const loadDashboard = async () => {
      setLoading(true)

      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!session?.user) {
        alert('Sila login dahulu')
        navigate('/login')
        return
      }

      const currentUser = session.user
      setUser(currentUser)

      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('id, full_name, email, role, approval_status, is_master_admin, is_school_admin')
        .eq('id', currentUser.id)
        .maybeSingle()

      if (profileError) {
        console.error('Profile error:', profileError)
        alert('Ralat semasa ambil profil')
        navigate('/login')
        return
      }

      if (!profileData) {
        console.error('Tiada profile untuk user id:', currentUser.id)
        alert('Profil tidak ditemui')
        navigate('/login')
        return
      }

      console.log('PROFILE DATA', profileData)

      if (profileData?.is_master_admin) {
        navigate('/master-admin')
        return
      }

      if (profileData?.is_school_admin === true && profileData?.approval_status === 'approved') {
        console.log('REDIRECT TO SCHOOL ADMIN')
        navigate('/school-admin')
        return
      }

      if (profileData?.approval_status === 'pending') {
        navigate('/pending')
        return
      }

      if (profileData?.approval_status === 'approved') {
        setProfile(profileData)
        setLoading(false)
        return
      }

      navigate('/login')
    }

    loadDashboard()
  }, [navigate])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    navigate('/login')
  }

  if (loading) {
    return <div style={{ padding: '20px' }}>Loading dashboard...</div>
  }

  return (
    <div style={{ padding: '20px' }}>
      <h1>Dashboard EduTrack</h1>

      <p><strong>User ID:</strong> {user?.id}</p>
      <p><strong>Nama:</strong> {profile?.full_name}</p>
      <p><strong>Email:</strong> {profile?.email}</p>
      <p><strong>Role:</strong> {profile?.role}</p>
      <p><strong>Status:</strong> {profile?.approval_status}</p>
      <p><strong>Master Admin:</strong> {profile?.is_master_admin ? 'Ya' : 'Tidak'}</p>

      <br />
      <button onClick={handleLogout}>Logout</button>
    </div>
  )
}

export default DashboardPage
