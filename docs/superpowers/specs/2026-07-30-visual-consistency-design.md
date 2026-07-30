# Visual Consistency Design

## Goal

Menyelaraskan hierarki visual, card usage, header, scrolling, dan responsive behavior pada CR Management System tanpa mengubah alur data, database, Sync CR, maupun tampilan isi template ticket, email, dan Form CR.

## Decisions

### Shared page header

- Judul dan deskripsi berada di sisi kiri.
- Source Systems, Sync Mode, period/lookback input, dan Sync CR berada di sisi kanan.
- Toolbar kanan membungkus dalam areanya sendiri dan turun ke bawah judul hanya ketika ruang benar-benar tidak cukup.
- Deskripsi halaman tidak boleh terpotong.

### Card hierarchy

- Level halaman tidak memakai card.
- Card hanya dipakai untuk data workspace, section editor yang aktif, warning/actionable group, atau bounded form.
- Metadata ringkas memakai summary strip dengan divider, bukan kumpulan nested card.
- Semua item summary strip rata atas; nilai multi-nama ditampilkan satu nama per baris agar kolom lain tidak bergeser secara vertikal.
- Repeated clickable items memakai compact rows dengan hover, focus ring, dan chevron.

### CR Transport

- Filter, tabel, dan pagination membentuk satu data workspace.
- Baris CR tetap table rows; tidak diubah menjadi card.
- Header tabel sticky.
- Tampilan desktop mengutamakan CR, Description, dan Lifecycle tanpa horizontal scroll yang tidak perlu.
- Detail CR memakai summary strip untuk Owner, Target, Type, dan Changed.
- Related Issues memakai divider rows ringan dengan chevron; Lifecycle, Tasks, dan Objects tetap section terpisah dengan heading dan divider yang konsisten.

### Issue Report

- Menggunakan controlled dual-pane workspace.
- Issue List dan Issue Detail dapat di-scroll secara independen.
- Header/filter tidak ikut menjadi area scroll panel.
- Tidak ada scrollbar vertikal ketiga pada workspace utama ketika viewport desktop mencukupi.
- Kolom default berfokus pada Issue, Name, ABAPer, CR SAP, dan Status/Completeness.
- GLPI dan CR Helpdesk tetap tersedia melalui panel detail dan dapat diaktifkan dari Columns menu.
- Horizontal scroll tetap menjadi fallback saat kolom tambahan aktif atau viewport sempit.
- Metadata detail memakai summary strip; card khusus dipertahankan untuk Incomplete items.
- Incomplete items tetap terlihat sebagai actionable group, tetapi permukaan, border, dan chip memakai warna netral; amber hanya menjadi aksen warning pada judul dan jumlah.

### Project Report

- Master-detail dipertahankan.
- Project list tetap compact rows.
- Owner, Created, Issues, dan CR SAP digabung menjadi summary strip.
- Linked Issues menjadi clickable rows ringan dengan chevron, bukan card individual berat.

### Cross-report alignment

- CR Transport, Issue Report, dan Project Report mempertahankan struktur masing-masing.
- Selected row memakai surface teal lembut dan indikator kiri yang sama.
- Repeated rows memakai divider, hover, dan focus-visible yang sama tanpa dipaksa menjadi card.
- Detail section memakai ritme heading, divider, dan spacing yang sama.
- Project Report menjadi acuan kejernihan hierarki; CR Transport tetap menjadi acuan tabel operasional; Issue Report mempertahankan kelengkapan datanya.

### Editor and sticky Actions

- Actions memakai `position: sticky; bottom: 0` di dalam batas editor.
- Actions langsung terlihat saat editor dibuka.
- Editor menyediakan bottom safe space minimal setinggi action bar agar field terakhir tidak tertutup.
- Selection/summary menggunakan toolbar dan strip; section editor aktif menggunakan card; section tertutup menggunakan compact divider rows.

### Dashboard, sidebar, and administration

- Dashboard metric grid tidak meninggalkan slot kosong yang dominan pada layar lebar.
- Sidebar hanya membuka satu grup submenu pada satu waktu.
- Focus ring menggunakan teal yang konsisten.
- User Management mengikuti pola form workspace dan table workspace tanpa nested card yang tidak perlu.

## Responsive Rules

- Target utama: 1920x1080, 1366x768, dan 1280x720.
- Verifikasi browser zoom 125% dan 150%.
- Header toolbar membungkus sebelum teks identitas terpotong.
- Master-detail menjadi satu kolom pada viewport sempit.
- Horizontal table scrolling hanya menjadi fallback saat kolom tidak dapat dipadatkan lagi.

## Accessibility and States

- Hover, selected, focus-visible, expanded, collapsed, disabled, loading, empty, error, dan success state harus konsisten.
- Status selalu memiliki label teks; warna bukan satu-satunya pembeda.
- Muted text dan focus ring harus mempertahankan kontras yang terbaca.

## Constraints

- Jangan mengubah data database atau kontrak API.
- Pertahankan semua behavior Sync CR.
- Jangan mengubah typography/font isi generated ticket, email, atau Form CR.
- Pertahankan perubahan aktif milik user.
- Hindari dependency baru dan refactor besar.
