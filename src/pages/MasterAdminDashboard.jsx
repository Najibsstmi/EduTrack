import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

export default function MasterAdminDashboard() {
  const [pendingUsers, setPendingUsers] = useState([])
  const [schools, setSchools] = useState([])
  const [selectedSchools, setSelectedSchools] = useState({})
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState(null)

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setLoading(true)

    const { data: usersData, error: usersError } = await supabase
      .from('profiles')
      .select('id, full_name, email, role, approval_status, created_at')
      .eq('approval_status', 'pending')
      .order('created_at', { ascending: false })

    const { data: schoolsData, error: schoolsError } = await supabase
      .from('schools')
      .select('id, school_name, school_code')
      .order('school_name', { ascending: true })

    if (usersError) {
      console.error(usersError)
      alert('Gagal ambil senarai pending user')
    }

    if (schoolsError) {
      console.error(schoolsError)
      alert('Gagal ambil senarai sekolah')
    }

    setPendingUsers(usersData || [])
    setSchools(schoolsData || [])
    setLoading(false)
  }

  const handleSchoolChange = (userId, schoolId) => {
    setSelectedSchools((prev) => ({
      ...prev,
      [userId]: schoolId,
    }))
  }

  const handleApprove = async (userId) => {
    const schoolId = selectedSchools[userId]

    if (!schoolId) {
      alert('Sila pilih sekolah dahulu')
      return
    }

    setSavingId(userId)

    const { error } = await supabase
      .from('profiles')
      .update({
        approval_status: 'approved',
        school_id: schoolId,
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
    return <div className="p-6">Loading master admin dashboard...</div>
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Master Admin Dashboard</h1>

      <div className="bg-white rounded-xl shadow p-4 overflow-x-auto">
        <h2 className="text-lg font-semibold mb-4">Senarai Pengguna Pending</h2>

        {pendingUsers.length === 0 ? (
          <p>Tiada pengguna pending buat masa ini.</p>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b text-left">
                <th className="py-3 px-2">Nama</th>
                <th className="py-3 px-2">Email</th>
                <th className="py-3 px-2">Role</th>
                <th className="py-3 px-2">Sekolah</th>
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
                    <select
                      className="border rounded px-3 py-2"
                      value={selectedSchools[user.id] || ''}
                      onChange={(e) => handleSchoolChange(user.id, e.target.value)}
                    >
                      <option value="">Pilih sekolah</option>
                      {schools.map((school) => (
                        <option key={school.id} value={school.id}>
                          {school.school_name}
                        </option>
                      ))}
                    </select>
                  </td>
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