# Project Status Filter Visual Design

## Goal

Menyelaraskan dropdown status pada toolbar Project Report dengan search field dan visual language kontrol form aplikasi.

## Design

- Search field dan status filter tetap menjadi dua kontrol terpisah dalam satu toolbar.
- Status filter berada di sisi kanan dengan lebar desktop 170 px dan tinggi 40 px.
- Select dibungkus elemen `.project-status-filter` agar border, radius, background, focus ring, dan ikon chevron tidak bergantung pada tampilan native browser.
- Native arrow disembunyikan dengan `appearance: none`; ikon `ChevronDown` menjadi indikator visual dan tidak menerima pointer event.
- Pada breakpoint maksimal 780 px, toolbar menjadi satu kolom dan status filter menggunakan lebar penuh.
- Perubahan tidak memengaruhi pilihan status, filtering, data Project, atau report lain.

## Accessibility

- Select tetap merupakan elemen HTML native dan diberi `aria-label="Project status"`.
- Focus ring menggunakan warna fokus aplikasi.
- Ikon chevron bersifat dekoratif dengan `aria-hidden="true"`.

## Verification

- Contract test memastikan wrapper, label aksesibel, chevron, dan aturan CSS utama tersedia.
- Full regression test dan production build harus lulus.
- QA browser memastikan search dan dropdown setinggi dan segaris pada desktop serta tersusun vertikal pada viewport 900 px atau lebih kecil.
