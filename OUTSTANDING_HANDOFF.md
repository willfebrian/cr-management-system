# CR Management System - Outstanding Handoff

Dokumen ini menjadi konteks lanjutan untuk task Codex berikutnya. Project berada di:

`D:\Discovery AI\cr-management-system`

## Permintaan Terakhir

Lanjutkan enhancement konsistensi navigasi dan tampilan web dengan urutan berikut:

1. Ubah nama **CR Report** menjadi **CR Transport** pada sidebar dan judul halaman.
2. Pastikan daftar CR Transport selalu diurutkan berdasarkan nomor CR secara **descending**.
3. Susun sidebar menjadi:
   - Dashboard
   - CR Transport
   - Issue
   - Project
   - User Management
4. Tambahkan ikon pada tombol **Logout**.
5. Footer sidebar menampilkan username dan waktu **Last Login**.
6. Tambahkan deskripsi singkat tepat di bawah judul untuk:
   - Dashboard
   - CR Transport
   - User Management
   - Semua submenu Issue
   - Semua submenu Project
7. Rapikan **Project Report**:
   - Hapus heading/deskripsi internal yang menduplikasi judul halaman.
   - Hapus label dan catatan prototype.
   - Hapus tombol standalone `Add Issue`.
   - Hapus tombol standalone `Generate Project CR Form`.
   - Sediakan menu titik tiga pada detail Project yang berisi:
     - Add Issue
     - Generate Project CR Form
8. Rapikan Project Create dan Change agar tidak memiliki heading/deskripsi ganda.
9. Samakan typography dan spacing seluruh web mengikuti gaya menu Project.
10. Tambahkan ikon di sebelah kiri pada button yang memiliki teks.
11. Kontrol berikut harus tetap tersedia:
    - Source Systems
    - Sync Mode
    - Lookback Days
    - Sync CR

## Status Saat Handoff

Beberapa fondasi sudah tersedia, tetapi perubahan UI belum dituntaskan:

- Query CR backend sudah menggunakan `ORDER BY trkorr DESC`.
- Properti `lastLoginAt` sudah tersedia pada alur autentikasi backend dan client.
- Icon Lucide yang diperlukan sudah di-import di `App.tsx`.
- Script regression test sudah dibuat:
  - `scripts/regression-navigation-and-cr-sort.test.mjs`
- `App.tsx` masih menampilkan beberapa teks `CR Report`.
- Urutan sidebar masih menempatkan User Management sebelum Issue dan Project.
- Footer sidebar masih menampilkan username dan Logout versi lama.
- `ProjectPrototype` masih memiliki heading ganda, label prototype, dan tombol standalone.

## File Utama

- `src/client/pages/App.tsx`
- `src/client/styles.css`
- `src/server/db/crRepository.ts`
- `src/client/api.ts`
- `src/server/auth/authService.ts`
- `src/server/auth/middleware.ts`
- `src/server/routes/authRoutes.ts`
- `scripts/regression-navigation-and-cr-sort.test.mjs`

## Rekomendasi Implementasi

### Metadata Halaman

Tambahkan satu mapping metadata berdasarkan `View` untuk title dan description. Gunakan mapping tersebut pada topbar agar tidak memakai ternary panjang.

Contoh title:

- `dashboard`: Dashboard
- `report`: CR Transport
- `issue-display`: Issue Report
- `issue-create`: Create Issue
- `issue-change`: Change Issue
- `user-management`: User Management
- `project-report`: Project Report
- `project-create`: Create Project
- `project-change`: Change Project

### Sidebar

Urutan final:

1. Dashboard
2. CR Transport
3. Issue
4. Project
5. User Management

User Management hanya ditampilkan sesuai otoritas yang sudah berlaku.

### Project Actions

Gunakan tombol icon `MoreVertical` pada detail Project. Menu dropdown harus berisi `Add Issue` dan `Generate Project CR Form`.

### Footer Sidebar

Tampilkan:

- Username
- `Last login: <timestamp>` atau `First session`
- Tombol Logout dengan icon `LogOut`

## Batasan Penting

- Worktree mungkin memiliki perubahan lain milik user. Jangan revert perubahan yang tidak terkait.
- Pertahankan seluruh behavior Sync CR yang sudah ada.
- Jangan mengubah data database pada enhancement UI ini.
- Gunakan pola dan CSS yang sudah ada; hindari refactor besar yang tidak diperlukan.

## Verifikasi Wajib

Jalankan setelah implementasi:

```powershell
node scripts/regression-navigation-and-cr-sort.test.mjs
npm run build
npm test
```

Lakukan pengecekan visual pada browser untuk:

- Urutan sidebar.
- Nama CR Transport.
- Deskripsi halaman.
- Footer username, last login, dan Logout.
- Menu titik tiga Project.
- Sorting CR descending.
- Tidak ada layout yang overlap pada desktop.

