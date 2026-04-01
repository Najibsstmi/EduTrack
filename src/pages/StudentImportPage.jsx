import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useNavigate } from 'react-router-dom'

const REQUIRED_HEADERS = ['ic_number', 'full_name', 'gender', 'tingkatan', 'class_name']

function normalizeSpaces(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
}

function normalizeTingkatan(rawValue) {
  const value = normalizeSpaces(rawValue).toLowerCase()

  if (!value) return ''

  // 1 / 2 / 3 / 4 / 5
  if (/^\d+$/.test(value)) {
    return `Tingkatan ${value}`
  }

  // t1, t2, t3...
  const tMatch = value.match(/^t\s*(\d+)$/i)
  if (tMatch) {
    return `Tingkatan ${tMatch[1]}`
  }

  // f1, f2, f3...
  const fMatch = value.match(/^f\s*(\d+)$/i)
  if (fMatch) {
    return `Tingkatan ${fMatch[1]}`
  }

  // form 1, form 2...
  const formMatch = value.match(/^form\s*(\d+)$/i)
  if (formMatch) {
    return `Tingkatan ${formMatch[1]}`
  }

  // ting 1, tingkatan 1
  const tingMatch = value.match(/^ting(?:katan)?\s*(\d+)$/i)
  if (tingMatch) {
    return `Tingkatan ${tingMatch[1]}`
  }

  return normalizeSpaces(rawValue)
}

function normalizeClassName(rawValue) {
  return normalizeSpaces(rawValue).toLowerCase()
}

function parseCsv(text) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  if (lines.length < 2) {
    return { headers: [], rows: [] }
  }

  const splitCsvLine = (line) => {
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
        result.push(current.trim())
        current = ''
      } else {
        current += char
      }
    }

    result.push(current.trim())
    return result.map((v) => v.replace(/^"|"$/g, '').trim())
  }

  const headers = splitCsvLine(lines[0])
  const rows = lines.slice(1).map(splitCsvLine)

  return { headers, rows }
}

function downloadTemplate() {
  const csv = [
    'ic_number,full_name,gender,tingkatan,class_name',
    '100101011234,Ahmad Firdaus bin Ali,Lelaki,Tingkatan 1,TANGO',
    '100101011235,Nur Ain Syafiqah binti Rahman,Perempuan,Tingkatan 1,BALADA',
  ].join('\n')

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.setAttribute('download', 'template_import_murid.csv')
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export default function StudentImportPage() {
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [importing, setImporting] = useState(false)

  const [profile, setProfile] = useState(null)
  const [school, setSchool] = useState(null)
  const [setupConfig, setSetupConfig] = useState(null)
  const [classes, setClasses] = useState([])

  const [fileName, setFileName] = useState('')
  const [parsedRows, setParsedRows] = useState([])
  const [previewRows, setPreviewRows] = useState([])
  const [errors, setErrors] = useState([])

  useEffect(() => {
    initPage()
  }, [])

  const initPage = async () => {
    setLoading(true)

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
      .select('*')
      .eq('id', user.id)
      .single()

    if (profileError || !profileData) {
      alert('Profil pengguna tidak ditemui.')
      navigate('/login', { replace: true })
      return
    }

    setProfile(profileData)

    const { data: schoolData, error: schoolError } = await supabase
      .from('schools')
      .select('id, school_name, school_code, level')
      .eq('id', profileData.school_id)
      .single()

    if (schoolError || !schoolData) {
      alert('Maklumat sekolah tidak ditemui.')
      navigate('/dashboard', { replace: true })
      return
    }

    setSchool(schoolData)

    const { data: configData, error: configError } = await supabase
      .from('school_setup_configs')
      .select('*')
      .eq('school_id', profileData.school_id)
      .single()

    if (configError || !configData) {
      alert('School setup config tidak ditemui.')
      navigate('/dashboard', { replace: true })
      return
    }

    setSetupConfig(configData)

    const { data: classData, error: classError } = await supabase
      .from('classes')
      .select('id, tingkatan, class_name')
      .eq('school_id', profileData.school_id)
      .eq('academic_year', configData.current_academic_year)
      .eq('is_active', true)
      .order('tingkatan', { ascending: true })
      .order('class_name', { ascending: true })

    if (classError) {
      alert(`Gagal load kelas: ${classError.message}`)
      navigate('/dashboard', { replace: true })
      return
    }

    setClasses(classData || [])
    setLoading(false)
  }

  const classMap = useMemo(() => {
    const map = new Map()

    for (const item of classes) {
      const normalizedTingkatan = normalizeTingkatan(item.tingkatan)
      const normalizedClass = normalizeClassName(item.class_name)

      map.set(`${normalizedTingkatan}|||${normalizedClass}`, item)
    }

    return map
  }, [classes])

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    setFileName(file.name)
    setErrors([])
    setParsedRows([])
    setPreviewRows([])

    const text = await file.text()
    const { headers, rows } = parseCsv(text)

    const missingHeaders = REQUIRED_HEADERS.filter((h) => !headers.includes(h))
    if (missingHeaders.length > 0) {
      setErrors([
        `Header wajib tiada: ${missingHeaders.join(', ')}. Sila guna template rasmi sistem.`,
      ])
      return
    }

    const headerIndex = Object.fromEntries(headers.map((h, i) => [h, i]))

    const preparedRows = rows.map((cells, idx) => {
      const rawTingkatan = cells[headerIndex.tingkatan] || ''
      const rawClassName = cells[headerIndex.class_name] || ''

      const row = {
        row_number: idx + 2,
        ic_number: normalizeSpaces(cells[headerIndex.ic_number] || ''),
        full_name: normalizeSpaces(cells[headerIndex.full_name] || ''),
        gender: normalizeSpaces(cells[headerIndex.gender] || ''),
        tingkatan: normalizeTingkatan(rawTingkatan),
        class_name: normalizeSpaces(rawClassName),
      }

      return row
    })

    const validationErrors = []
    const validRows = []
    const seenIcInFile = new Set()

    for (const row of preparedRows) {
      if (!row.full_name) {
        validationErrors.push(`Baris ${row.row_number}: full_name kosong.`)
        continue
      }

      if (!row.ic_number) {
        validationErrors.push(`Baris ${row.row_number}: ic_number kosong.`)
        continue
      }

      if (seenIcInFile.has(row.ic_number)) {
        validationErrors.push(`Baris ${row.row_number}: ic_number duplicate dalam fail.`)
        continue
      }
      seenIcInFile.add(row.ic_number)

      if (!row.tingkatan) {
        validationErrors.push(`Baris ${row.row_number}: tingkatan kosong.`)
        continue
      }

      if (!row.class_name) {
        validationErrors.push(`Baris ${row.row_number}: class_name kosong.`)
        continue
      }

      if (row.gender && !['Lelaki', 'Perempuan'].includes(row.gender)) {
        validationErrors.push(`Baris ${row.row_number}: gender mesti Lelaki atau Perempuan.`)
        continue
      }

      const classKey = `${normalizeTingkatan(row.tingkatan)}|||${normalizeClassName(row.class_name)}`
      const classRecord = classMap.get(classKey)

      if (!classRecord) {
        validationErrors.push(
          `Baris ${row.row_number}: kelas "${row.class_name}" bagi "${row.tingkatan}" tidak wujud.`
        )
        continue
      }

      validRows.push({
        ...row,
        class_id: classRecord.id,
      })
    }

    setErrors(validationErrors)
    setParsedRows(validRows)
    setPreviewRows(validRows.slice(0, 20))
  }

  const handleImport = async () => {
    if (!profile?.school_id || !setupConfig?.current_academic_year) {
      alert('Maklumat sekolah tidak lengkap.')
      return
    }

    if (errors.length > 0) {
      alert('Masih ada ralat dalam fail CSV.')
      return
    }

    if (parsedRows.length === 0) {
      alert('Tiada data sah untuk diimport.')
      return
    }

    setImporting(true)

    try {
      const icNumbers = parsedRows.map((r) => r.ic_number)

      const { data: existingProfiles, error: existingProfilesError } = await supabase
        .from('student_profiles')
        .select('id, ic_number')
        .in('ic_number', icNumbers)

      if (existingProfilesError) {
        throw existingProfilesError
      }

      const existingMap = new Map(
        (existingProfiles || []).map((item) => [item.ic_number, item])
      )

      const profilesToInsert = parsedRows
        .filter((row) => !existingMap.has(row.ic_number))
        .map((row) => ({
          ic_number: row.ic_number,
          full_name: row.full_name,
          gender: row.gender || null,
        }))

      if (profilesToInsert.length > 0) {
        const { error: insertProfilesError } = await supabase
          .from('student_profiles')
          .insert(profilesToInsert)

        if (insertProfilesError) {
          throw insertProfilesError
        }
      }

      const { data: refreshedProfiles, error: refreshedProfilesError } = await supabase
        .from('student_profiles')
        .select('id, ic_number')
        .in('ic_number', icNumbers)

      if (refreshedProfilesError) {
        throw refreshedProfilesError
      }

      const profileIdMap = new Map(
        (refreshedProfiles || []).map((item) => [item.ic_number, item.id])
      )

      const { data: existingEnrollments, error: existingEnrollmentsError } = await supabase
        .from('student_enrollments')
        .select('student_profile_id, academic_year')
        .eq('school_id', profile.school_id)
        .eq('academic_year', setupConfig.current_academic_year)

      if (existingEnrollmentsError) {
        throw existingEnrollmentsError
      }

      const existingEnrollmentSet = new Set(
        (existingEnrollments || []).map(
          (item) => `${item.student_profile_id}|||${item.academic_year}`
        )
      )

      const enrollmentsToInsert = []

      for (const row of parsedRows) {
        const studentProfileId = profileIdMap.get(row.ic_number)
        if (!studentProfileId) continue

        const enrollKey = `${studentProfileId}|||${setupConfig.current_academic_year}`
        if (existingEnrollmentSet.has(enrollKey)) continue

        enrollmentsToInsert.push({
          school_id: profile.school_id,
          student_profile_id: studentProfileId,
          class_id: row.class_id,
          academic_year: setupConfig.current_academic_year,
          is_active: true,
        })
      }

      if (enrollmentsToInsert.length > 0) {
        const { error: insertEnrollmentError } = await supabase
          .from('student_enrollments')
          .insert(enrollmentsToInsert)

        if (insertEnrollmentError) {
          throw insertEnrollmentError
        }
      }

      alert('Import murid berjaya.')
      setParsedRows([])
      setPreviewRows([])
      setErrors([])
      setFileName('')
    } catch (err) {
      console.error(err)
      alert(`Import gagal: ${err.message}`)
    } finally {
      setImporting(false)
    }
  }

  if (loading) {
    return <div className="p-6">Loading Student Import...</div>
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 rounded-2xl bg-white p-5 shadow-sm">
          <div className="mb-2 text-sm font-semibold text-slate-500">
            Student Import Module
          </div>
          <h1 className="text-3xl font-bold text-slate-900">Import Murid CSV</h1>
          <p className="mt-2 text-slate-600">
            Gunakan template rasmi sistem. Data akan dimasukkan ke student_profiles dan student_enrollments.
          </p>

          <div className="mt-4 space-y-1 text-sm text-slate-600">
            <div>
              <span className="font-semibold text-slate-800">Sekolah:</span>{' '}
              {school?.school_name || '-'}
              {school?.school_code ? ` (${school.school_code})` : ''}
            </div>
            <div>
              <span className="font-semibold text-slate-800">Tahun Akademik:</span>{' '}
              {setupConfig?.current_academic_year || '-'}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={downloadTemplate}
              className="rounded-xl bg-slate-800 px-5 py-3 font-medium text-white hover:bg-slate-900"
            >
              Download Template CSV
            </button>

            <label className="cursor-pointer rounded-xl bg-blue-600 px-5 py-3 font-medium text-white hover:bg-blue-700">
              Pilih Fail CSV
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={handleFileChange}
                className="hidden"
              />
            </label>

            <button
              type="button"
              onClick={handleImport}
              disabled={importing || parsedRows.length === 0 || errors.length > 0}
              className="rounded-xl bg-green-600 px-5 py-3 font-medium text-white hover:bg-green-700 disabled:opacity-60"
            >
              {importing ? 'Mengimport...' : 'Confirm Import'}
            </button>
          </div>

          <p className="mt-2 text-sm text-slate-500">
            Tingkatan boleh ditulis sebagai 1, T1, F1, Form 1 atau Tingkatan 1.
            Nama kelas tidak sensitif huruf besar/kecil.
          </p>

          {fileName && (
            <p className="mt-3 text-sm text-slate-600">
              Fail dipilih: <span className="font-medium">{fileName}</span>
            </p>
          )}
        </div>

        {errors.length > 0 && (
          <div className="mb-6 rounded-2xl bg-red-50 p-5 shadow-sm">
            <h2 className="mb-3 text-xl font-semibold text-red-700">Ralat Import</h2>
            <ul className="list-disc space-y-1 pl-5 text-red-700">
              {errors.map((err, idx) => (
                <li key={idx}>{err}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-xl font-semibold text-slate-900">Preview Data Sah</h2>

          {previewRows.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-slate-500">
              Tiada data untuk preview lagi.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse">
                <thead>
                  <tr className="border-b bg-slate-50 text-left">
                    <th className="px-3 py-3 text-sm font-semibold text-slate-700">IC</th>
                    <th className="px-3 py-3 text-sm font-semibold text-slate-700">Nama</th>
                    <th className="px-3 py-3 text-sm font-semibold text-slate-700">Jantina</th>
                    <th className="px-3 py-3 text-sm font-semibold text-slate-700">Tingkatan</th>
                    <th className="px-3 py-3 text-sm font-semibold text-slate-700">Kelas</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row, idx) => (
                    <tr key={idx} className="border-b">
                      <td className="px-3 py-3">{row.ic_number}</td>
                      <td className="px-3 py-3">{row.full_name}</td>
                      <td className="px-3 py-3">{row.gender || '-'}</td>
                      <td className="px-3 py-3">{row.tingkatan}</td>
                      <td className="px-3 py-3">{row.class_name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-6 flex gap-3">
            <button
              type="button"
              onClick={() => navigate('/dashboard')}
              className="rounded-xl border border-slate-300 px-5 py-3 font-medium text-slate-700 hover:bg-slate-100"
            >
              Kembali
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}