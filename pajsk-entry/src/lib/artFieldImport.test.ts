import { describe, expect, it } from 'vitest'
import { parseArtFieldImport, parseCsv } from './artFieldImport'

describe('parseCsv', () => {
  it('membaca koma dan tanda petik dalam sel', () => {
    expect(parseCsv('name,note\n"ALI, BIN ABU","kata ""uji"""')).toEqual([
      ['name', 'note'],
      ['ALI, BIN ABU', 'kata "uji"'],
    ])
  })
})

describe('parseArtFieldImport', () => {
  it('menormalisasi IC tanpa sengkang', () => {
    const rows = parseArtFieldImport(
      'document_class,document_row,student_name,normalized_ic,art_field\n1 BALADA,2,MURID UJIAN,130101-01-0001,Seni Tari'
    )
    expect(rows[0]).toMatchObject({
      document_class: '1 BALADA',
      document_row: 2,
      normalized_ic: '130101010001',
      art_field: 'Seni Tari',
    })
  })
})
