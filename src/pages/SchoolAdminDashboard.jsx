import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'

export default function SchoolAdminDashboard() {
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [schoolAdminProfile, setSchoolAdminProfile] = useState(null)
  const [pendingUsers, setPendingUsers] = useState([])
  const [savingId, setSavingId] = useState(null)

  useEffect(() => {
    checkAccessAndFetch()
  }, [])

  const checkAccessAndFetch = async () => {
    setLoading(true)

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      navigate('/login', { replace: true })
      return
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, full_name, email, role, school_id, approval_status, is_school_admin, is_master_admin')
      .eq('id', user.id)
      .maybeSingle()

    if (profileError || !profile) {
      navigate('/login', { replace: true })
      return
    }

    if (profile.is_master_admin) {
      navigate('/master-admin', { replace: true })
      return
    }

    if ((profile.is_school_admin !== true && profile.role !== 'school_admin') || profile.approval_status !== 'approved') {
      if (profile.approval_status === 'pending') {
        navigate('/pending', { replace: true })
      } else {
        navigate('/dashboard', { replace: true })
      }
      return
    }

    setSchoolAdminProfile(profile)
    await fetchPendingUsers(profile.school_id)
    setLoading(false)
  }

  const fetchPendingUsers = async (schoolId) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, email, role, approval_status, created_at')
      .eq('school_id', schoolId)
      .eq('approval_status', 'pending')
      .order('created_at', { ascending: false })

    if (error) {
      console.error(error)
      alert('Gagal ambil senarai pengguna pending')
      return
    }

    setPendingUsers(data || [])
  }

  const handleApprove = async (userId) => {
    setSavingId(userId)

    const { error } = await supabase
      .from('profiles')
      .update({
        approval_status: 'approved',
      })
      .eq('id', userId)

    if (error) {
      console.error(error)
      alert('Gagal approve user')
      setSavingId(null)
      return
    }

    setPendingUsers((prev) => prev.filter((user) => user.id !== userId))
    setSavingId(null)
  }

  const handleReject = async (userId) => {
    setSavingId(userId)

    const { error } = await supabase
      .from('profiles')
      .update({
        approval_status: 'rejected',
      })
      .eq('id', userId)

    if (error) {
      console.error(error)
      alert('Gagal reject user')
      setSavingId(null)
      return
    }

    setPendingUsers((prev) => prev.filter((user) => user.id !== userId))
    setSavingId(null)
  }

  if (loading) {
    return <div className="p-6">Loading school admin dashboard...</div>
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-2">School Admin Dashboard</h1>
      <p className="mb-6 text-sm text-gray-600">
        Urus pengguna pending untuk sekolah anda
      </p>

      <div className="bg-white rounded-xl shadow p-4 overflow-x-auto">
        <h2 className="text-lg font-semibold mb-4">Senarai Pengguna Pending</h2>

        {pendingUsers.length === 0 ? (
          <p>Tiada pengguna pending untuk sekolah ini.</p>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b text-left">
                <th className="py-3 px-2">Nama</th>
                <th className="py-3 px-2">Email</th>
                <th className="py-3 px-2">Role</th>
                <th className="py-3 px-2">Tindakan</th>
              </tr>
            </thead>
            <tbody>
              {pendingUsers.map((user) => (
                <tr key={user.id} className="border-b">
                  <td className="py-3 px-2">{user.full_name || '-'}</td>
                  <td className="py-3 px-2">{user.email}</td>
                  <td className="py-3 px-2">{user.role || '-'}</td>
                  <td className="py-3 px-2">
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleApprove(user.id)}
                        disabled={savingId === user.id}
                        className="bg-green-600 text-white px-3 py-2 rounded"
                      >
                        {savingId === user.id ? 'Saving...' : 'Approve'}
                      </button>

                      <button
                        onClick={() => handleReject(user.id)}
                        disabled={savingId === user.id}
                        className="bg-red-600 text-white px-3 py-2 rounded"
                      >
                        Reject
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}