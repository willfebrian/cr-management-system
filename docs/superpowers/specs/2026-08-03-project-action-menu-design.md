# Project Report Action Menu Design

## Goal

Ringkas action di panel detail Project menjadi satu tombol ikon titik tiga yang selaras dengan Issue Report.

## Interaction

- Tombol `Project actions` memakai ikon `MoreVertical`, ukuran dan style `detail-icon-action` yang sudah digunakan Issue Report.
- Dropdown memakai `detail-action-menu-list` dan muncul di sisi kanan bawah tombol.
- Menu aktif berisi `Change Project`, `Generate CR Transport`, dan `Cancel Project`.
- Project cancelled menampilkan `Generate CR Transport` serta `Delete Project` hanya ketika user ADMIN dan project memenuhi aturan delete terbaru.
- Memilih item menutup dropdown sebelum menjalankan navigasi, generate, atau modal konfirmasi.
- Readiness modal, cancel modal, delete modal, validasi, dan aturan hak akses tidak berubah.

## Accessibility

- Trigger memiliki `aria-label`, `aria-haspopup="menu"`, dan `aria-expanded`.
- Container menggunakan `role="menu"`; setiap action menggunakan `role="menuitem"`.

## Verification

- Regression test memastikan tombol action langsung tidak lagi tampil, menu hanya muncul setelah trigger diklik, serta action yang diizinkan tetap tersedia.
- Jalankan seluruh test suite, production build, pemeriksaan browser, lalu restart backend.
