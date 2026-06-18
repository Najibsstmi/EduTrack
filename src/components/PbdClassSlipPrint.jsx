import './PbdClassSlipPrint.css'

const formatGeneratedDate = (date = new Date()) =>
  new Intl.DateTimeFormat('ms-MY', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date)

export default function PbdClassSlipPrint({
  slips,
  schoolInfo,
  academicYear,
  datasetLabel,
}) {
  const generatedDate = formatGeneratedDate()

  return (
    <div className="pbd-slip-print-root" aria-hidden={!slips?.length}>
      {(slips || []).map((slip) => {
        const densityClass =
          slip.subjectRows.length > 18
            ? 'pbd-slip-page--very-dense'
            : slip.subjectRows.length > 12
              ? 'pbd-slip-page--dense'
              : ''

        return (
          <article key={slip.id} className={`pbd-slip-page ${densityClass}`}>
            <header className="pbd-slip-header">
              <div className="pbd-slip-school-logo">
                {schoolInfo?.logo_url ? (
                  <img src={schoolInfo.logo_url} alt={`Logo ${schoolInfo.school_name || 'sekolah'}`} />
                ) : (
                  <span>LOGO<br />SEKOLAH</span>
                )}
              </div>
              <div className="pbd-slip-header-copy">
                <div className="pbd-slip-school-name">{schoolInfo?.school_name || 'Nama sekolah'}</div>
                <div className="pbd-slip-school-code">Kod sekolah: {schoolInfo?.school_code || '-'}</div>
                <h1>LAPORAN PENTAKSIRAN BILIK DARJAH</h1>
                <div className="pbd-slip-subtitle">
                  Tahun Akademik {academicYear || '-'} | {datasetLabel || 'PBD Semasa'}
                </div>
              </div>
              <div className="pbd-slip-edutrack">
                <img src="/edutrack-logo.png" alt="Logo EduTrack" />
                <span>Slip Individu</span>
              </div>
            </header>

            <section className="pbd-slip-student-meta">
              <div className="pbd-slip-meta-wide">
                <span>Nama Murid</span>
                <strong>{slip.studentName}</strong>
              </div>
              <div>
                <span>No. KP</span>
                <strong>{slip.icNumber}</strong>
              </div>
              <div>
                <span>Kelas</span>
                <strong>{slip.className}</strong>
              </div>
              <div>
                <span>Tingkatan</span>
                <strong>{slip.levelName}</strong>
              </div>
            </section>

            <section className="pbd-slip-results">
              <h2>Pencapaian Mengikut Mata Pelajaran</h2>
              <table>
                <colgroup>
                  <col className="pbd-slip-col-number" />
                  <col className="pbd-slip-col-subject" />
                  <col className="pbd-slip-col-tp" />
                  <col />
                </colgroup>
                <thead>
                  <tr>
                    <th>Bil.</th>
                    <th>Mata Pelajaran</th>
                    <th>TP</th>
                    <th>Pernyataan TP</th>
                  </tr>
                </thead>
                <tbody>
                  {slip.subjectRows.length ? (
                    slip.subjectRows.map((row, index) => (
                      <tr key={row.subjectId}>
                        <td className="pbd-slip-center">{index + 1}</td>
                        <td className="pbd-slip-subject-name">{row.subjectName}</td>
                        <td className="pbd-slip-center pbd-slip-tp">{row.tpLabel}</td>
                        <td><div className="pbd-slip-statement">{row.statement}</div></td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="pbd-slip-empty">
                        Tiada subjek PBD untuk murid ini.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </section>

            <section className="pbd-slip-signatures" aria-label="Pengesahan laporan">
              <div className="pbd-slip-signature-block">
                <div className="pbd-slip-signature-label">Disediakan oleh,</div>
                <div className="pbd-slip-signature-line" />
                <div className="pbd-slip-signature-name">
                  (<span />)
                </div>
              </div>
              <div className="pbd-slip-signature-block">
                <div className="pbd-slip-signature-label">Disahkan oleh,</div>
                <div className="pbd-slip-signature-line" />
                <div className="pbd-slip-signature-name">
                  (<span />)
                </div>
              </div>
            </section>

            <footer className="pbd-slip-footer">
              <span>Tarikh dijana: {generatedDate}</span>
              <span>Laporan dijana oleh EduTrack</span>
            </footer>
          </article>
        )
      })}
    </div>
  )
}
