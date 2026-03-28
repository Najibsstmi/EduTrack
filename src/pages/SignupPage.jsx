import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'

function SignupPage() {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [schoolType, setSchoolType] = useState('')
  const [state, setState] = useState('')
  const [district, setDistrict] = useState('')
  const [schoolId, setSchoolId] = useState('')

  const [schoolTypes, setSchoolTypes] = useState([])
  const [states, setStates] = useState([])
  const [districts, setDistricts] = useState([])
  const [schools, setSchools] = useState([])
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    fetchSchoolTypes()
  }, [])

  const uniqueSorted = (arr) =>
    [...new Set((arr || []).map((v) => (typeof v === 'string' ? v.trim() : v)).filter(Boolean))]
      .sort((a, b) => String(a).localeCompare(String(b)))

  const fetchSchoolTypes = async () => {
    const { data, error } = await supabase
      .from('schools')
      .select('school_type')
      .eq('is_active', true)
      .range(0, 20000)

    if (error) {
      alert('Gagal ambil jenis sekolah')
      return
    }

    setSchoolTypes(uniqueSorted((data || []).map((item) => item.school_type)))
  }

  const fetchStates = async (selectedType) => {
    const { data, error } = await supabase
      .from('schools')
      .select('state')
      .eq('is_active', true)
      .eq('school_type', selectedType)
      .range(0, 20000)

    if (error) {
      alert('Gagal ambil negeri')
      return
    }

    setStates(uniqueSorted((data || []).map((item) => item.state)))
  }

  const fetchDistricts = async (selectedType, selectedState) => {
    const { data, error } = await supabase
      .from('schools')
      .select('district')
      .eq('is_active', true)
      .eq('school_type', selectedType)
      .eq('state', selectedState)
      .range(0, 20000)

    if (error) {
      alert('Gagal ambil PPD / daerah')
      return
    }

    setDistricts(uniqueSorted((data || []).map((item) => item.district)))
  }

  const fetchSchools = async (selectedType, selectedState, selectedDistrict) => {
    const { data, error } = await supabase
      .from('schools')
      .select('id, school_name, school_code')
      .eq('is_active', true)
      .eq('school_type', selectedType)
      .eq('state', selectedState)
      .eq('district', selectedDistrict)
      .order('school_name', { ascending: true })
      .range(0, 5000)

    if (error) {
      alert('Gagal ambil nama sekolah')
      return
    }

    setSchools(data || [])
  }

  const handleTypeChange = async (value) => {
    setSchoolType(value)
    setState('')
    setDistrict('')
    setSchoolId('')
    setStates([])
    setDistricts([])
    setSchools([])

    if (value) {
      await fetchStates(value)
    }
  }

  const handleStateChange = async (value) => {
    setState(value)
    setDistrict('')
    setSchoolId('')
    setDistricts([])
    setSchools([])

    if (value) {
      await fetchDistricts(schoolType, value)
    }
  }

  const handleDistrictChange = async (value) => {
    setDistrict(value)
    setSchoolId('')
    setSchools([])

    if (value) {
      await fetchSchools(schoolType, state, value)
    }
  }

  const handleSignup = async (e) => {
    e.preventDefault()
    setLoading(true)

    if (!fullName || !email || !password || !schoolId) {
      alert('Sila lengkapkan semua maklumat termasuk sekolah.')
      setLoading(false)
      return
    }

    const { data: authData, error: signUpError } = await supabase.auth.signUp({
      email,
      password
    })

    if (signUpError) {
      alert(signUpError.message)
      setLoading(false)
      return
    }

    if (!authData?.user?.id) {
      alert('Akaun berjaya didaftar, tetapi ID pengguna tidak ditemui.')
      setLoading(false)
      return
    }

    const userId = authData.user.id

    const { data: existingAdmin } = await supabase
      .from('profiles')
      .select('id')
      .eq('school_id', schoolId)
      .eq('is_school_admin', true)
      .maybeSingle()

    let isAdmin = false
    let status = 'pending'

    if (!existingAdmin) {
      isAdmin = true
      status = 'approved'
    }

    const { error: profileError } = await supabase
      .from('profiles')
      .insert({
        id: userId,
        full_name: fullName,
        email: email,
        school_id: schoolId,
        role: 'user',
        is_school_admin: isAdmin,
        approval_status: status,
      })

    if (profileError) {
      alert(profileError.message)
      setLoading(false)
      return
    }

    if (status === 'approved') {
      navigate('/dashboard')
    } else {
      navigate('/pending')
    }

    setLoading(false)
  }

  return (
    <div style={{ padding: '20px' }}>
      <h1>Daftar Guru</h1>

      <form onSubmit={handleSignup}>
        <input
          type="text"
          placeholder="Nama Penuh"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
        />
        <br /><br />

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

        <select
          value={schoolType}
          onChange={(e) => handleTypeChange(e.target.value)}
        >
          <option value="">Pilih jenis sekolah</option>
          {schoolTypes.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
        <br /><br />

        <select
          value={state}
          onChange={(e) => handleStateChange(e.target.value)}
          disabled={!schoolType}
        >
          <option value="">Pilih negeri</option>
          {states.map((stateName) => (
            <option key={stateName} value={stateName}>
              {stateName}
            </option>
          ))}
        </select>
        <br /><br />

        <select
          value={district}
          onChange={(e) => handleDistrictChange(e.target.value)}
          disabled={!state}
        >
          <option value="">Pilih PPD / daerah</option>
          {districts.map((districtName) => (
            <option key={districtName} value={districtName}>
              {districtName}
            </option>
          ))}
        </select>
        <br /><br />

        <select
          value={schoolId}
          onChange={(e) => setSchoolId(e.target.value)}
          disabled={!district}
        >
          <option value="">Pilih nama sekolah</option>
          {schools.map((school) => (
            <option key={school.id} value={school.id}>
              {school.school_name} ({school.school_code})
            </option>
          ))}
        </select>
        <br /><br />

        <button type="submit" disabled={loading}>
          {loading ? 'Loading...' : 'Daftar'}
        </button>
      </form>
    </div>
  )
}

export default SignupPage