# Pembukuan Dompet USDT

Panel admin arus kas dompet USDT untuk beberapa brand, dengan login, peran
Admin/Staff, alur pengajuan, bukti transfer, dan kunci periode.

Data tersimpan di SQLite (`data/ledger.db`). Bukti transfer disimpan di bucket
**privat** Supabase Storage bila `SUPABASE_URL` + `SUPABASE_SERVICE_KEY` diisi,
atau di `data/bukti/` bila tidak — perpindahannya otomatis, dan berkas lama
tetap terbaca karena backend-nya dicatat per baris.

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

### Satu pembayaran untuk beberapa brand

Saat mencatat, brand boleh dicentang lebih dari satu. Porsi tiap brand diisi
sebagai **nominal USDT atau persen** — dua kolom yang saling mengejar, jadi
kesepakatan "600 USDT untuk A" dan "60% untuk A" sama-sama bisa ditulis apa
adanya. Ada tombol **Bagi rata** dan **Limpahkan sisa** untuk persen yang tidak
genap.

Saat disimpan, pembayarannya **dipecah jadi satu transaksi per brand**, masing-
masing sebesar porsinya. Biaya jaringan ikut dibagi mengikuti perbandingan
porsinya. Pecahan-pecahan itu diikat satu penanda grup, dan di daftar transaksi
ditandai `⧉ 1/3`.

Alasannya memecah baris, bukan menyimpan daftar brand di satu baris: setiap baris
tetap punya tepat satu brand, jadi seluruh laporan, matriks brand × kategori,
budget meter, filter, dan ekspor CSV tetap benar tanpa perlu diubah — dan saldo
dompet tetap pas karena jumlah pecahannya sama persis dengan nominal aslinya.
Jumlah porsi diperiksa di server sampai satuan terkecil (6 desimal); porsi yang
tidak berjumlah pas ditolak, bukan dibulatkan diam-diam.

Konsekuensi yang perlu diketahui:

- **Bukti transfer** menempel di porsi pertama — buktinya milik pembayarannya,
  bukan milik salah satu porsi — tapi ditampilkan di halaman detail setiap porsi.
- **Mengubah** hanya mengenai satu porsi. Kalau pembagiannya yang salah, hapus
  lalu catat ulang.
- **Menghapus** membuang seluruh porsi dalam grup itu, termasuk lewat persetujuan
  pengajuan staff. Menyisakan sebagian akan membuat pembukuan mencatat pembayaran
  yang lebih kecil dari kenyataan.
- **Fee agency** disimpan sebagai persen yang sama di tiap pecahan, supaya
  kesepakatan aslinya tetap terbaca. Karena tiap baris membulatkan hasilnya
  sendiri ke 2 desimal, totalnya bisa berbeda **maksimal 0,01 USDT** dari kalau
  dicatat sebagai satu baris (mis. 2% dari 1.000 dibagi rata 3 → 20,01 alih-alih
  20,00).

## Peran & izin

Tiga peran: **Owner**, **Admin**, **Staff**. Akun pertama yang dibuat otomatis
jadi Owner.

Yang menentukan boleh-tidaknya sebuah aksi bukan nama perannya, tapi **izin**.
Ada 12 izin — catat transaksi, ubah langsung, hapus langsung, unggah bukti,
hapus bukti milik siapa pun, putuskan pengajuan, kelola brand, kelola kategori,
kunci periode, kelola akun, lihat log, ekspor CSV.

- **Owner** selalu memegang seluruh izin dan tidak bisa dibatasi.
- **Admin** dan **Staff** memakai izin default per peran, yang bisa diubah
  Owner di **Admin → Peran & izin**.
- Tiap akun bisa diberi **izin khusus** yang menimpa default perannya, di
  **Admin → Akun → Kelola**.

Default bawaan: Admin memegang semua kecuali *Kelola akun*; Staff hanya *Catat
transaksi* dan *Unggah bukti*.

Kalau sebuah akun tidak punya izin **ubah** atau **hapus**, aksi itu otomatis
berubah jadi **pengajuan** yang menunggu keputusan pemegang izin *Putuskan
pengajuan*. Pengajuan **tidak menyentuh data** sampai disetujui, dan halaman
Pengajuan menampilkan perbandingan nilai sekarang vs yang diusulkan beserta
alasannya.

## Backup

Seluruh database dipotret otomatis setiap hari ke folder `backup/` pada bucket
Supabase yang sama (atau folder data lokal bila Supabase tidak dipakai).
Snapshot dibuat dengan `VACUUM INTO`, bukan menyalin berkasnya begitu saja —
menyalin database ber-WAL yang sedang dipakai bisa menghasilkan berkas rusak.

Retensinya bertingkat, jadi jangkauannya setahun dengan jumlah berkas tetap
kecil (~34):

- **harian** disimpan 14 hari
- **mingguan** disimpan 8 minggu
- **bulanan** disimpan 12 bulan

Di **Admin → Backup** (owner saja, karena snapshot memuat hash password semua
akun) tersedia tombol backup manual, unduh, hapus, dan **pulihkan**. Memulihkan
memotret kondisi sekarang lebih dulu, jadi keputusannya bisa dibalik, dan
menolak berkas yang bukan database aplikasi ini.

> Backup tersimpan di Supabase yang sama dengan bukti transfer dan dibuka dengan
> kunci yang sama. Sebulan sekali, **unduh satu snapshot ke laptop atau Google
> Drive** — itu satu-satunya salinan yang tidak ikut hilang kalau project
> Supabase-nya bermasalah.

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
- Bukti transfer disajikan lewat route yang memeriksa sesi, bukan URL publik.
  Kalau memakai Supabase, bucket-nya privat dan service key tidak pernah sampai
  ke browser — berkasnya diambil server lalu diteruskan.
- **Browser tidak pernah menyentuh database.** Semua baca-tulis lewat Server
  Component dan Server Action; klien hanya menerima hasil yang memang boleh dia
  lihat. Tidak ada kunci database di sisi klien, jadi tidak ada RLS yang perlu
  dikonfigurasi dan tidak ada SQL editor di panel admin.
- Semua server action memeriksa izin dan kunci periode di server — bukan hanya
  menyembunyikan tombol di UI.
- Hanya Owner yang bisa mengangkat Owner baru atau menyentuh akun Owner, dan
  Owner aktif terakhir tidak bisa diturunkan atau dihapus.
- Setiap aksi penting tercatat di log aktivitas, lengkap dengan filter pengguna,
  aksi, dan rentang tanggal (Admin → Log aktivitas).

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
