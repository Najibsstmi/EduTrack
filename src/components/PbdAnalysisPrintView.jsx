import './PbdAnalysisPrintView.css'

const TP_LEVELS = [1, 2, 3, 4, 5, 6]
const HIGHLIGHT_LEVELS = new Set([3, 4, 5, 6])

const DATASET_LABELS = {
  CURRENT: 'PBD Semasa',
  PENGGAL_1: 'Snapshot Penggal 1',
  PENGGAL_2: 'Snapshot Penggal 2',
  COMPARE: 'Perbandingan Penggal 1 vs Penggal 2',
}

const GRADE_NUMBER_WORDS = {
  1: 'SATU',
  2: 'DUA',
  3: 'TIGA',
  4: 'EMPAT',
  5: 'LIMA',
  6: 'ENAM',
}

const formatPercent = (value) => {
  const number = Number(value) || 0
  return Number.isInteger(number) ? String(number) : number.toFixed(1)
}

const formatGradeLabel = (label) => {
  const number = String(label || '').match(/(\d+)/)?.[1]
  return number
    ? `TINGKATAN ${GRADE_NUMBER_WORDS[number] || number}`
    : String(label || '-').toUpperCase()
}

const formatGeneratedDate = (date = new Date()) =>
  new Intl.DateTimeFormat('ms-MY', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date)

export default function PbdAnalysisPrintView({
  schoolInfo,
  academicYear,
  selectedSubjectName,
  activeDatasetKey,
  activeGradeGroups,
  activeOverallSummary,
  activeDistribution,
  movementRows,
  comparisonGradeGroups,
  comparisonOverallSummaries,
  filterLabels,
}) {
  const isComparison = activeDatasetKey === 'COMPARE'
  const subject = selectedSubjectName ? selectedSubjectName.toUpperCase() : '-'

  return (
    <div className="pbd-analysis-print-root">
      <style media="print">
        {'@page { size: A4 landscape; margin: 8mm; }'}
      </style>

      <article className="pbd-analysis-print-document">
        <PrintHeader schoolInfo={schoolInfo} filterLabels={filterLabels} />

        {isComparison ? (
          <>
            <AnalysisReport
              academicYear={academicYear}
              subject={subject}
              datasetLabel={DATASET_LABELS.PENGGAL_1}
              gradeGroups={comparisonGradeGroups?.PENGGAL_1 || []}
              overallSummary={comparisonOverallSummaries?.PENGGAL_1}
            />
            <AnalysisReport
              academicYear={academicYear}
              subject={subject}
              datasetLabel={DATASET_LABELS.PENGGAL_2}
              gradeGroups={comparisonGradeGroups?.PENGGAL_2 || []}
              overallSummary={comparisonOverallSummaries?.PENGGAL_2}
            />
            <MovementSection rows={movementRows || []} subject={subject} academicYear={academicYear} />
          </>
        ) : (
          <AnalysisReport
            academicYear={academicYear}
            subject={subject}
            datasetLabel={DATASET_LABELS[activeDatasetKey] || DATASET_LABELS.CURRENT}
            gradeGroups={activeGradeGroups || []}
            overallSummary={activeOverallSummary}
            distribution={activeDistribution}
          />
        )}

        <footer className="pbd-analysis-print-footer">
          <span>Tarikh dijana: {formatGeneratedDate()}</span>
          <span>Laporan dijana oleh EduTrack</span>
        </footer>
      </article>
    </div>
  )
}

function PrintHeader({ schoolInfo, filterLabels }) {
  return (
    <header className="pbd-analysis-school-header">
      <div className="pbd-analysis-school-logo">
        {schoolInfo?.logo_url ? (
          <img src={schoolInfo.logo_url} alt={`Logo ${schoolInfo.school_name || 'sekolah'}`} />
        ) : (
          <span>LOGO<br />SEKOLAH</span>
        )}
      </div>
      <div className="pbd-analysis-school-copy">
        <div className="pbd-analysis-school-name">
          {schoolInfo?.school_name || 'Nama sekolah'}
        </div>
        <div>Kod sekolah: {schoolInfo?.school_code || '-'}</div>
      </div>
      <div className="pbd-analysis-filter-summary">
        <span>{filterLabels?.tingkatan || 'Semua Tingkatan'}</span>
        <span>{filterLabels?.className || 'Semua Kelas'}</span>
        <span>{filterLabels?.tp || 'Semua TP'}</span>
      </div>
      <div className="pbd-analysis-edutrack-mark">
        <img src="/edutrack-logo.png" alt="Logo EduTrack" />
        <span>Laporan Analisis</span>
      </div>
    </header>
  )
}

function AnalysisReport({
  academicYear,
  subject,
  datasetLabel,
  gradeGroups,
  overallSummary,
  distribution,
}) {
  const reportTitle = `ANALISIS PENCAPAIAN PBD (${datasetLabel.toUpperCase()}) MURID TAHUN ${academicYear || '-'}`
  const chartDistribution = distribution || { counts: overallSummary?.counts || {} }

  return (
    <section className="pbd-analysis-report-block">
      <OverallSummary summary={overallSummary} />

      <div className="pbd-analysis-overview-grid">
        <div className="pbd-analysis-print-panel pbd-analysis-grade-panel">
          <ReportHeading title={reportTitle} subject={subject} />
          <GradeDistributionTable
            gradeSummaries={gradeGroups.map((group) => group.total)}
            overallSummary={overallSummary}
          />
        </div>
        <div className="pbd-analysis-print-panel pbd-analysis-chart-panel">
          <h3>Carta Taburan TP</h3>
          <PrintTpBarChart distribution={chartDistribution} />
        </div>
      </div>

      <div className="pbd-analysis-print-panel pbd-analysis-class-panel">
        <ReportHeading title={reportTitle} subject={subject} />
        <ClassDistributionBlocks gradeGroups={gradeGroups} />
      </div>

      <div className="pbd-analysis-print-panel pbd-analysis-minimum-panel">
        <h3>Analisis Minimum TP3-TP6</h3>
        <MinimumAchievementTable
          gradeSummaries={gradeGroups.map((group) => group.total)}
          overallSummary={overallSummary}
        />
      </div>
    </section>
  )
}

function ReportHeading({ title, subject }) {
  return (
    <div className="pbd-analysis-report-heading">
      <div>{title}</div>
      <div>{subject}</div>
    </div>
  )
}

function OverallSummary({ summary }) {
  if (!summary) return null

  return (
    <table className="pbd-analysis-overall-summary" aria-label="Rumusan keseluruhan">
      <tbody>
        <tr>
          <th>Jumlah Murid</th>
          <td>{summary.totalStudents || 0}</td>
          <th>Telah Diisi</th>
          <td>{summary.assessedCount || 0}</td>
          <th>TD</th>
          <td>{summary.tdCount || 0}</td>
          <th>Minimum TP3-TP6</th>
          <td>{summary.minimumCount || 0} ({formatPercent(summary.minimumPercent)}%)</td>
        </tr>
      </tbody>
    </table>
  )
}

function GradeDistributionTable({ gradeSummaries, overallSummary }) {
  const rows = overallSummary
    ? [...gradeSummaries, { ...overallSummary, label: 'JUMLAH' }]
    : gradeSummaries

  return (
    <table className="pbd-analysis-screen-style-table pbd-analysis-grade-table">
      <thead>
        <tr>
          <th rowSpan={2} className="pbd-analysis-col-number">Bil.</th>
          <th rowSpan={2} className="pbd-analysis-col-level">Tingkatan</th>
          {TP_LEVELS.map((level) => <th key={level} colSpan={2}>TP{level}</th>)}
          <th colSpan={2}>TD</th>
          <th rowSpan={2} className="pbd-analysis-col-students">Jumlah Murid</th>
        </tr>
        <tr>
          {TP_LEVELS.map((level) => <HeaderPair key={level} />)}
          <HeaderPair />
        </tr>
      </thead>
      <tbody>
        {rows.length ? rows.map((row, index) => {
          const isTotal = row.label === 'JUMLAH'
          return (
            <tr key={row.id || row.label} className={isTotal ? 'is-total' : ''}>
              <td>{isTotal ? '' : index + 1}</td>
              <th>{isTotal ? 'JUMLAH' : formatGradeLabel(row.label)}</th>
              {TP_LEVELS.map((level) => (
                <DistributionPair
                  key={level}
                  count={row.counts?.[level] || 0}
                  percent={row.percentages?.[level] || 0}
                  highlight={HIGHLIGHT_LEVELS.has(level)}
                  total={isTotal}
                />
              ))}
              <DistributionPair count={row.tdCount} percent={row.tdPercent} total={isTotal} />
              <td className="is-bold">{row.totalStudents || 0}</td>
            </tr>
          )
        }) : (
          <tr><td colSpan={17} className="pbd-analysis-print-empty">Tiada data untuk dipaparkan.</td></tr>
        )}
      </tbody>
    </table>
  )
}

function ClassDistributionBlocks({ gradeGroups }) {
  if (!gradeGroups.length) {
    return <div className="pbd-analysis-print-empty">Tiada kelas untuk dipaparkan.</div>
  }

  return (
    <div className="pbd-analysis-class-groups">
      {gradeGroups.map((group) => (
        <div key={group.tingkatan} className="pbd-analysis-class-group">
          <div className="pbd-analysis-class-group-title">{formatGradeLabel(group.label)}:</div>
          <table className="pbd-analysis-screen-style-table pbd-analysis-class-table">
            <thead>
              <tr>
                <th className="pbd-analysis-col-class-name">TAHAP PENGUASAAN</th>
                {TP_LEVELS.map((level) => <th key={level}>TP {level}</th>)}
                <th>TD</th>
                <th className="pbd-analysis-col-students">Jum. Murid</th>
              </tr>
            </thead>
            <tbody>
              {[...group.rows, { ...group.total, label: 'JUMLAH' }].map((row) => (
                <tr key={row.id || row.label} className={row.label === 'JUMLAH' ? 'is-total' : ''}>
                  <th>{String(row.label || '-').toUpperCase()}</th>
                  {TP_LEVELS.map((level) => (
                    <td key={level} className={HIGHLIGHT_LEVELS.has(level) && row.label !== 'JUMLAH' ? 'is-highlight' : ''}>
                      {row.counts?.[level] || 0}
                    </td>
                  ))}
                  <td>{row.tdCount || 0}</td>
                  <td className="is-bold">{row.totalStudents || 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}

function MinimumAchievementTable({ gradeSummaries, overallSummary }) {
  const rows = overallSummary
    ? [...gradeSummaries, { ...overallSummary, label: 'JUMLAH' }]
    : gradeSummaries

  return (
    <table className="pbd-analysis-screen-style-table pbd-analysis-minimum-table">
      <thead>
        <tr>
          <th rowSpan={2} className="pbd-analysis-col-level">Tingkatan</th>
          {TP_LEVELS.map((level) => <th key={level} colSpan={2}>TP {level}</th>)}
          <th colSpan={2}>TD</th>
          <th rowSpan={2} className="pbd-analysis-col-minimum">Tahap Minima TP3-TP6</th>
          <th rowSpan={2} className="pbd-analysis-col-minimum">Minima TP3-TP6 %</th>
        </tr>
        <tr>
          {TP_LEVELS.map((level) => <HeaderPair key={level} />)}
          <HeaderPair />
        </tr>
      </thead>
      <tbody>
        {rows.length ? rows.map((row) => {
          const isTotal = row.label === 'JUMLAH'
          return (
            <tr key={row.id || row.label} className={isTotal ? 'is-total' : ''}>
              <th>{isTotal ? 'JUMLAH' : formatGradeLabel(row.label)}</th>
              {TP_LEVELS.map((level) => (
                <DistributionPair
                  key={level}
                  count={row.counts?.[level] || 0}
                  percent={row.percentages?.[level] || 0}
                  highlight={HIGHLIGHT_LEVELS.has(level)}
                  total={isTotal}
                />
              ))}
              <DistributionPair count={row.tdCount} percent={row.tdPercent} total={isTotal} />
              <td className="is-minimum-count">{row.minimumCount || 0}</td>
              <td className="is-bold">{formatPercent(row.minimumPercent)}</td>
            </tr>
          )
        }) : (
          <tr><td colSpan={17} className="pbd-analysis-print-empty">Tiada data untuk dipaparkan.</td></tr>
        )}
      </tbody>
    </table>
  )
}

function HeaderPair() {
  return (
    <>
      <th>Bil</th>
      <th>%</th>
    </>
  )
}

function DistributionPair({ count, percent, highlight = false, total = false }) {
  return (
    <>
      <td className={highlight && !total ? 'is-highlight' : ''}>{count || 0}</td>
      <td>{formatPercent(percent)}</td>
    </>
  )
}

function PrintTpBarChart({ distribution }) {
  const values = TP_LEVELS.map((level) => Number(distribution?.counts?.[level]) || 0)
  const maximum = Math.max(1, ...values)
  const chartHeight = 132
  const baseline = 158

  return (
    <svg className="pbd-analysis-print-chart" viewBox="0 0 320 190" role="img" aria-label="Carta Taburan TP">
      {[0, 1, 2, 3, 4].map((step) => {
        const y = 26 + (chartHeight / 4) * step
        const value = Math.round(maximum - (maximum / 4) * step)
        return (
          <g key={step}>
            <line x1="34" y1={y} x2="306" y2={y} className="pbd-analysis-chart-grid" />
            <text x="28" y={y + 3} textAnchor="end" className="pbd-analysis-chart-axis-label">{value}</text>
          </g>
        )
      })}
      <line x1="34" y1={baseline} x2="306" y2={baseline} className="pbd-analysis-chart-axis" />
      {values.map((value, index) => {
        const height = (value / maximum) * chartHeight
        const x = 48 + index * 43
        return (
          <g key={TP_LEVELS[index]}>
            <rect x={x} y={baseline - height} width="25" height={height} rx="3" className="pbd-analysis-chart-bar" />
            <text x={x + 12.5} y={baseline - height - 4} textAnchor="middle" className="pbd-analysis-chart-value">{value}</text>
            <text x={x + 12.5} y="174" textAnchor="middle" className="pbd-analysis-chart-label">TP{TP_LEVELS[index]}</text>
          </g>
        )
      })}
    </svg>
  )
}

function MovementSection({ rows, subject, academicYear }) {
  return (
    <section className="pbd-analysis-print-panel pbd-analysis-movement-panel">
      <ReportHeading
        title={`PERBANDINGAN PENGGAL 1 VS PENGGAL 2 MURID TAHUN ${academicYear || '-'}`}
        subject={subject}
      />
      <table className="pbd-analysis-screen-style-table pbd-analysis-movement-table">
        <thead>
          <tr>
            <th>Murid</th>
            <th>Kelas</th>
            <th>Subjek</th>
            <th>Penggal 1</th>
            <th>Penggal 2</th>
            <th>Perubahan</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.length ? rows.map((row) => (
            <tr key={row.key}>
              <th>{row.studentName}</th>
              <td>{row.className}</td>
              <td>{row.subjectName}</td>
              <td>TP{row.tp1}</td>
              <td>TP{row.tp2}</td>
              <td>{row.delta > 0 ? `+${row.delta}` : row.delta}</td>
              <td>{row.status}</td>
            </tr>
          )) : (
            <tr><td colSpan={7} className="pbd-analysis-print-empty">Tiada pasangan snapshot untuk dibandingkan.</td></tr>
          )}
        </tbody>
      </table>
    </section>
  )
}
