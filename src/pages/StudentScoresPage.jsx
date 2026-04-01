import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'

const REQUIRED_HEADERS = [
  'nama_murid',
  'no_ic',
  'subjek',
  'jenis_peperiksaan',
  'markah',
]

const normalizeText = (value) =>
  String(value || '').trim()

const normalizeKey = (value) =>
  String(value || '').trim().toLowerCase()

const normalizeExamKey = (value) =>
  String(value || '').trim().toUpperCase()

const isAllowedExamKey = (value) => {
  const key = normalizeExamKey(value)

  if (key === 'TOV' || key === 'ETR') return true
  if (/^AR\d+$/.test(key)) return true

  return false
}

const parseCsvLine = (line) => {
  const result = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    const next = line[i + 1]

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current)
      current = ''
    } else {
      current += char
    }
  }

  result.push(current)
  return result.map((item) => item.trim())
}

const parseCsvText = (text) => {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  if (!lines.length) {
    return { headers: [], rows: [] }
  }

  const headers = parseCsvLine(lines[0]).map((h) => normalizeKey(h))

  const rows = lines.slice(1).map((line, index) => {
    const values = parseCsvLine(line)
    const row = {}

    headers.forEach((header, i) => {
      row[header] = values[i] ?? ''
    })

    return {
      __rowNumber: index + 2,
      ...row,
    }
  })

  return { headers, rows }
}

const validateCsvData = (headers, rows) => {
  const errors = []

  const missingHeaders = REQUIRED_HEADERS.filter(
    (header) => !headers.includes(header)
  )

  if (missingHeaders.length > 0) {
    errors.push(
      `Header wajib tiada: ${missingHeaders.join(', ')}`
    )
  }

  rows.forEach((row) => {
    const nama = normalizeText(row.nama_murid)
    const ic = normalizeText(row.no_ic)
    const subjek = normalizeText(row.subjek)
    const examKey = normalizeExamKey(row.jenis_peperiksaan)
    const markahRaw = normalizeText(row.markah)

    if (!nama) {
      errors.push(`Baris ${row.__rowNumber}: nama_murid kosong`)
    }

    if (!ic) {
      errors.push(`Baris ${row.__rowNumber}: no_ic kosong`)
    }

    if (!subjek) {
      errors.push(`Baris ${row.__rowNumber}: subjek kosong`)
    }

    if (!examKey) {
      errors.push(`Baris ${row.__rowNumber}: jenis_peperiksaan kosong`)
    } else if (!isAllowedExamKey(examKey)) {
      errors.push(
        `Baris ${row.__rowNumber}: jenis_peperiksaan '${examKey}' tidak sah. Guna TOV, ETR, AR1, AR2, AR3 dan seterusnya.`
      )
    }

    if (markahRaw === '') {
      errors.push(`Baris ${row.__rowNumber}: markah kosong`)
    } else {
      const markah = Number(markahRaw)

      if (Number.isNaN(markah)) {
        errors.push(`Baris ${row.__rowNumber}: markah bukan nombor`)
      } else if (markah < 0 || markah > 100) {
        errors.push(`Baris ${row.__rowNumber}: markah mesti antara 0 hingga 100`)
      }
    }
  })

  return errors
}

export default function StudentScoresPage() {
  const navigate = useNavigate()

  const [profile, setProfile] = useState(null)
  const [setupConfig, setSetupConfig] = useState(null)

  const [classes, setClasses] = useState([])
  const [subjects, setSubjects] = useState([])

  const [selectedClass, setSelectedClass] = useState('')
  const [selectedSubject, setSelectedSubject] = useState('')
  const [selectedExam, setSelectedExam] = useState('')

  const [students, setStudents] = useState([])
  const [scores, setScores] = useState({})
  const [saving, setSaving] = useState(false)

  const [csvRows, setCsvRows] = useState([])
  const [csvErrors, setCsvErrors] = useState([])
  const [csvFileName, setCsvFileName] = useState('')

  useEffect(() => {
    init()
  }, [])

  const getGradeLabelFromClassName = (className = '') => {
    const text = className.toLowerCase()

    if (text.includes('tingkatan 1')) return 'Tingkatan 1'
    if (text.includes('tingkatan 2')) return 'Tingkatan 2'
    if (text.includes('tingkatan 3')) return 'Tingkatan 3'
    if (text.includes('tingkatan 4')) return 'Tingkatan 4'
    if (text.includes('tingkatan 5')) return 'Tingkatan 5'

    return ''
  }

  const selectedClassName = useMemo(() => {
    const selectedClassData = classes.find((c) => c.id === selectedClass)
    if (!selectedClassData) return ''
    return `${selectedClassData.tingkatan || ''} ${selectedClassData.class_name || ''}`.trim()
  }, [classes, selectedClass])

  const selectedGradeLabel = useMemo(() => {
    return getGradeLabelFromClassName(selectedClassName)
  }, [selectedClassName])

  const uniqueExamOptions = useMemo(() => {
    const examsForSelectedGrade = setupConfig?.exam_structure?.[selectedGradeLabel] || []

    return examsForSelectedGrade.filter(
      (exam, index, arr) => index === arr.findIndex((item) => item.key === exam.key)
    )
  }, [setupConfig, selectedGradeLabel])

  const sortedStudents = useMemo(() => {
    const genderRank = (gender) => {
      if (gender === 'LELAKI') return 1
      if (gender === 'PEREMPUAN') return 2
      return 3
    }

    return [...students].sort((a, b) => {
      const genderA = (a.gender || '').toUpperCase()
      const genderB = (b.gender || '').toUpperCase()

      const genderCompare = genderRank(genderA) - genderRank(genderB)
      if (genderCompare !== 0) return genderCompare

      return (a.full_name || '').localeCompare(b.full_name || '', 'ms', {
        sensitivity: 'base',
      })
    })
  }, [students])

  const uniqueSubjects = useMemo(() => {
    const normalizedSelectedGrade = selectedGradeLabel.trim().toLowerCase()

    const filteredSubjects = normalizedSelectedGrade
      ? subjects.filter(
          (subject) =>
            (subject.tingkatan || '').trim().toLowerCase() === normalizedSelectedGrade
        )
      : subjects

    return filteredSubjects.filter(
      (subject, index, arr) =>
        index ===
        arr.findIndex(
          (item) =>
            (item.subject_name || '').trim().toLowerCase() ===
            (subject.subject_name || '').trim().toLowerCase()
        )
    )
  }, [subjects, selectedGradeLabel])

  useEffect(() => {
    if (!selectedSubject) return

    const subjectStillValid = uniqueSubjects.some(
      (subject) => String(subject.id) === String(selectedSubject)
    )

    if (!subjectStillValid) {
      setSelectedSubject('')
    }
  }, [uniqueSubjects, selectedSubject])

  const init = async () => {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      navigate('/login', { replace: true })
      return
    }

    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('id, school_id')
      .eq('id', user.id)
      .single()

    if (profileError || !profileData) {
      navigate('/login', { replace: true })
      return
    }

    setProfile(profileData)

    const { data: setupData } = await supabase
      .from('school_setup_configs')
      .select('current_academic_year, exam_structure')
      .eq('school_id', profileData.school_id)
      .maybeSingle()

    setSetupConfig(setupData || null)

    await loadInitialData(profileData, setupData)
  }

  const loadInitialData = async (profileData, setupData) => {
    let classQuery = supabase
      .from('classes')
      .select('id, class_name, tingkatan')
      .eq('school_id', profileData.school_id)
      .eq('is_active', true)
      .order('tingkatan', { ascending: true })
      .order('class_name', { ascending: true })

    if (setupData?.current_academic_year) {
      classQuery = classQuery.eq('academic_year', setupData.current_academic_year)
    }

    const { data: classData } = await classQuery
    setClasses(classData || [])

    const { data: subjectData } = await supabase
      .from('subjects')
      .select('id, subject_name, subject_code, tingkatan')
      .eq('school_id', profileData.school_id)
      .order('subject_name', { ascending: true })

    setSubjects(subjectData || [])
  }

  const loadStudentsAndScores = async () => {
    if (!selectedClass || !selectedSubject || !selectedExam || !profile?.school_id) return

    let enrollmentQuery = supabase
      .from('student_enrollments')
      .select(`
        id,
        student_profile_id,
        class_id,
        academic_year,
        is_active,
        student_profiles (
          id,
          full_name,
          ic_number,
          gender
        )
      `)
      .eq('school_id', profile.school_id)
      .eq('class_id', selectedClass)
      .eq('is_active', true)
      .order('id', { ascending: true })

    if (setupConfig?.current_academic_year) {
      enrollmentQuery = enrollmentQuery.eq('academic_year', setupConfig.current_academic_year)
    }

    const { data: enrollmentData } = await enrollmentQuery

    const studentRows = (enrollmentData || []).map((row) => ({
      student_id: row.student_profile_id,
      full_name: row.student_profiles?.full_name || '-',
      ic_number: row.student_profiles?.ic_number || '-',
      gender: row.student_profiles?.gender || '',
    }))

    setStudents(studentRows)

    let scoreQuery = supabase
      .from('student_scores')
      .select('*')
      .eq('class_id', selectedClass)
      .eq('subject_id', selectedSubject)
      .eq('exam_key', selectedExam)
      .eq('school_id', profile.school_id)

    if (setupConfig?.current_academic_year) {
      scoreQuery = scoreQuery.eq('academic_year', setupConfig.current_academic_year)
    }

    const { data: scoreData } = await scoreQuery

    const scoreMap = {}
    scoreData?.forEach((s) => {
      const scoreStudentId = s.student_profile_id || s.student_id
      if (scoreStudentId) scoreMap[scoreStudentId] = s
    })

    setScores(scoreMap)
  }

  useEffect(() => {
    loadStudentsAndScores()
  }, [selectedClass, selectedSubject, selectedExam, profile?.school_id])

  const handleScoreChange = (studentId, value) => {
    setScores((prev) => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        mark: value,
      },
    }))
  }

  const downloadTemplateCSV = () => {
    const sample = [
      'nama_murid,no_ic,subjek,jenis_peperiksaan,markah',
      'ALI BIN ABU,090123101234,Sains,TOV,45',
      'ALI BIN ABU,090123101234,Sains,ETR,70',
      'ALI BIN ABU,090123101234,Sains,AR1,58',
      'SITI AISYAH,100201101111,Bahasa Melayu,TOV,60',
      'SITI AISYAH,100201101111,Bahasa Melayu,ETR,80',
      'SITI AISYAH,100201101111,Bahasa Melayu,AR1,72',
    ].join('\n')

    const blob = new Blob([sample], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)

    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', 'template_import_markah_edutrack.csv')
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)

    URL.revokeObjectURL(url)
  }

  const handleCsvUpload = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    setCsvFileName(file.name)

    const text = await file.text()
    const { headers, rows } = parseCsvText(text)
    const errors = validateCsvData(headers, rows)

    setCsvRows(rows)
    setCsvErrors(errors)
  }

  const handleSave = async () => {
    if (!profile?.school_id) return

    setSaving(true)

    const payload = students.map((student) => ({
      student_profile_id: student.student_id,
      class_id: selectedClass,
      subject_id: selectedSubject,
      exam_key: selectedExam,
      mark: scores[student.student_id]?.mark === '' ? null : Number(scores[student.student_id]?.mark),
      school_id: profile.school_id,
      academic_year: setupConfig?.current_academic_year || null,
    }))

    const { error } = await supabase
      .from('student_scores')
      .upsert(payload, {
        onConflict: 'student_profile_id,subject_id,exam_key',
      })

    setSaving(false)

    if (error) {
      alert('Error simpan markah')
      console.error(error)
      return
    }

    alert('Markah berjaya disimpan')
  }

  return (
    <div className="min-h-screen bg-slate-100 p-4 md:p-6">
      <div className="mx-auto max-w-7xl">
        <div className="mb-4 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">EduTrack</p>
              <h1 className="text-2xl font-bold text-slate-900">Input Markah Murid</h1>
            </div>
            <button
              type="button"
              onClick={() => navigate('/dashboard')}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              Kembali Dashboard
            </button>
          </div>
        </div>

        <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-slate-900">Penapis Data Markah</h2>
          <div className="grid gap-3 md:grid-cols-3">
            <select
              value={selectedClass}
              onChange={(e) => setSelectedClass(e.target.value)}
              className="rounded-xl border border-slate-300 px-3 py-3 text-sm outline-none focus:border-slate-500"
            >
              <option value="">Pilih Kelas</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>{`${c.tingkatan || ''} ${c.class_name}`.trim()}</option>
              ))}
            </select>

            <select
              value={selectedSubject}
              onChange={(e) => setSelectedSubject(e.target.value)}
              className="rounded-xl border border-slate-300 px-3 py-3 text-sm outline-none focus:border-slate-500"
            >
              <option value="">Pilih Subjek</option>
              {uniqueSubjects.map((subject) => (
                <option key={subject.id || subject.subject_name} value={subject.id}>
                  {subject.subject_name}
                </option>
              ))}
            </select>

            <select
              value={selectedExam}
              onChange={(e) => setSelectedExam(e.target.value)}
              className="rounded-xl border border-slate-300 px-3 py-3 text-sm outline-none focus:border-slate-500"
            >
              <option value="">Pilih Peperiksaan</option>
              {uniqueExamOptions.map((exam) => (
                <option key={exam.key} value={exam.key}>
                  {exam.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Import Markah CSV</h2>
              <p className="mt-1 text-sm text-slate-500">
                Gunakan key sistem untuk jenis peperiksaan: TOV, ETR, AR1, AR2, AR3 dan seterusnya.
                OTR tidak perlu diisi kerana sistem akan jana automatik.
              </p>
            </div>

            <button
              type="button"
              onClick={downloadTemplateCSV}
              className="rounded-xl border border-slate-300 px-4 py-2 font-medium text-slate-700 hover:bg-slate-100"
            >
              Download Template CSV
            </button>
          </div>

          <div className="mt-5">
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Upload Fail CSV
            </label>

            <input
              type="file"
              accept=".csv"
              onChange={handleCsvUpload}
              className="block w-full rounded-xl border border-slate-300 px-3 py-2"
            />

            {csvFileName && (
              <p className="mt-2 text-sm text-slate-500">
                Fail dipilih: <strong>{csvFileName}</strong>
              </p>
            )}
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <div className="rounded-xl bg-slate-50 p-4">
              <div className="text-sm text-slate-500">Jumlah Row CSV</div>
              <div className="mt-1 text-2xl font-bold text-slate-900">{csvRows.length}</div>
            </div>

            <div className="rounded-xl bg-slate-50 p-4">
              <div className="text-sm text-slate-500">Row Valid</div>
              <div className="mt-1 text-2xl font-bold text-emerald-600">
                {csvErrors.length === 0 ? csvRows.length : 0}
              </div>
            </div>

            <div className="rounded-xl bg-slate-50 p-4">
              <div className="text-sm text-slate-500">Jumlah Error</div>
              <div className="mt-1 text-2xl font-bold text-red-600">{csvErrors.length}</div>
            </div>
          </div>

          {csvErrors.length > 0 && (
            <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4">
              <h3 className="text-sm font-semibold text-red-700">Ralat CSV</h3>
              <ul className="mt-2 list-disc pl-5 text-sm text-red-700 space-y-1">
                {csvErrors.map((error, index) => (
                  <li key={index}>{error}</li>
                ))}
              </ul>
            </div>
          )}

          {csvRows.length > 0 && (
            <div className="mt-6">
              <h3 className="mb-3 text-sm font-semibold text-slate-700">Preview CSV</h3>

              <div className="overflow-x-auto">
                <table className="min-w-full border-collapse">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="border-b border-slate-200 px-4 py-3 text-left text-sm font-semibold text-slate-700">
                        Bil
                      </th>
                      <th className="border-b border-slate-200 px-4 py-3 text-left text-sm font-semibold text-slate-700">
                        Nama Murid
                      </th>
                      <th className="border-b border-slate-200 px-4 py-3 text-left text-sm font-semibold text-slate-700">
                        No IC
                      </th>
                      <th className="border-b border-slate-200 px-4 py-3 text-left text-sm font-semibold text-slate-700">
                        Subjek
                      </th>
                      <th className="border-b border-slate-200 px-4 py-3 text-left text-sm font-semibold text-slate-700">
                        Jenis Peperiksaan
                      </th>
                      <th className="border-b border-slate-200 px-4 py-3 text-left text-sm font-semibold text-slate-700">
                        Markah
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {csvRows.slice(0, 15).map((row, index) => (
                      <tr key={index} className="border-b border-slate-100">
                        <td className="px-4 py-3 text-sm">{index + 1}</td>
                        <td className="px-4 py-3 text-sm">{row.nama_murid}</td>
                        <td className="px-4 py-3 text-sm">{row.no_ic}</td>
                        <td className="px-4 py-3 text-sm">{row.subjek}</td>
                        <td className="px-4 py-3 text-sm">{row.jenis_peperiksaan}</td>
                        <td className="px-4 py-3 text-sm">{row.markah}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {csvRows.length > 15 && (
                <p className="mt-2 text-sm text-slate-500">
                  Preview memaparkan 15 row pertama sahaja.
                </p>
              )}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">Senarai Murid & Markah</h2>
            <span className="text-sm text-slate-500">Jumlah murid: {students.length}</span>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="border-b bg-slate-50 text-left text-slate-700">
                  <th className="px-3 py-3 font-semibold">Bil</th>
                  <th className="px-3 py-3 font-semibold">Nama</th>
                  <th className="px-3 py-3 font-semibold">No IC</th>
                  <th className="px-3 py-3 font-semibold">Markah</th>
                </tr>
              </thead>

              <tbody>
                {sortedStudents.map((student, index) => (
                  <tr key={student.student_id} className="border-b">
                    <td className="px-3 py-3 text-slate-700">{index + 1}</td>
                    <td className="px-3 py-3 text-slate-900">{student.full_name}</td>
                    <td className="px-3 py-3 text-slate-700">{student.ic_number}</td>

                    <td className="px-3 py-3">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={scores[student.student_id]?.mark ?? ''}
                        onChange={(e) => handleScoreChange(student.student_id, e.target.value)}
                        className="w-28 rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button
            onClick={handleSave}
            disabled={saving || !selectedClass || !selectedSubject || !selectedExam}
            className="mt-5 rounded-xl bg-green-600 px-5 py-3 font-semibold text-white hover:bg-green-700 disabled:opacity-60"
          >
            {saving ? 'Menyimpan...' : 'Simpan Markah'}
          </button>
        </div>
      </div>
    </div>
  )
}
