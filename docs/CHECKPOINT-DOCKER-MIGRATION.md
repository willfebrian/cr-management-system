# Checkpoint Migrasi Docker — CR Management System

Tanggal checkpoint: 20 September 2026 (WIB)
Status: Migrasi selesai; deployment production menggunakan Docker blue-green.

## Pembagian Direktori

- Development/source of truth: `/data/Projects/cr-management-system`
- Production checkout: `/var/www/cr-management-system`
- Branch deployment: `master`
- Environment rahasia production: `/var/www/cr-management-system/.env` (tidak masuk Git/image)
- State blue-green production: `/var/www/cr-management-system/.deploy`

## Arsitektur Production

- `cr-management-proxy` menerima trafik production di `127.0.0.1:3001`.
- Slot aplikasi bergantian:
  - blue: `127.0.0.1:3002`
  - green: `127.0.0.1:3003`
- Setiap image memuat frontend build, Express backend, dan SAP NW RFC SDK/runtime.
- PostgreSQL dan sumber GLPI tetap eksternal; tidak dipindahkan atau ditimpa oleh image.
- Container berjalan sebagai user non-root `node` dan memakai restart policy `unless-stopped`.
- Service lama `cr-management.service` sudah dihentikan dan dinonaktifkan setelah container pertama lolos health gate.

## Pipeline Otomatis

1. Push ke `master` memicu self-hosted GitHub Actions runner.
2. Runner menyinkronkan checkout production di `/var/www/cr-management-system` ke SHA yang dipush.
3. Runner memvalidasi Compose dan skrip deployment.
4. Image baru dibangun dari checkout production dengan tag SHA commit.
5. Slot pasif dijalankan dan harus lolos healthcheck aplikasi + database.
6. Konfigurasi proxy diarahkan ke slot baru dan Nginx di-reload tanpa memutus koneksi aktif.
7. Endpoint production diuji kembali, lalu slot lama dihentikan.
8. Jika kandidat tidak sehat, proxy dan slot aktif lama tidak disentuh.

## Bukti Verifikasi Migrasi Pertama

- Full test suite: 253 pengujian lulus (140 baseline + 45 project + 64 users + 4 integration).
- Build frontend/TypeScript production: berhasil.
- Build image Docker: berhasil.
- Staging port 3002: frontend HTTP 200, aplikasi sehat, database sehat.
- Runtime SAP: modul `node-rfc` berhasil dimuat di dalam container.
- GitHub Actions deployment pertama: `Succeeded`.
- Production checkout sesuai commit Git.
- Endpoint lokal `/api/health` dan `/api/health/database`: HTTP 200 / `ok=true`.
- Endpoint publik `https://cr.abap.web.id/`: HTTP 200.
- Endpoint publik `https://cr.abap.web.id/api/health/database`: `ok=true`.
- Container production sehat, restart count 0 saat verifikasi.

## File Deployment Resmi

- `Dockerfile`
- `.dockerignore`
- `docker-compose.yml`
- `scripts/deploy-docker.sh`
- `.github/workflows/main.yml`

Artefak Docker lama yang pernah dibuat langsung di `/var/www` bukan source of truth dan telah digantikan oleh versi repository development.
