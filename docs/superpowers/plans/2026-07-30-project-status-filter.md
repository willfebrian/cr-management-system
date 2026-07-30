# Project Status Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Menyamakan tampilan dropdown status Project Report dengan search field dan kontrol form aplikasi.

**Architecture:** Pertahankan native `select` untuk perilaku dan aksesibilitas, lalu tempatkan di wrapper presentasional yang menyediakan border, focus ring, dan chevron konsisten. Validasi struktur melalui source/CSS contract test dan hasil akhirnya melalui browser.

**Tech Stack:** React, TypeScript, CSS, Node test runner, Vite.

## Global Constraints

- Tidak mengubah data atau logika filtering Project Report.
- Tidak mengubah template ticket, email, atau Form CR.
- Tidak menambahkan dependency.
- Pertahankan responsive stacking pada breakpoint maksimal 780 px.

---

### Task 1: Project status filter styling

**Files:**
- Modify: `src/client/pages/App.tsx`
- Modify: `src/client/styles.css`
- Modify: `scripts/visual-consistency-contract.test.mjs`

**Interfaces:**
- Consumes: state `status` dan handler `setStatus` yang sudah ada.
- Produces: wrapper `.project-status-filter` dengan native select berlabel `Project status`.

- [ ] **Step 1: Write the failing contract test**

Tambahkan assertion bahwa `App.tsx` memiliki wrapper `.project-status-filter`, `aria-label="Project status"`, dan `ChevronDown`, serta CSS memiliki `appearance: none` dan focus-within.

- [ ] **Step 2: Run the contract test and verify RED**

Run: `node scripts/visual-consistency-contract.test.mjs`

Expected: FAIL karena wrapper dan aturan select custom belum tersedia.

- [ ] **Step 3: Implement the minimal markup and CSS**

Ganti select langsung dengan wrapper:

```tsx
<label className="project-status-filter">
  <select aria-label="Project status" value={status} onChange={(event) => setStatus(event.target.value)}>
    ...
  </select>
  <ChevronDown size={16} aria-hidden="true" />
</label>
```

Styling wrapper harus menggunakan tinggi 40 px, border aplikasi, radius 6 px, background putih, focus ring teal, select transparan dengan `appearance: none`, dan ikon yang tidak menerima pointer event.

- [ ] **Step 4: Run the contract test and verify GREEN**

Run: `node scripts/visual-consistency-contract.test.mjs`

Expected: PASS.

- [ ] **Step 5: Run full verification**

Run: `npm test`

Expected: seluruh test PASS.

Run: `npm run build`

Expected: TypeScript dan Vite build berhasil.

- [ ] **Step 6: Verify in browser**

Pastikan search dan filter segaris dengan tinggi 40 px pada desktop, filter melebar penuh saat toolbar menjadi satu kolom pada viewport maksimal 780 px, tidak ada horizontal page overflow, dan console tidak memiliki error.
