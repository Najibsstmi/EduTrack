import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts'
import './Student360PrintReport.css'

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

const formatNumber = (value, digits = 1) => {
  if (value === null || value === undefined || value === '') return 'Tidak tersedia'

  const number = Number(value)
  return Number.isFinite(number) ? number.toFixed(digits) : String(value)
}

const polarPoint = (centerX, centerY, radius, index, count) => {
  const angle = -Math.PI / 2 + (index * Math.PI * 2) / count
  return {
    x: centerX + Math.cos(angle) * radius,
    y: centerY + Math.sin(angle) * radius,
  }
}

function PrintRadar({ data, maxValue = 100, ariaLabel }) {
  const width = 290
  const height = 188
  const centerX = width / 2
  const centerY = 92
  const radius = 62
  const labelRadius = 83
  const safeMax = Math.max(Number(maxValue) || 0, 1)

  const gridPolygons = [0.25, 0.5, 0.75, 1].map((scale) =>
    data
      .map((_, index) => polarPoint(centerX, centerY, radius * scale, index, data.length))
      .map((point) => `${point.x},${point.y}`)
      .join(' ')
  )
  const axisPoints = data.map((_, index) =>
    polarPoint(centerX, centerY, radius, index, data.length)
  )
  const scorePoints = data
    .map((item, index) =>
      polarPoint(
        centerX,
        centerY,
        radius * clamp((Number(item.score) || 0) / safeMax, 0, 1),
        index,
        data.length
      )
    )
    .map((point) => `${point.x},${point.y}`)
    .join(' ')

  return (
    <svg
      className="report-radar"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={ariaLabel}
    >
      {gridPolygons.map((points, index) => (
        <polygon key={points} points={points} className={`report-radar-grid grid-${index}`} />
      ))}
      {axisPoints.map((point) => (
        <line
          key={`${point.x}-${point.y}`}
          x1={centerX}
          y1={centerY}
          x2={point.x}
          y2={point.y}
          className="report-radar-axis"
        />
      ))}
      <polygon points={scorePoints} className="report-radar-score" />
      {data.map((item, index) => {
        const point = polarPoint(centerX, centerY, labelRadius, index, data.length)
        const textAnchor =
          Math.abs(point.x - centerX) < 8 ? 'middle' : point.x > centerX ? 'start' : 'end'
        const scoreLabel =
          item.available === false || item.score === null
            ? '-'
            : item.displayScore || formatNumber(item.score, item.digits ?? 0)

        return (
          <text
            key={item.label}
            x={point.x}
            y={point.y}
            textAnchor={textAnchor}
            dominantBaseline="middle"
            className="report-radar-label"
          >
            <tspan x={point.x}>{item.label}</tspan>
            <tspan x={point.x} dy="9" className="report-radar-value">
              {scoreLabel}
            </tspan>
          </text>
        )
      })}
    </svg>
  )
}

function AcademicMetric({ label, value, note }) {
  return (
    <div className="report-metric">
      <div className="report-metric-label">{label}</div>
      <div className="report-metric-value">{value}</div>
      <div className="report-metric-note">{note}</div>
    </div>
  )
}

function PbsDetail({ label, value, detail }) {
  return (
    <div className="report-pbs-detail">
      <div className="report-pbs-detail-heading">
        <strong>{label}</strong>
        <span>{value}</span>
      </div>
      <p>{detail}</p>
    </div>
  )
}

function SubjectResults({ results }) {
  if (!results?.length) {
    return <div className="report-empty-state report-subject-empty">Senarai subjek dan gred belum tersedia.</div>
  }

  return (
    <div className="report-subject-grid">
      {results.map((subject) => (
        <div key={subject.subjectId} className="report-subject-item">
          <span title={subject.subjectName}>{subject.subjectName}</span>
          <strong>{subject.grade || '-'}</strong>
          <small>{subject.mark === null ? '' : `${formatNumber(subject.mark, 0)}%`}</small>
        </div>
      ))}
    </div>
  )
}

function PbdSubjectTooltip({ active, payload }) {
  const row = payload?.[0]?.payload
  if (!active || !row) return null

  return (
    <div className="report-pbd-tooltip">
      <strong>{row.subjectName}</strong>
      <span>TP{row.tp}</span>
    </div>
  )
}

function PbdSubjectRadar({ data }) {
  if (!data?.length) {
    return <div className="report-empty-state">Data PBD mengikut subjek belum direkodkan.</div>
  }

  return (
    <div className="report-pbd-subject-layout">
      <div className="report-pbd-subject-chart">
        <ResponsiveContainer
          width="100%"
          height="100%"
          minWidth={0}
          initialDimension={{ width: 600, height: 112 }}
        >
          <RadarChart data={data} outerRadius="68%" margin={{ top: 12, right: 28, bottom: 12, left: 28 }}>
            <PolarGrid stroke="#cbd5e1" />
            <PolarAngleAxis
              dataKey="axisLabel"
              tick={{ fill: '#334155', fontSize: 9, fontWeight: 600 }}
            />
            <PolarRadiusAxis
              angle={90}
              domain={[0, 6]}
              ticks={[1, 2, 3, 4, 5, 6]}
              allowDataOverflow
              tick={{ fill: '#64748b', fontSize: 8 }}
            />
            <Radar
              name="Tahap Penguasaan PBD"
              dataKey="tp"
              stroke="#4f46e5"
              fill="#6366f1"
              fillOpacity={0.32}
              strokeWidth={2}
              isAnimationActive={false}
            />
            <Tooltip content={<PbdSubjectTooltip />} />
          </RadarChart>
        </ResponsiveContainer>
      </div>
      <div className="report-pbd-subject-list" aria-label="Senarai TP PBD mengikut subjek">
        {data.map((row) => (
          <div key={row.subjectId} className="report-pbd-subject-item">
            <span title={row.subjectName}>{row.subjectName}</span>
            <strong>TP{row.tp}</strong>
          </div>
        ))}
      </div>
    </div>
  )
}

function PsychometricScoreList({ scores }) {
  if (!scores?.length) return null

  return (
    <div className="report-psychometric-score-list">
      {scores.map((score) => (
        <div key={score.key} className="report-psychometric-score-row">
          <span>{score.label}</span>
          <strong>{formatNumber(score.score, 0)}</strong>
        </div>
      ))}
    </div>
  )
}

function PsychometricCard({ instrument }) {
  return (
    <div
      className={`report-psychometric-card ${
        instrument.assessmentName === 'IMK' ? 'is-imk' : ''
      }`}
    >
      <div className="report-psychometric-card-header">
        <span>{instrument.shortLabel}</span>
        <strong>{instrument.title}</strong>
      </div>

      {!instrument.hasData ? (
        <div className="report-empty-state">{instrument.emptyLabel}</div>
      ) : (
        <>
          <div className="report-psychometric-code">
            <span>{instrument.valueLabel}</span>
            <strong>{instrument.code || '-'}</strong>
            {instrument.expandedCode ? <p>{instrument.expandedCode}</p> : null}
          </div>

          {instrument.assessmentName === 'IMK' && instrument.radar?.length ? (
            <PrintRadar
              data={instrument.radar}
              maxValue={instrument.maxScore}
              ariaLabel={`Radar IMK RIASEK`}
            />
          ) : (
            <PsychometricScoreList scores={instrument.topScores} />
          )}

          <p className="report-psychometric-comment">{instrument.comment}</p>
        </>
      )}
    </div>
  )
}

export default function Student360PrintReport({ report, schoolInfo, academicYear }) {
  const logoUrl = schoolInfo?.logo_url || '/edutrack-logo.png'

  return (
    <article className="print-student-report">
      <header className="report-header">
        <div className="report-logo-box">
          <img src={logoUrl} alt={`Logo ${schoolInfo?.school_name || 'sekolah'}`} />
        </div>
        <div className="report-header-copy">
          <div className="report-school-name">{schoolInfo?.school_name || 'Nama sekolah'}</div>
          {schoolInfo?.school_code ? (
            <div className="report-school-code">Kod sekolah: {schoolInfo.school_code}</div>
          ) : null}
          <h1>LAPORAN PROFIL MURID 360°</h1>
          <div className="report-subtitle">PBS Bersepadu | Tahun Akademik {academicYear}</div>
        </div>
        <div className="report-document-badge">
          <img className="report-document-logo" src="/edutrack-logo.png" alt="Logo EduTrack" />
          <span>Laporan Individu</span>
        </div>
      </header>

      <section className="report-student-meta">
        <div className="report-meta-wide">
          <span>Nama Murid</span>
          <strong>{report.studentName}</strong>
        </div>
        <div>
          <span>Kelas</span>
          <strong>{report.className}</strong>
        </div>
        <div>
          <span>Tingkatan</span>
          <strong>{report.levelName}</strong>
        </div>
        <div>
          <span>No. KP</span>
          <strong>{report.icNumber || '-'}</strong>
        </div>
      </section>

      <section className="report-section">
        <h2>1. Ringkasan Akademik</h2>
        <div className="report-metric-grid">
          <AcademicMetric
            label="GP Murid"
            value={
              report.academic.gp === null ? 'Tidak tersedia' : formatNumber(report.academic.gp, 2)
            }
            note={report.academic.examName || 'Peperiksaan belum direkodkan'}
          />
          <AcademicMetric
            label="Peratus Keseluruhan"
            value={
              report.academic.averageMark === null
                ? 'Tidak tersedia'
                : `${formatNumber(report.academic.averageMark, 1)}%`
            }
            note={`${report.academic.subjectCount || 0} subjek dinilai`}
          />
          <AcademicMetric
            label="Gred Dominan"
            value={report.academic.dominantGrade || 'Tidak tersedia'}
            note="Peperiksaan terkini"
          />
          <AcademicMetric
            label="Kedudukan Dalam Kelas"
            value={
              report.classRanking?.rank
                ? `${report.classRanking.rank} / ${report.classRanking.classStudentCount}`
                : 'Tidak tersedia'
            }
            note={
              report.classRanking?.rank
                ? `${report.classRanking.rankedCount} murid mempunyai GP`
                : 'GP kelas belum lengkap'
            }
          />
        </div>
        <div className="report-subject-heading">Senarai Subjek dan Gred</div>
        <SubjectResults results={report.academic.subjectResults} />
      </section>

      <section className="report-main-grid">
        <div className="report-section report-radar-section">
          <h2>2. Radar PBS Bersepadu</h2>
          <PrintRadar
            data={report.pbsRadar}
            ariaLabel={`Radar PBS Bersepadu untuk ${report.studentName}`}
          />
          <p className="report-fine-print">
            Semua paksi dinormalisasi kepada skala 0-100.
            {report.academic.gpRange
              ? ` GP menggunakan julat ${formatNumber(report.academic.gpRange.best, 0)}-${formatNumber(report.academic.gpRange.worst, 0)} daripada tetapan gred ${report.levelName}; GP lebih rendah menghasilkan skor radar lebih tinggi.`
              : ' Julat GP daripada tetapan gred belum tersedia.'}{' '}
            BMI tidak dimasukkan dalam radar.
          </p>
        </div>

        <div className="report-section">
          <h2>3. Butiran PBS</h2>
          <div className="report-pbs-details">
            <PbsDetail
              label="PBD"
              value={report.pbd.displayValue}
              detail={report.pbd.detail}
            />
            <PbsDetail
              label="SEGAK"
              value={report.segak.displayValue}
              detail={report.segak.detail}
            />
            <PbsDetail
              label="PAJSK"
              value={report.pajsk.displayValue}
              detail={report.pajsk.detail}
            />
            <PbsDetail
              label="BMI"
              value={report.segak.bmiDisplayValue}
              detail={report.segak.bmiDetail}
            />
          </div>
        </div>
      </section>

      <section className="report-section report-pbd-subject-section">
        <h2>4. Radar PBD Mengikut Subjek</h2>
        <p className="report-section-subtitle">
          Tahap Penguasaan PBD bagi subjek yang diambil oleh murid.
        </p>
        <PbdSubjectRadar data={report.pbdSubjectRadarData} />
      </section>

      <section className="report-section report-psychometric-section">
        <h2>5. Psikometrik</h2>
        <p className="report-section-subtitle">
          Inventori Minat Kerjaya (IMK), Inventori Tret Personaliti (ITP) dan Aptitud Khusus.
        </p>
        {!report.psychometric.hasData ? (
          <div className="report-empty-state">
            Data psikometrik IMK, ITP dan Aptitud Khusus belum tersedia.
          </div>
        ) : (
          <div className="report-psychometric-grid">
            {report.psychometric.instrumentList.map((instrument) => (
              <PsychometricCard key={instrument.assessmentName} instrument={instrument} />
            ))}
          </div>
        )}
      </section>

      <section className="report-section report-summary-section">
        <h2>6. Rumusan Profil Murid</h2>
        <p>{report.summarySentences.join(' ')}</p>
      </section>

      <footer className="report-footer">
        <span>Dijana melalui EduTrack</span>
        <span>{report.studentName} | {report.className} | {academicYear}</span>
      </footer>
    </article>
  )
}
