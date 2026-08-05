import './ExamAnalysisPrintView.css'

const formatGeneratedDate = (date = new Date()) =>
  new Intl.DateTimeFormat('ms-MY', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date)

const formatDecimal = (value, digits = 2) =>
  value === null || value === undefined || Number.isNaN(Number(value))
    ? '-'
    : Number(value).toFixed(digits)

const formatPercent = (value) =>
  value === null || value === undefined || Number.isNaN(Number(value))
    ? '-'
    : `${Number(value).toFixed(1)}%`

const formatMetricMark = (metric) =>
  metric?.is_absent === true ? 'TH' : metric?.mark ?? '-'

const formatMetricGrade = (metric) =>
  metric?.is_absent === true ? 'TH' : metric?.grade_name ?? '-'

const renderEmptyRow = (colSpan, text = 'Tiada data untuk dipaparkan.') => (
  <tr>
    <td colSpan={colSpan} className="exam-analysis-empty">
      {text}
    </td>
  </tr>
)

export default function ExamAnalysisPrintView({
  mode,
  schoolInfo,
  academicYear,
  filterLabels,
  classReport,
  subjectReport,
}) {
  const isClassReport = mode === 'class'
  const title = isClassReport
    ? 'Laporan Analisis Peperiksaan - Prestasi Kelas'
    : 'Laporan Analisis Peperiksaan - Prestasi Subjek'

  return (
    <div className="exam-analysis-print-root">
      <style media="print">
        {'@page { size: A4 landscape; margin: 8mm; }'}
      </style>

      <article className="exam-analysis-print-document">
        <PrintHeader
          schoolInfo={schoolInfo}
          title={title}
          academicYear={academicYear}
          filterLabels={filterLabels}
        />

        {isClassReport ? (
          <ClassAnalysisReport report={classReport} />
        ) : (
          <SubjectAnalysisReport report={subjectReport} />
        )}

        <footer className="exam-analysis-print-footer">
          <span>Tarikh dijana: {formatGeneratedDate()}</span>
          <span>Laporan dijana oleh EduTrack</span>
        </footer>
      </article>
    </div>
  )
}

function PrintHeader({ schoolInfo, title, academicYear, filterLabels }) {
  const filterItems = Object.values(filterLabels || {}).filter(Boolean)

  return (
    <header className="exam-analysis-print-header">
      <div className="exam-analysis-school-logo">
        {schoolInfo?.logo_url ? (
          <img src={schoolInfo.logo_url} alt={`Logo ${schoolInfo.school_name || 'sekolah'}`} />
        ) : (
          <span>LOGO<br />SEKOLAH</span>
        )}
      </div>

      <div>
        <div className="exam-analysis-school-name">
          {schoolInfo?.school_name || 'Nama sekolah'}
        </div>
        <div className="exam-analysis-school-code">
          Kod sekolah: {schoolInfo?.school_code || '-'} | Tahun akademik: {academicYear || '-'}
        </div>
        <div className="exam-analysis-print-title">{title}</div>
      </div>

      <div className="exam-analysis-filter-summary">
        {filterItems.length ? (
          filterItems.map((item) => <span key={item}>{item}</span>)
        ) : (
          <span>Semua data</span>
        )}
      </div>

      <div className="exam-analysis-edutrack-mark">
        <img src="/edutrack-logo.png" alt="Logo EduTrack" />
        <span>Analisis Peperiksaan</span>
      </div>
    </header>
  )
}

function ClassAnalysisReport({ report }) {
  const summary = report?.summary || {}
  const subjectRows = [...(report?.subjectRows || [])].sort((a, b) =>
    String(a.subject_name || '').localeCompare(String(b.subject_name || ''), 'ms', {
      sensitivity: 'base',
    })
  )
  const rankingRows = report?.studentRankings || []
  const gradeDistribution = report?.gradeDistribution || {}
  const classRankingRows = report?.classRankingRows || []

  return (
    <>
      <section className="exam-analysis-summary-grid" aria-label="Ringkasan kelas">
        <SummaryCard label="Bil Murid" value={summary.totalStudents ?? 0} />
        <SummaryCard label="Ada Markah" value={summary.studentsWithMarks ?? 0} />
        <SummaryCard label="GPS Kelas" value={formatDecimal(summary.gps)} />
        <SummaryCard label="% Lulus" value={formatPercent(summary.passRate)} />
        <SummaryCard
          label="Kedudukan"
          value={summary.classRank ? `${summary.classRank} / ${summary.classRankTotal}` : '-'}
        />
      </section>

      <section className="exam-analysis-print-section exam-analysis-two-column">
        <div>
          <h2>Prestasi Subjek</h2>
          <table className="exam-analysis-table">
            <thead>
              <tr>
                <th className="is-left">Subjek</th>
                <th>GP</th>
                <th>% Lulus</th>
                <th>Bil Markah</th>
              </tr>
            </thead>
            <tbody>
              {subjectRows.length ? (
                subjectRows.map((row) => (
                  <tr key={row.subject_id}>
                    <td className="is-left">{row.subject_name || '-'}</td>
                    <td>{formatDecimal(row.gp)}</td>
                    <td>{formatPercent(row.passRate)}</td>
                    <td>{row.scoredCount ?? 0}</td>
                  </tr>
                ))
              ) : (
                renderEmptyRow(4, 'Tiada data prestasi subjek.')
              )}
            </tbody>
          </table>
        </div>

        <div>
          <h2>Taburan Gred Kelas</h2>
          <table className="exam-analysis-table">
            <thead>
              <tr>
                <th>Gred</th>
                <th>Bilangan</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(gradeDistribution).length ? (
                Object.entries(gradeDistribution).map(([grade, count]) => (
                  <tr key={grade}>
                    <td>{grade}</td>
                    <td>{count}</td>
                  </tr>
                ))
              ) : (
                renderEmptyRow(2, 'Tiada taburan gred.')
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="exam-analysis-print-section exam-analysis-student-section">
        <h2>Kedudukan Murid</h2>
        <table className="exam-analysis-table">
          <thead>
            <tr>
              <th style={{ width: '9mm' }}>Bil</th>
              <th style={{ width: '14mm' }}>Kedudukan</th>
              <th className="is-left">Nama Murid</th>
              <th>GP Murid</th>
              <th>Bil A</th>
              <th>Bil Lulus</th>
              <th>Bil Subjek</th>
            </tr>
          </thead>
          <tbody>
            {rankingRows.length ? (
              rankingRows.map((student, index) => (
                <tr key={student.enrollment_id}>
                  <td>{index + 1}</td>
                  <td>{student.rank}</td>
                  <td className="is-left">{student.full_name || '-'}</td>
                  <td>{formatDecimal(student.gp)}</td>
                  <td>{student.bilA ?? 0}</td>
                  <td>{student.bilLulus ?? 0}</td>
                  <td>{student.scoredSubjectCount ?? 0}</td>
                </tr>
              ))
            ) : (
              renderEmptyRow(7, 'Tiada markah murid untuk peperiksaan ini.')
            )}
          </tbody>
        </table>
      </section>

      <section className="exam-analysis-print-section">
        <h2>Kedudukan Kelas Dalam Tingkatan</h2>
        <table className="exam-analysis-table">
          <thead>
            <tr>
              <th>Kedudukan</th>
              <th className="is-left">Kelas</th>
              <th>GPS</th>
              <th>Bil Markah</th>
            </tr>
          </thead>
          <tbody>
            {classRankingRows.length ? (
              classRankingRows.map((row) => (
                <tr
                  key={row.id}
                  className={String(row.id) === String(report?.selectedClassId) ? 'is-highlight' : ''}
                >
                  <td>{row.rank}</td>
                  <td className="is-left">{row.class_name || '-'}</td>
                  <td>{formatDecimal(row.gps)}</td>
                  <td>{row.scoredCount ?? 0}</td>
                </tr>
              ))
            ) : (
              renderEmptyRow(4, 'Data belum mencukupi untuk ranking kelas.')
            )}
          </tbody>
        </table>
      </section>
    </>
  )
}

function SubjectAnalysisReport({ report }) {
  const summary = report?.summary || {}
  const gradeColumns = report?.gradeColumns || []
  const summaryRows = report?.summaryRows || []
  const studentRows = report?.studentRows || []
  const analysisColumns = report?.analysisColumns || []
  const summaryColSpan = 5 + gradeColumns.length + 5
  const studentColSpan = 4 + analysisColumns.length * 2

  return (
    <>
      <section className="exam-analysis-summary-grid" aria-label="Ringkasan subjek">
        <SummaryCard label="Murid" value={summary.totalStudents ?? 0} />
        <SummaryCard label="Ada Markah" value={summary.totalWithScore ?? 0} />
        <SummaryCard label="GPMP" value={formatDecimal(summary.gpmp)} />
        <SummaryCard label="Tertinggi" value={summary.highest ?? '-'} />
        <SummaryCard label="Purata" value={formatDecimal(summary.average)} />
      </section>

      <section className="exam-analysis-print-section">
        <h2>Ringkasan Peperiksaan</h2>
        <table className="exam-analysis-table">
          <thead>
            <tr>
              <th className="is-left">Jenis Peperiksaan</th>
              <th>Jumlah Murid</th>
              <th>Hadir</th>
              <th>Tak Hadir</th>
              <th>Belum Isi</th>
              {gradeColumns.map((grade) => (
                <th key={grade}>{grade}</th>
              ))}
              <th>Lulus</th>
              <th>% Lulus</th>
              <th>Gagal</th>
              <th>% Gagal</th>
              <th>GPMP</th>
            </tr>
          </thead>
          <tbody>
            {summaryRows.length ? (
              summaryRows.map((row) => (
                <tr key={row.examKey}>
                  <td className="is-left">{row.examLabel}</td>
                  <td>{row.jumlahMurid}</td>
                  <td>{row.hadir}</td>
                  <td>{row.tidakHadir}</td>
                  <td>{row.belumIsi || 0}</td>
                  {gradeColumns.map((grade) => (
                    <td key={`${row.examKey}-${grade}`}>{row[grade] ?? 0}</td>
                  ))}
                  <td>{row.lulus}</td>
                  <td>{row.peratusLulus}%</td>
                  <td>{row.gagal}</td>
                  <td>{row.peratusGagal}%</td>
                  <td>{row.gpmp ?? '-'}</td>
                </tr>
              ))
            ) : (
              renderEmptyRow(summaryColSpan, 'Tiada data ringkasan untuk paparan ini.')
            )}
          </tbody>
        </table>
      </section>

      <section className="exam-analysis-print-section exam-analysis-student-section">
        <h2>Jadual Murid</h2>
        <table className="exam-analysis-table exam-analysis-subject-student-table">
          <thead>
            <tr>
              <th style={{ width: '8mm' }}>Bil</th>
              <th style={{ width: '24mm' }}>IC</th>
              <th className="is-left">Nama</th>
              <th style={{ width: '25mm' }}>Kelas</th>
              {analysisColumns.map((exam) => (
                <FragmentHeader key={exam.key} exam={exam} />
              ))}
            </tr>
          </thead>
          <tbody>
            {studentRows.length ? (
              studentRows.map((row, index) => (
                <tr key={row.enrollment_id}>
                  <td>{index + 1}</td>
                  <td>{row.ic_number || '-'}</td>
                  <td className="is-left">{row.full_name || '-'}</td>
                  <td>{row.class_name || '-'}</td>
                  {analysisColumns.map((exam) => {
                    const key = String(exam.key || '').toUpperCase()
                    const metric = row.analysis?.[key]
                    return (
                      <FragmentCells key={key} metric={metric} />
                    )
                  })}
                </tr>
              ))
            ) : (
              renderEmptyRow(studentColSpan, 'Tiada rekod murid untuk dipaparkan.')
            )}
          </tbody>
        </table>
      </section>
    </>
  )
}

function SummaryCard({ label, value }) {
  return (
    <div className="exam-analysis-summary-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function FragmentHeader({ exam }) {
  return (
    <>
      <th>{exam.name || exam.key}</th>
      <th>Gred</th>
    </>
  )
}

function FragmentCells({ metric }) {
  return (
    <>
      <td>{formatMetricMark(metric)}</td>
      <td>{formatMetricGrade(metric)}</td>
    </>
  )
}
