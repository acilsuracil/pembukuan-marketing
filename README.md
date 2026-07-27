# Pembukuan Dompet USDT

Panel admin arus kas dompet USDT untuk beberapa brand, dengan login, peran
Admin/Staff, alur pengajuan, bukti transfer, dan kunci periode.

Data tersimpan di SQLite (`data/ledger.db`) dan bukti transfer di `data/bukti/`.
Tidak ada koneksi keluar sama sekali — tidak ada API pihak ketiga, tidak ada
telemetri.

Untuk menaikkan ke Railway + domain sendiri, lihat **[DEPLOY.md](DEPLOY.md)**.

## Jalankan lokal

```bash
npm install        # sekali saja
npm run dev        # http://localhost:3000
```

Buka aplikasinya — kalau belum ada akun, halaman **/setup** muncul sendiri untuk
membuat admin pertama.

Untuk mode produksi lokal:

```bash
npm run build && npm start
```

## Aturan kurs

Ini inti pembukuannya:

- **Uang masuk** — kamu isi **kurs beli** (Rp per 1 USDT) saat top-up. Ini yang
  jadi modal rupiah.
- **Uang keluar** — kurs **otomatis ikut pemasukan terakhir** yang terjadi pada
  atau sebelum tanggal transaksi itu. Field kurs boleh dikosongkan.
- Kalau ada pengeluaran dengan kurs khusus, isi field kurs untuk **override**.
  Kolom kurs di tabel menandai sumbernya: `kurs beli` / `warisan` / `override`.

Kurs warisan dihitung ulang dari data setiap kali ditampilkan, bukan disimpan.
Jadi kalau kamu menambahkan pemasukan yang terlewat secara backdate, semua
pengeluaran sesudahnya ikut menyesuaikan sendiri.

## Brand dan kategori

Keduanya dipakai bersamaan di satu transaksi:

- **Brand** — uangnya untuk siapa. Wajib diisi pada setiap pengeluaran.
- **Kategori** — uangnya untuk apa (iklan, server, gaji, …).

Saldo dompet adalah **satu kolam bersama**, bukan per brand. Yang dilaporkan per
brand adalah besar pemakaiannya, termasuk matriks brand × kategori di halaman
Laporan. Budget bulanan bisa dipasang di dua tingkat: per brand dan per kategori.

## Peran

| | Staff | Admin |
|---|---|---|
| Catat transaksi | ✅ langsung | ✅ langsung |
| Unggah bukti | ✅ | ✅ |
| Ubah transaksi | lewat pengajuan | ✅ langsung |
| Hapus transaksi | lewat pengajuan | ✅ langsung |
| Hapus bukti | hanya yang dia unggah | ✅ semua |
| Setujui/tolak pengajuan | ✕ | ✅ |
| Kelola brand & kategori | ✕ | ✅ |
| Kelola akun, kunci periode, log | ✕ | ✅ |

Pengajuan staff **tidak menyentuh data** sampai admin menyetujui. Halaman
Pengajuan menampilkan perbandingan nilai sekarang vs yang diusulkan, beserta
alasannya.

## Kunci periode

Admin → **Kunci periode** → pilih tanggal. Semua transaksi pada tanggal itu dan
sebelumnya tidak bisa ditambah, diubah, atau dihapus — berlaku untuk admin juga.
Kunci diperiksa ulang saat pengajuan disetujui, jadi pengajuan lama tidak bisa
menembus periode yang sudah dikunci setelahnya.

## Keamanan

- Password di-hash dengan **scrypt** (N=16384), dibandingkan dengan
  `timingSafeEqual`.
- Sesi berupa cookie bertanda-tangan HMAC-SHA256, `HttpOnly`, `SameSite=Lax`,
  dan `Secure` otomatis saat diakses lewat HTTPS. Umur 12 jam.
- Setiap sesi membawa `session_epoch`. Mengganti/me-reset password atau
  menonaktifkan akun menaikkan angka itu, sehingga **seluruh sesi lama langsung
  mati** — termasuk di perangkat yang sudah tidak dipegang.
- Login dibatasi 8 percobaan gagal per 10 menit **per username** (bukan per IP,
  karena header proxy bisa dipalsukan).
- Bukti transfer disajikan lewat route yang memeriksa sesi, bukan folder publik.
- Semua server action memeriksa peran dan kunci periode di server — bukan hanya
  menyembunyikan tombol di UI.
- Setiap aksi penting tercatat di log aktivitas (Admin → Log aktivitas).

## Fitur lain

- **Filter** rentang tanggal bebas per hari, plus preset (hari ini, kemarin, 7
  hari, 30 hari, bulan ini, bulan lalu) — dan filter brand, kategori, jenis,
  serta pencarian teks.
- **Sort** per kolom: tanggal, nominal USDT, nilai rupiah, brand, kategori,
  jenis — naik atau turun.
- **Ekspor CSV** mengikuti filter yang sedang aktif, delimiter `;` dan desimal
  koma supaya langsung rapi di Excel Indonesia.
- **Grafik** digambar sendiri sebagai SVG, tanpa library chart, dan sudah siap
  untuk mode terang maupun gelap.

## Stack

Next.js 16 (App Router, Server Actions) · React 19 · Tailwind v4 · `node:sqlite`
bawaan Node 22.5+ — tanpa dependensi database maupun charting eksternal.
