import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'

function SignupPage() {
  const [fullName, setFullName] = useState('')
  const [designation, setDesignation] = useState('')
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

    try {
      const trimmedFullName = fullName.trim()
      const trimmedDesignation = designation.trim()
      const normalizedEmail = String(email || '').trim().toLowerCase()

      if (!trimmedFullName || !trimmedDesignation || !normalizedEmail || !password || !schoolId) {
        alert('Sila lengkapkan semua maklumat termasuk sekolah dan designation.')
        setLoading(false)
        return
      }

      const { data: authData, error: signUpError } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
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

      const user = authData.user

      const { data: existingProfile, error: existingProfileError } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', user.id)
        .maybeSingle()

      if (existingProfileError) {
        alert(existingProfileError.message)
        setLoading(false)
        return
      }

      let profileError = null

      if (existingProfile?.id) {
        const { error } = await supabase
          .from('profiles')
          .update({
            full_name: trimmedFullName,
            designation: trimmedDesignation,
            email: normalizedEmail,
            school_id: schoolId,
            role: 'teacher',
            is_school_admin: false,
            approval_status: 'pending',
            is_active: true,
            updated_at: new Date().toISOString(),
          })
          .eq('id', user.id)

        profileError = error
      } else {
        const { error } = await supabase
          .from('profiles')
          .insert({
            id: user.id,
            full_name: trimmedFullName,
            designation: trimmedDesignation,
            email: normalizedEmail,
            school_id: schoolId,
            role: 'teacher',
            is_school_admin: false,
            approval_status: 'pending',
            is_active: true,
          })

        profileError = error
      }

      if (profileError) {
        alert(profileError.message)
        setLoading(false)
        return
      }

      alert('Pendaftaran berjaya. Akaun anda sedang menunggu kelulusan admin sekolah.')
      navigate('/pending')
    } catch (error) {
      console.error('Signup error:', error)
      alert(error?.message || 'Pendaftaran gagal. Sila cuba lagi.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center px-4 py-6">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-5 flex flex-col items-center text-center">
          <img
            src="/edutrack-logo.png"
            alt="EduTrack"
            className="h-auto w-[120px] object-contain"
          />
          <div className="mt-3 text-[13px] text-slate-500">
            Sistem Pemantauan Akademik Sekolah
          </div>
        </div>

        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          EDUTRACK
        </p>

        <h1 className="mt-2 text-3xl font-bold text-slate-900">
          Daftar Guru
        </h1>

        <p className="mt-2 text-sm text-slate-600">
          Daftar akaun untuk akses dashboard sekolah anda.
        </p>

        <form onSubmit={handleSignup} className="mt-8 space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">
              Nama
            </label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-slate-500"
              placeholder="Masukkan nama penuh"
              required
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-slate-500"
              placeholder="nama@sekolah.edu.my"
              required
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">
              Designation / Jawatan
            </label>
            <input
              type="text"
              value={designation}
              onChange={(e) => setDesignation(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-slate-500"
              placeholder="Contoh: Guru, Ketua Panitia, GKMP"
              required
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">
              Kata laluan
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-slate-500"
              placeholder="Masukkan kata laluan"
              required
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">
              Jenis sekolah
            </label>
            <select
              value={schoolType}
              onChange={(e) => handleTypeChange(e.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-slate-500"
              required
            >
              <option value="">Pilih jenis sekolah</option>
              {schoolTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">
              Negeri
            </label>
            <select
              value={state}
              onChange={(e) => handleStateChange(e.target.value)}
              disabled={!schoolType}
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-slate-500 disabled:cursor-not-allowed disabled:bg-slate-100"
              required
            >
              <option value="">Pilih negeri</option>
              {states.map((stateName) => (
                <option key={stateName} value={stateName}>
                  {stateName}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">
              PPD / Daerah
            </label>
            <select
              value={district}
              onChange={(e) => handleDistrictChange(e.target.value)}
              disabled={!state}
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-slate-500 disabled:cursor-not-allowed disabled:bg-slate-100"
              required
            >
              <option value="">Pilih PPD / daerah</option>
              {districts.map((districtName) => (
                <option key={districtName} value={districtName}>
                  {districtName}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">
              Nama sekolah
            </label>
            <select
              value={schoolId}
              onChange={(e) => setSchoolId(e.target.value)}
              disabled={!district}
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-slate-500 disabled:cursor-not-allowed disabled:bg-slate-100"
              required
            >
              <option value="">Pilih nama sekolah</option>
              {schools.map((school) => (
                <option key={school.id} value={school.id}>
                  {school.school_name} ({school.school_code})
                </option>
              ))}
            </select>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
          >
            {loading ? 'Loading...' : 'Daftar'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-600">
          Sudah ada akaun?{' '}
          <Link to="/login" className="font-medium text-slate-900 hover:underline">
            Login di sini
          </Link>
        </p>
      </div>
    </div>
  )
}

export default SignupPage