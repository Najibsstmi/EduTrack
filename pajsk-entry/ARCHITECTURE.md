# Seni bina PAJSK Entry MVP

## Audit EduTrack

- Murid disimpan dalam `student_profiles`; `id` kekal sebagai kunci hubungan dalaman dan nombor kad pengenalan kekal sebagai kunci pemadanan rentas sistem.
- Enrollment tahunan berada dalam `student_enrollments` dan dirangkaikan kepada `classes` melalui `class_id`.
- Sekolah diasingkan menggunakan `school_id`. Skop MVP dihadkan kepada sekolah berkod `JEA1091`.
- `student_profiles.art_field` sudah tersedia dan dihadkan kepada empat nilai SSeMJ: Seni Tari, Seni Muzik, Seni Teater dan Seni Visual. Data 2026 perlu melalui pratonton padanan sebelum diisi.
- EduTrack sudah mempunyai `student_pajsk_segak`, `student_pajsk_kokurikulum` dan `student_pajsk_ekstra`. Dua jadual terakhir ialah ringkasan seorang murid bagi setahun dan tidak sesuai untuk penyertaan banyak murid dalam satu aktiviti.
- Pengguna EduTrack menggunakan Supabase Auth dan polisi RLS berasaskan `is_active_school_member` serta `is_active_school_admin`.
- Tahun akademik semasa datang daripada `school_setup_configs`; sejarah kelas dan enrollment dipisahkan mengikut `academic_year`.

## Rujukan PAJSK yang disahkan

Garis panduan sekolah menengah menetapkan tiga komponen PAJSK: SEGAK, Kokurikulum dan Ekstra Kurikulum. Kokurikulum merangkumi Kelab/Persatuan, Pasukan Badan Beruniform serta Sukan/Permainan.

MVP menyimpan pilihan rasmi berikut tanpa mengira skor:

- Penglibatan I, II dan III.
- Peringkat Sekolah, Daerah/Zon, Negeri, Kebangsaan dan Antarabangsa.
- Pencapaian Tiada, Johan, Naib Johan, Ketiga, Keempat dan Kelima.
- Khidmat Sumbangan: Atlet/Peserta, Kemahiran Khusus, Persembahan dan Sokongan.

Skor dalam helaian 2024 tidak dipindahkan ke enjin aplikasi. Lajur `score` dalam jadual rujukan dibiarkan kosong sehingga semua peraturan, edisi dokumen dan formula dipersetujui.

## Jadual baharu

| Jadual | Tujuan |
| --- | --- |
| `pajsk_teacher_access` | Identiti guru, peranan dan pengesah kod berhash. |
| `pajsk_teacher_sessions` | Token sesi rawak berhash dan tamat selepas lapan jam. |
| `pajsk_login_attempts` | Had cubaan mengikut cap jari kod dan alamat rangkaian berhash. |
| `pajsk_classification_options` | Pilihan terkawal yang disahkan daripada panduan. |
| `pajsk_activities` | Maklumat induk aktiviti/program. |
| `pajsk_activity_participants` | Penglibatan dan pencapaian setiap murid beserta snapshot sejarah. |
| `pajsk_audit_logs` | Jejak penciptaan, perubahan, pembatalan dan pengurusan akses. |

View `pajsk_student_activity_history` menyediakan bacaan terus kepada EduTrack melalui RLS sekolah. RPC import bidang seni memadankan IC selepas membuang sengkang dan ruang, tetapi hanya menulis apabila IC unik, nama sepadan, kelas 2026 sepadan dan enrolmen masih aktif.

## Keselamatan

- Kod akses tidak disimpan sebagai teks biasa. Carian kod menggunakan HMAC dan pengesahan menggunakan PBKDF2-SHA-256 dengan salt unik serta pepper pelayan.
- Token sesi 256-bit hanya dipulangkan sekali dan disimpan dalam `sessionStorage`; pangkalan data hanya menyimpan SHA-256 token.
- Cubaan gagal dihadkan kepada 10 bagi alamat rangkaian dan 5 bagi kod dalam 15 minit. Kod turut dikunci sementara selepas lima kegagalan.
- Frontend tidak menerima service-role key. Semua operasi PAJSK melalui Edge Function yang mengesahkan sesi, sekolah dan peranan.
- EduTrack boleh membaca aktiviti dan peserta melalui RLS sekolah sedia ada. Penulisan dilakukan oleh fungsi pelayan dan RPC atomik sahaja.
- Nombor kad pengenalan tidak dipulangkan oleh carian murid.

## Integrasi dan sejarah

`pajsk_activity_participants` menyimpan kedua-dua `student_profile_id` dan `student_enrollment_id`. Nama, tingkatan, kelas dan bidang seni turut disimpan sebagai snapshot supaya sejarah tidak berubah apabila murid bertukar kelas, berpindah atau tamat sekolah. Pembatalan menggunakan status dan `is_active`; rekod pencapaian tidak dipadam keras.

## Deployment

- Projek Vercel baharu hendaklah menggunakan root directory `pajsk-entry` dan domain `pajsk.cikgustem.com`.
- Projek Supabase kekal projek EduTrack yang sama.
- Migrasi perlu disemak dan diaplikasikan dahulu, diikuti secret Edge Function dan deployment `pajsk-api`.
- Admin sekolah menjana kod admin pertama di `/admin/setup` menggunakan Supabase Auth EduTrack. Kata laluan tidak disimpan oleh aplikasi.
