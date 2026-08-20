# Pembukuan Marketing (Rupiah)

Panel pembukuan pengeluaran marketing: divisi (Endorse / Ads / SEO / dan yang
kamu tambahkan sendiri), platform, brand, serta dompet sendiri seperti Bank Jago
dan Jenius. Semua nominal rupiah. Tidak ada "uang masuk" berupa pendapatan —
seluruh dana datang dari finance atas permintaan.

Turunan dari panel Pembukuan USDT: login, peran owner/admin/staff dengan izin
per-akun, kunci periode, log aktivitas, dan backup bertingkat dipakai ulang apa
adanya. Yang dibuang: kurs dan tipe transaksi pemasukan.

Data tersimpan di SQLite (`data/marketing.db`, atau folder yang ditunjuk
`MARKETING_DATA_DIR`).

---

## Aturan yang menentukan semua angka

Uang dari finance **bukan pendapatan** dan **bukan biaya**. Biaya lahir saat
uangnya dipakai. Ada dua rute:

```
RUTE A — bayar langsung
  Finance ──(transfer ke rekening penerima)──> Endorser / Agency / Vendor SEO
  1 kejadian = 1 BELANJA          → biaya langsung tercatat

RUTE B — lewat dompet
  Finance ──(top-up)──> Bank Jago ──(auto payment)──> Meta / Google / TikTok Ads
  kejadian 1 = TOPUP             → saldo naik, BUKAN biaya
  kejadian 2 = BELANJA           → biaya, saldo turun (diinput harian)
```

**Total Biaya Marketing = jumlah belanja + biaya bank − refund.** Top-up tidak
pernah masuk total biaya; kalau ikut dihitung, setiap iklan yang dibayar dari
dompet akan terhitung dua kali — sekali saat dananya datang, sekali saat
dibelanjakan.

**Sisa saldo dompet = saldo awal + top-up + refund ± koreksi − belanja dari
dompet − biaya bank.**

Kedua rumus itu hidup sebagai dua kolom turunan di view `v_transaksi`
(`delta_biaya` dan `delta_saldo`), bukan tersebar di tiap query. Jenis baris
menentukan efeknya:

| Jenis | Saldo dompet | Total biaya |
|---|---|---|
| `topup` | + | 0 |
| `belanja` | − (kalau sumbernya dompet) | + |
| `refund` | + (kalau kembali ke dompet) | − |
| `biaya_dompet` (admin bank) | − | + |
| `koreksi` | ± | 0 |
| `transfer_keluar` / `transfer_masuk` | − / + | 0 |

### Pindah saldo antar-dompet

Memindahkan uang dari Bank Jago ke Jenius dicatat sebagai **dua baris
berpasangan** — keluar dari asal, masuk ke tujuan — bukan satu baris yang
menyentuh dua dompet. Dengan begitu setiap baris tetap milik tepat satu dompet,
jadi saldo, mutasi, dan opname tiap dompet dihitung dengan rumus yang sama
seperti sebelum fitur ini ada.

Konsekuensinya, dan ini disengaja:

- Satu sisi transfer tidak bisa dibuat sendirian — formulir transaksi satuan
  tidak menawarkan jenis transfer sama sekali.
- Menghapus transfer mengambil kedua sisinya sekaligus. Menyisakan satu sisi
  berarti saldo sebuah dompet bergerak tanpa lawan, dan karena transfer tidak
  menyentuh total biaya, tidak ada angka lain yang akan memperlihatkannya.
- Mengubah satu sisi ditolak; hapus lalu catat ulang.
- Biaya transfer antar-bank dicatat terpisah sebagai biaya bank pada dompet asal
  — itu memang biaya, sementara pindahannya sendiri bukan.

Halamannya: **/dompet/transfer** (tombol "Pindah saldo" di halaman Dompet).

---

## Jalankan lokal

```bash
npm install                  # sekali saja
npm run dev                  # http://localhost:3000
```

Buka aplikasinya — kalau belum ada akun, halaman **/setup** muncul sendiri untuk
membuat owner pertama.

Produksi lokal:

```bash
npm run build && npm start
```

### Environment variable

| Nama | Wajib | Guna |
|---|---|---|
| `MARKETING_DATA_DIR` | di server | Folder database. **Harus di luar folder aplikasi** — di Railway/Vercel folder aplikasi dibuang setiap deploy dan seluruh data ikut hilang. Panel menampilkan peringatan besar selama ini belum benar. |
| `SESSION_SECRET` | ⬜ | Penanda-tangan cookie sesi. Kalau kosong, dibuat sendiri dan disimpan di database. |
| `PUBLIC_URL` | ⬜ | Dipakai menentukan cookie `secure` saat di belakang proxy. |
| `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` | ⬜ | Kalau diisi, backup disimpan ke Supabase Storage; kalau tidak, ke disk. |

---

## Alur kerja sehari-hari

1. **Minta dana** — `/pengajuan/baru`. Isi keterangan, nominal, rute (rekening
   penerima atau dompet), brand, platform, divisi. Panel merakit teks siap
   tempel untuk chat finance, jadi nomor rekening tidak pernah diketik ulang.
2. **Dana cair** — buka pengajuannya, tekan **Catat pembayaran**. Dari sini baris
   buku besar lahir sendiri: rute langsung jadi belanja, rute dompet jadi
   top-up. Batal? **Batalkan pembayaran** menghapus baris yang ia buat.
3. **Input harian dompet** — `/belanja/harian`. Pilih tanggal + dompet, isi grid
   platform / akun iklan / brand / nominal, simpan sekaligus. Sisa saldo
   berjalan tampil sambil mengetik, dan turun di bawah batas minimum diberi
   peringatan.
4. **Cocokkan** — `/dompet/[id]` menampilkan mutasi dengan saldo berjalan, dan
   **opname** untuk mencatat saldo asli dari mobile banking beserta selisihnya.
5. **Baca laporan** — `/laporan`: total biaya, per divisi, per platform, per
   brand, matriks divisi × platform, tren bulanan, ekspor CSV.

## Peran

| Peran | Bisa |
|---|---|
| `owner` | Semua, termasuk ubah saldo awal dompet, izin peran, dan backup |
| `admin` | Mencatat, menandai dana cair, kelola data master & dompet |
| `staff` | Membuat pengajuan dan input belanja harian |

Izin diperiksa di server pada setiap aksi, bukan hanya dipakai menyembunyikan
tombol. Owner bisa menyetel izin default tiap peran dan menimpanya per akun di
**Admin → Peran & izin**.

## Yang belum ada (fase berikutnya)

- Bukti transfer (foto) — tabel `attachments` sudah ada, UI-nya belum
- Alur pengajuan ubah/hapus untuk staff (tanpa izin `editBelanja`, staff belum
  punya jalan mengusulkan perbaikan)
- Import CSV dari Google Spreadsheet yang dipakai sekarang
- Budget per divisi/platform lebih dari sekadar angka pembanding di master
- Kirim format pengajuan otomatis ke grup Telegram finance
