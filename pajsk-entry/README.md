# PAJSK Entry

Frontend berasingan untuk merekod aktiviti, penglibatan dan pencapaian murid Sekolah Seni Malaysia Johor. Aplikasi ini menggunakan projek Supabase yang sama dengan EduTrack dan tidak menyalin rekod murid ke pangkalan data lain.

## Aliran utama

1. Guru masuk menggunakan kod akses yang unik.
2. Guru mendaftarkan aktiviti terlebih dahulu.
3. Murid dicari mengikut nama, tingkatan, kelas atau bidang seni.
4. Penglibatan dan pencapaian boleh diterapkan secara pukal atau diubah bagi setiap murid.
5. Semua rekod disemak dan disimpan dalam satu transaksi pangkalan data.
6. Admin boleh mempratonton fail bidang seni 2026; hanya IC, nama dan kelas aktif yang sepadan akan dikemas kini.

## Pembangunan lokal

```bash
npm install
copy .env.example .env
npm run dev
```

Isi `VITE_SUPABASE_URL` dan `VITE_SUPABASE_ANON_KEY` menggunakan nilai projek EduTrack.

## Supabase

Jalankan migrasi `20261111000400_create_pajsk_entry.sql`, kemudian tetapkan secret fungsi:

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
