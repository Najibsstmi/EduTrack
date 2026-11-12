# PAJSK Entry

Frontend berasingan untuk merekod aktiviti, penglibatan dan pencapaian murid Sekolah Seni Malaysia Johor. Aplikasi ini menggunakan projek Supabase yang sama dengan EduTrack dan tidak menyalin rekod murid ke pangkalan data lain.

## Aliran utama

1. Guru masuk menggunakan kod akses yang unik.
2. Guru mendaftarkan aktiviti terlebih dahulu.
3. Murid dicari mengikut nama, tingkatan, kelas atau bidang seni.
4. Jenis penglibatan dan pencapaian dipilih serta diterapkan secara berasingan bagi setiap murid.
5. Skor penglibatan dan pencapaian dikira secara bebas mengikut jadual rasmi PAJSK dan peringkat aktiviti.
6. Kategori pertandingan disimpan sekali pada aktiviti; tiada butiran pencapaian berulang pada murid.
7. Semua rekod disemak dan disimpan dalam satu transaksi pangkalan data.
8. Admin boleh mempratonton fail bidang seni 2026; hanya IC, nama dan kelas aktif yang sepadan akan dikemas kini.

## Pembangunan lokal

```bash
npm install
copy .env.example .env
npm run dev
```

Isi `VITE_SUPABASE_URL` dan `VITE_SUPABASE_ANON_KEY` menggunakan nilai projek EduTrack.

## Supabase

Jalankan migrasi berikut mengikut urutan:

1. `20261111000400_create_pajsk_entry.sql`
2. `20261112000100_separate_pajsk_participation_achievement.sql`
3. `20261112000200_add_pajsk_analysis_api.sql`

Kemudian tetapkan secret fungsi:

```bash
supabase secrets set PAJSK_CODE_PEPPER=<nilai-rawak-sekurang-kurangnya-32-aksara>
supabase secrets set PAJSK_ALLOWED_ORIGINS=https://pajsk.cikgustem.com
supabase functions deploy pajsk-api --no-verify-jwt
```

`--no-verify-jwt` diperlukan kerana sesi PAJSK ialah token legap tersendiri. Fungsi tetap mengesahkan setiap token pelayan, sekolah, peranan dan tarikh tamat sebelum memproses permintaan.

## Import bidang seni

Halaman `Bidang Seni` hanya tersedia kepada admin. Fail CSV mesti mempunyai lajur `document_class`, `document_row`, `student_name`, `normalized_ic` dan `art_field`. Pratonton tidak menulis data. Semasa aplikasi sebenar, hanya baris berstatus `Padan` dikemas kini; IC berganda, nama/kelas tidak sepadan dan murid tanpa enrolmen aktif kekal sebagai pengecualian tanpa perubahan.

## Semakan

```bash
npm run lint
npm run test
npm run build
```
