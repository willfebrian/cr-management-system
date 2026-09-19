# Checkpoint Migrasi Docker — CR Management System

Tanggal checkpoint: 20 September 2026 (WIB)
Status: Blueprint/alur deployment disepakati; implementasi dan switchover belum dijalankan.

## Kondisi Saat Ini

- Repository development: `/data/Projects/cr-management-system`
- Branch: `master`
- Commit saat pemeriksaan: `79f4402`
- Repository production: `/var/www/cr-management-system`
- Service production lama: `cr-management.service`
- Service lama aktif pada port `3001`.
- GitHub Actions self-hosted runner aktif.
- Workflow saat ini: `.github/workflows/main.yml`
- Workflow lama masih melakukan `git reset`, `npm install`, `npm run build`, lalu restart systemd.
- Folder production memiliki file Docker lokal yang belum masuk Git: `Dockerfile`, `docker-compose.yml`, dan `nginx-docker.conf`.
- Belum ada container/image CR Management yang aktif.

## Temuan yang Wajib Dikoreksi

- Repository development harus menjadi source of truth; jangan membuat perubahan utama langsung di `/var/www`.
- Compose lama memakai build context absolut `/var/www/cr-management-system`, sehingga tidak portabel.
- Bind mount seluruh source sebagai `/app:ro` akan menimpa isi image dan berisiko menghilangkan dependency/build hasil image.
- `proxy_pass http://cr-management:3001/;` memakai trailing slash dan berisiko membuang prefix `/api`; target seharusnya mempertahankan path API.
- Port produksi `3001` masih dipakai systemd lama, sehingga Docker wajib diuji dahulu pada port staging yang tidak bentrok.
- Database, `.env`, konfigurasi, dan data persisten tidak boleh dimasukkan ke image atau tertimpa saat deploy.

## Pipeline Target

1. Sinkronkan repository development di `/data/Projects/cr-management-system` dengan remote (`git fetch/pull`) dan pastikan working tree aman.
2. Buat/perbaiki Dockerfile, compose, konfigurasi Nginx, `.dockerignore`, dokumentasi deploy, healthcheck, serta strategi volume persisten di repository development.
3. Build image Docker dari commit yang sama dan jalankan container pada port staging.
4. Lakukan live-test lengkap tanpa menghentikan `cr-management.service` (zero downtime gate).
5. Setelah staging tervalidasi, lakukan switchover atomik ke container produksi dan baru nonaktifkan systemd lama.
6. Ubah `.github/workflows/main.yml` agar setiap push ke `master` otomatis men-deploy ke `/var/www/cr-management-system` menggunakan Docker Compose, bukan npm/systemd host.
7. Commit dan push perubahan dari repository development. Self-hosted runner kemudian otomatis memperbarui `/var/www`, membangun image, menjalankan healthcheck, dan mempertahankan/rollback layanan lama jika deploy gagal.
8. Verifikasi URL produksi, API, log, restart policy, data persisten, serta status container; lalu catat checkpoint final.

## Batas Keamanan

- Tidak menghentikan service systemd lama sebelum live-test staging tervalidasi.
- Tidak menyalin database atau `.env` ke Git/image.
- Tidak melakukan `docker compose down` pada layanan produksi sebelum container pengganti dinyatakan sehat.
- Push Git dilakukan setelah perubahan dan pengujian lokal lolos.
