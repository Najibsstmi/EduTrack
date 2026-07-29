import assert from 'node:assert/strict'
import test from 'node:test'

import {
  getGradeNumber,
  parsePsychometricHtmlTable,
  preparePsychometricPreview,
} from '../src/lib/psychometricImport.js'

const baseClasses = [
  { id: 'class-tingkatan-1-balada', tingkatan: 'Tingkatan 1', class_name: 'BALADA' },
  { id: 'class-tingkatan-2-inang', tingkatan: 'Tingkatan 2', class_name: 'INANG' },
]

const baseEnrollments = [
  {
    id: 'enrollment-imk-1',
    class_id: 'class-tingkatan-1-balada',
    student_profile_id: 'student-imk-1',
    student_profiles: {
      full_name: 'ABSAREENA AL-AFLAQ BINTI MOHD FARHAN AL-FIRDAUS',
      ic_number: '130906060380',
    },
  },
  {
    id: 'enrollment-itp-1',
    class_id: 'class-tingkatan-2-inang',
    student_profile_id: 'student-itp-1',
    student_profiles: {
      full_name: 'ABDUL AZIM BIN MESRAN',
      ic_number: '121025010135',
    },
  },
]

test('getGradeNumber menerima nombor dan perkataan tingkatan', () => {
  assert.equal(getGradeNumber('Tingkatan/Tahun: TINGKATAN DUA'), '2')
  assert.equal(getGradeNumber('Nama Aktiviti: INVENTORI MINAT KERJAYA TINGKATAN SATU'), '1')
  assert.equal(getGradeNumber('DATA ITP T4.xls'), '4')
})

test('preview IMK menerima export HTML .xls lama dengan tingkatan pada tajuk', () => {
  const html = `
    <table border="1">
      <tr><th colspan="14">Nama Aktiviti: INVENTORI MINAT KERJAYA TINGKATAN SATU</th></tr>
      <tr>
        <th>Bil</th><th>Nama</th><th>ID Pengenalan</th><th>Kelas</th><th>Jantina</th>
        <th>R</th><th>I</th><th>A</th><th>S</th><th>E</th><th>K</th>
        <th>Tiga Mata Holland</th><th>Index Perbezaan</th><th>Status Taksir</th>
      </tr>
      <tr>
        <td>1</td><td>ABSAREENA AL-AFLAQ BINTI MOHD FARHAN AL-FIRDAUS</td>
        <td>130906060380</td><td>BALADA</td><td>P</td>
        <td>10</td><td>13</td><td>7</td><td>16</td><td>10</td><td>18</td>
        <td>K: 18 | S: 16 | I: 13</td><td>11</td><td>SELESAI</td>
      </tr>
    </table>
  `
  const tableRows = parsePsychometricHtmlTable(html)
  const previewRows = preparePsychometricPreview({
    tableRows,
    classes: baseClasses,
    enrollments: baseEnrollments,
    assessmentName: 'IMK',
  })

  assert.equal(previewRows.length, 1)
  assert.equal(previewRows[0].match_status, 'matched')
  assert.equal(previewRows[0].grade_label, 'Tingkatan 1')
  assert.equal(previewRows[0].dominant_code, 'KSI')
})

test('preview ITP menerima export HTML .xls lama dengan header prefiks instrumen', () => {
  const html = `
    <table border="1">
      <tr><th colspan="22">Tingkatan/Tahun: TINGKATAN DUA</th></tr>
      <tr>
        <th>Bil</th><th>Nama</th><th>ID Pengenalan</th><th>Kelas</th><th>Jantina</th>
        <th>[ITP] AUT</th><th>[ITP] KTF</th><th>[ITP] AGF</th><th>[ITP] EKT</th>
        <th>[ITP] PCP</th><th>[ITP] KPG</th><th>[ITP] ITL</th><th>[ITP] KPN</th>
        <th>[ITP] STR</th><th>[ITP] RSL</th><th>[ITP] MLG</th><th>[ITP] ATL</th>
        <th>[ITP] KD</th><th>[ITP] WSN</th><th>[ITP] KTN</th>
        <th>[ITP] Jumlah Keseluruhan</th><th>Status ITP</th>
      </tr>
      <tr>
        <td>1</td><td>ABDUL AZIM BIN MESRAN</td><td>121025010135</td><td>INANG</td><td>L</td>
        <td>8</td><td>7</td><td>7</td><td>6</td><td>10</td><td>10</td><td>10</td><td>8</td>
        <td>6</td><td>10</td><td>9</td><td>10</td><td>8</td><td>9</td><td>5</td>
        <td>123</td><td>SELESAI</td>
      </tr>
    </table>
  `
  const tableRows = parsePsychometricHtmlTable(html)
  const previewRows = preparePsychometricPreview({
    tableRows,
    classes: baseClasses,
    enrollments: baseEnrollments,
    assessmentName: 'ITP',
  })

  assert.equal(previewRows.length, 1)
  assert.equal(previewRows[0].match_status, 'matched')
  assert.equal(previewRows[0].source_grade_label, 'Tingkatan 2')
  assert.equal(previewRows[0].raw_data.AUT, 8)
  assert.equal(previewRows[0].dominant_code, 'PCP-KPG-ITL')
})

test('preview psikometrik memerlukan tingkatan jika fail tidak menyediakannya', () => {
  assert.throws(
    () =>
      preparePsychometricPreview({
        tableRows: [
          ['Nama', 'ID Pengenalan', 'Kelas', 'R', 'I', 'A', 'S', 'E', 'K'],
          ['Murid Tanpa Tingkatan', '000101010000', 'BALADA', 1, 2, 3, 4, 5, 6],
        ],
        classes: baseClasses,
        enrollments: baseEnrollments,
        assessmentName: 'IMK',
      }),
    /tingkatan/
  )
})
