import './MinimumCPrintReport.css'
import { formatPercentage, RPM_SUBJECT_CONFIG } from '../lib/minimumCAnalysis.js'

const formatDate = () =>
  new Intl.DateTimeFormat('ms-MY', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date())

const gradeLabel = (result) => {
  if (result?.state === 'absent') return 'TH'
  return result?.grade || '—'
}

export default function MinimumCPrintReport({
  school,
  academicYear,
  filterLabels,
  exam,
  summary,
  subjectSummaries,
  fourSubjectRows,
}) {
  const interventionRows = (fourSubjectRows || []).filter(
    (row) => row.status !== 'Capai' || !row.isComplete
  )

  return (
    <div className="minimum-c-print-root">
      <style media="print">{'@page { size: A4 landscape; margin: 9mm; }'}</style>
      <article className="minimum-c-print-document">
        <header className="minimum-c-print-header">
          <div className="minimum-c-print-logo">
            {school?.logo_url ? (
              <img src={school.logo_url} alt={`Logo ${school.school_name || 'sekolah'}`} />
            ) : (
              <span>LOGO</span>
            )}
          </div>
          <div>
            <p>{school?.school_name || 'Sekolah'}</p>
            <h1>Laporan Analisis Minimum C – RPM 2026–2035</h1>
            <div>
              Tahun {academicYear || '—'} · {filterLabels?.level || 'Semua tingkatan'} ·{' '}
              {filterLabels?.className || 'Semua kelas'} · {exam?.label || 'Peperiksaan'}
            </div>
          </div>
          <div className="minimum-c-print-brand">
            <img src="/edutrack-logo.png" alt="EduTrack" />
            <span>Pemantauan dalaman sekolah</span>
          </div>
        </header>

        <section className="minimum-c-print-note">
          Analisis ini ialah pemantauan dalaman sekolah dan bukan pengganti pelaporan rasmi KPM.
          Kadar pencapaian menggunakan murid dengan keputusan lengkap bagi keempat-empat subjek.
          {exam?.isTarget ? ' Peperiksaan dipilih ialah sasaran atau ramalan.' : ''}
        </section>

        <section className="minimum-c-print-stats">
          <PrintStat label="Jumlah Murid" value={summary?.totalStudents ?? 0} />
          <PrintStat label="Keputusan Lengkap" value={summary?.completeCount ?? 0} />
          <PrintStat label="Capai Minimum C" value={summary?.achievedCount ?? 0} />
          <PrintStat label="Peratus Pencapaian" value={summary?.achievementRate == null ? 'Tiada data mencukupi' : formatPercentage(summary.achievementRate)} />
          <PrintStat label="Rekod Tidak Lengkap" value={summary?.incompleteCount ?? 0} />
        </section>

        <section className="minimum-c-print-section">
          <h2>Analisis Empat Subjek</h2>
          <div className="minimum-c-print-bars">
            {(subjectSummaries || []).slice(0, 8).map((row) => (
              <div key={row.subject.id}>
                <span>{row.subject.subject_name}</span>
                <div><i style={{ width: `${Math.max(0, Math.min(100, row.minimumCRate || 0))}%` }} /></div>
                <strong>{formatPercentage(row.minimumCRate)}</strong>
              </div>
            ))}
          </div>
        </section>

        <section className="minimum-c-print-section">
          <h2>Ringkasan Mengikut Subjek</h2>
          <table>
            <thead>
              <tr>
                <th className="is-left">Subjek</th>
                <th>Murid Dinilai</th>
                <th>Minimum C</th>
                <th>% Minimum C</th>
                <th>Bawah C</th>
                <th>Tiada Data</th>
              </tr>
            </thead>
            <tbody>
              {(subjectSummaries || []).map((row) => (
                <tr key={row.subject.id}>
                  <td className="is-left">{row.subject.subject_name}</td>
                  <td>{row.evaluatedCount}</td>
                  <td>{row.minimumCCount}</td>
                  <td>{formatPercentage(row.minimumCRate)}</td>
                  <td>{row.belowCount}</td>
                  <td>{row.noDataCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="minimum-c-print-section minimum-c-print-page-break">
          <h2>Murid Memerlukan Intervensi</h2>
          <table>
            <thead>
              <tr>
                <th>Bil.</th>
                <th className="is-left">Nama Murid</th>
                <th>Kelas</th>
                {RPM_SUBJECT_CONFIG.map((item) => <th key={item.key}>{item.shortLabel}</th>)}
                <th>Bawah C</th>
                <th className="is-left">Subjek Intervensi</th>
                <th>Status Data</th>
              </tr>
            </thead>
            <tbody>
              {interventionRows.length ? (
                interventionRows.map((row, index) => (
                  <tr key={row.enrollment_id}>
                    <td>{index + 1}</td>
                    <td className="is-left">{row.full_name}</td>
                    <td>{row.class_name}</td>
                    {RPM_SUBJECT_CONFIG.map((item) => (
                      <td key={item.key}>{gradeLabel(row.subjects[item.key])}</td>
                    ))}
                    <td>{row.belowCount}</td>
                    <td className="is-left">{row.interventionSubjects.join(', ') || '—'}</td>
                    <td>{row.isComplete ? 'Lengkap' : 'Tidak Lengkap'}</td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan={10}>Tiada murid dalam senarai intervensi.</td></tr>
              )}
            </tbody>
          </table>
        </section>

        <footer>
          <span>Dijana pada {formatDate()}</span>
          <span>EduTrack · Analisis Minimum C</span>
        </footer>
      </article>
    </div>
  )
}

function PrintStat({ label, value }) {
  return <div><span>{label}</span><strong>{value}</strong></div>
}
