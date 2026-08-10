# CR Management System - Outstanding Handoff

> This document is the canonical handoff for the next chat. The original UI outstanding below is historical context; the current runtime and SAP outstanding are listed in the latest sections.

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

## Current Runtime Status (2026-08-10)

The web flows required by CR Management System now use local runtime files inside this project. The runtime must not depend on `D:\Discovery AI\SAP-Agent-Discovery-Platform`.

Local SAP runtime used by the web:

- `scripts/sap-discovery.mjs` for CR discovery, Sync CR, CR detail, and transport logs.
- `mcp/sap/*` for SAP client, landscape, gateway, tools, analyzer, and audit support.
- `scripts/cr-transport-request.mjs` plus local transport-request modules for Create CR Transport.

`SAP_AGENT_PLATFORM_DIR` and external connector mode are not supported. `SAP_DISCOVERY_SCRIPT` must be a relative path inside this project. The platform repository remains separate analysis/development context only.

Create CR Transport currently supports Master Data targets, including DEV NC, DEV AIX, and active development-capable Sandbox targets such as TRS. Target validation remains restricted to active development/sandbox systems, RFC user `TRSTDEV`, and package `ZTRD`.

## Latest Completed Enhancements

- Create CR Transport runtime moved into this project.
- Dynamic SAP target resolution from `sap_systems` with server-side credential handling.
- Approval secret required only for actual Create; Resolve and Preflight remain read-only.
- Partial SAP Object autocomplete: minimum 3 characters, 350 ms debounce, stale-response protection.
- Legacy external SAP runtime fallback removed from production web flows.
- `npm run build` and runtime isolation tests passed after the latest cleanup.
- RFC source reference for partial matching is available at `ZRFC_TRANSPORT_OBJECT_RESOLVE.partial.abap`.

## Current SAP Outstanding

1. Copy the updated `ZRFC_TRANSPORT_OBJECT_RESOLVE.partial.abap` source into SE37 on DEV NC and DEV AIX.
2. Run syntax check and activate the Function Module on both servers.
3. Test partial searches such as `ZZK`, partial TCode, and partial function-module names on both targets.
4. Confirm result ordering and result limits when the RFC returns many candidates.
5. Test multi-object preflight and ensure no SAP request is created if any object fails.
6. Verify duplicate Create behavior after objects are assigned to a request.

## Portability Rules

- Do not restore references to `SAP-Agent-Discovery-Platform` in production runtime code.
- Do not commit `.env` passwords or `SAP_ABAP_ACTION_APPROVAL_SECRET`.
- Every new machine needs its own `.env`, database connection, SAP target credentials, and approval secret.
- Preserve user changes in the dirty worktree; do not reset unrelated changes.

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
