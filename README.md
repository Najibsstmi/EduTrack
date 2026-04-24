# EduTrack

EduTrack ialah sistem pemantauan akademik sekolah berasaskan web. Aplikasi ini membantu admin sekolah mengurus tetapan akademik, data murid, kelas, subjek, markah peperiksaan, sasaran akademik, dan analisis prestasi.

## Ciri Utama

- Pendaftaran pengguna dengan aliran kelulusan admin
- Dashboard master admin dan school admin
- Tetapan sekolah untuk tahun akademik, kelas, subjek, peperiksaan, dan gred
- Import murid dan markah melalui CSV
- Pengurusan markah, sasaran TOV/OTR/ETR, dan status akses peperiksaan
- Analisis kelas, analisis individu murid, dan trend subjek
- Sokongan PWA untuk pemasangan ke peranti

## Tech Stack

- React
- Vite
- Tailwind CSS
- Supabase
- React Router
- Vite PWA
- Vercel

## Keperluan

- Node.js 20 atau lebih baharu
- Akaun dan projek Supabase
- Environment variables seperti dalam `.env.example`

## Setup Lokal

```bash
npm ci
cp .env.example .env
npm run dev
```

Isi nilai Supabase dalam `.env` sebelum menjalankan aplikasi.

## Skrip

```bash
npm run dev
npm run build
npm run lint
npm run preview
```

## Environment Variables

```bash
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

## Deployment

Repo ini disediakan untuk deploy ke Vercel. Pastikan environment variables Supabase ditetapkan di dashboard Vercel sebelum deploy production.

## Status Projek

EduTrack masih aktif dibangunkan. Sebelum release production, semak lint, build, dependency audit, Supabase RLS policies, dan aliran authorization untuk setiap role.
