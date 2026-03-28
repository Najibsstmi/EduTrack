import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'

export default function MasterAdminDashboard() {
  const navigate = useNavigate()

  const [pendingUsers, setPendingUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState(null)

  const [schoolTypes, setSchoolTypes] = useState([])

  const [selectedType, setSelectedType] = useState({})
  const [selectedState, setSelectedState] = useState({})
  const [selectedDistrict, setSelectedDistrict] = useState({})
  const [selectedSchool, setSelectedSchool] = useState({})

  const [statesByUser, setStatesByUser] = useState({})
  const [districtsByUser, setDistrictsByUser] = useState({})
  const [schoolsByUser, setSchoolsByUser] = useState({})

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
      .select('id, is_master_admin, approval_status')
      .eq('id', user.id)
      .maybeSingle()

    if (profileError || !profile) {
      navigate('/login', { replace: true })
      return
    }

    if (!profile.is_master_admin) {
      if (profile.approval_status === 'pending') {
        navigate('/pending', { replace: true })
      } else if (profile.approval_status === 'approved') {
        navigate('/dashboard', { replace: true })
      } else {
        navigate('/login', { replace: true })
      }
      return
    }

    await Promise.all([fetchPendingUsers(), fetchSchoolTypes()])
    setLoading(false)
  }

  const uniqueSorted = (arr) =>
    [...new Set((arr || []).map((v) => (typeof v === 'string' ? v.trim() : v)).filter(Boolean))]
      .sort((a, b) => String(a).localeCompare(String(b)))

  const fetchPendingUsers = async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, email, role, approval_status, created_at')
      .eq('approval_status', 'pending')
      .order('created_at', { ascending: false })

    if (error) {
      console.error(error)
      alert('Gagal ambil senarai pending user')
      return
    }

    setPendingUsers(data || [])
  }

  const fetchSchoolTypes = async () => {
    const { data, error } = await supabase
      .from('schools')
      .select('school_type')
      .eq('is_active', true)
      .range(0, 20000)

    if (error) {
      console.error(error)
      alert('Gagal ambil jenis sekolah')
      return
    }

    setSchoolTypes(uniqueSorted(data.map((item) => item.school_type)))
  }

  const fetchStates = async (userId, schoolType) => {
    const { data, error } = await supabase
      .from('schools')
      .select('state')
      .eq('is_active', true)
      .eq('school_type', schoolType)
      .range(0, 20000)

    if (error) {
      console.error(error)
      alert('Gagal ambil negeri')
      return
    }

    setStatesByUser((prev) => ({
      ...prev,
      [userId]: uniqueSorted(data.map((item) => item.state)),
    }))
  }

  const fetchDistricts = async (userId, schoolType, state) => {
    const { data, error } = await supabase
      .from('schools')
      .select('district')
      .eq('is_active', true)
      .eq('school_type', schoolType)
      .eq('state', state)
      .range(0, 20000)

    if (error) {
      console.error(error)
      alert('Gagal ambil PPD / daerah')
      return
    }

    setDistrictsByUser((prev) => ({
      ...prev,
      [userId]: uniqueSorted(data.map((item) => item.district)),
    }))
  }

  const fetchSchools = async (userId, schoolType, state, district) => {
    const { data, error } = await supabase
      .from('schools')
      .select('id, school_name, school_code')
      .eq('is_active', true)
      .eq('school_type', schoolType)
      .eq('state', state)
      .eq('district', district)
      .order('school_name', { ascending: true })
      .range(0, 5000)

    if (error) {
      console.error(error)
      alert('Gagal ambil nama sekolah')
      return
    }

    setSchoolsByUser((prev) => ({
      ...prev,
      [userId]: data || [],
    }))
  }

  const handleTypeChange = async (userId, value) => {
    setSelectedType((prev) => ({ ...prev, [userId]: value }))
    setSelectedState((prev) => ({ ...prev, [userId]: '' }))
    setSelectedDistrict((prev) => ({ ...prev, [userId]: '' }))
    setSelectedSchool((prev) => ({ ...prev, [userId]: '' }))

    setStatesByUser((prev) => ({ ...prev, [userId]: [] }))
    setDistrictsByUser((prev) => ({ ...prev, [userId]: [] }))
    setSchoolsByUser((prev) => ({ ...prev, [userId]: [] }))

    if (value) {
      await fetchStates(userId, value)
    }
  }

  const handleStateChange = async (userId, value) => {
    setSelectedState((prev) => ({ ...prev, [userId]: value }))
    setSelectedDistrict((prev) => ({ ...prev, [userId]: '' }))
    setSelectedSchool((prev) => ({ ...prev, [userId]: '' }))

    setDistrictsByUser((prev) => ({ ...prev, [userId]: [] }))
    setSchoolsByUser((prev) => ({ ...prev, [userId]: [] }))

    if (value) {
      await fetchDistricts(userId, selectedType[userId], value)
    }
  }

  const handleDistrictChange = async (userId, value) => {
    setSelectedDistrict((prev) => ({ ...prev, [userId]: value }))
    setSelectedSchool((prev) => ({ ...prev, [userId]: '' }))

    setSchoolsByUser((prev) => ({ ...prev, [userId]: [] }))

    if (value) {
      await fetchSchools(userId, selectedType[userId], selectedState[userId], value)
    }
  }

  const handleSchoolChange = (userId, value) => {
    setSelectedSchool((prev) => ({ ...prev, [userId]: value }))
  }

  const handleApprove = async (userId) => {
    const schoolId = selectedSchool[userId]

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
                <th className="py-3 px-2">Penetapan Sekolah</th>
                <th className="py-3 px-2">Tindakan</th>
              </tr>
            </thead>
            <tbody>
              {pendingUsers.map((user) => (
                <tr key={user.id} className="border-b align-top">
                  <td className="py-3 px-2">{user.full_name || '-'}</td>
                  <td className="py-3 px-2">{user.email}</td>
                  <td className="py-3 px-2">{user.role || '-'}</td>

                  <td className="py-3 px-2 min-w-[430px]">
                    <div className="grid gap-2">
                      <select
                        className="border rounded px-3 py-2"
                        value={selectedType[user.id] || ''}
                        onChange={(e) => handleTypeChange(user.id, e.target.value)}
                      >
                        <option value="">Pilih jenis sekolah</option>
                        {schoolTypes.map((type) => (
                          <option key={type} value={type}>
                            {type}
                          </option>
                        ))}
                      </select>

                      <select
                        className="border rounded px-3 py-2"
                        value={selectedState[user.id] || ''}
                        onChange={(e) => handleStateChange(user.id, e.target.value)}
                        disabled={!selectedType[user.id]}
                      >
                        <option value="">Pilih negeri</option>
                        {(statesByUser[user.id] || []).map((state) => (
                          <option key={state} value={state}>
                            {state}
                          </option>
                        ))}
                      </select>

                      <select
                        className="border rounded px-3 py-2"
                        value={selectedDistrict[user.id] || ''}
                        onChange={(e) => handleDistrictChange(user.id, e.target.value)}
                        disabled={!selectedState[user.id]}
                      >
                        <option value="">Pilih PPD / daerah</option>
                        {(districtsByUser[user.id] || []).map((district) => (
                          <option key={district} value={district}>
                            {district}
                          </option>
                        ))}
                      </select>

                      <select
                        className="border rounded px-3 py-2"
                        value={selectedSchool[user.id] || ''}
                        onChange={(e) => handleSchoolChange(user.id, e.target.value)}
                        disabled={!selectedDistrict[user.id]}
                      >
                        <option value="">Pilih nama sekolah</option>
                        {(schoolsByUser[user.id] || []).map((school) => (
                          <option key={school.id} value={school.id}>
                            {school.school_name} ({school.school_code})
                          </option>
                        ))}
                      </select>
                    </div>
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
