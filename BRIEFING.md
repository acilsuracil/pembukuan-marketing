# Briefing untuk agent penerus

Dokumen serah-terima proyek **Pembukuan Marketing (rupiah)**. Baca ini dulu,
lalu `README.md` untuk aturan pembukuannya, sebelum menyentuh kode apa pun.

Status per **21 Agustus 2026**: Fase 0 + 1 selesai dan sudah dipakai user untuk
mencoba data sungguhan. `npm run build` bersih, typecheck 0 error, dan seluruh
skrip uji lolos.

---

## 1. Di mana dan bagaimana menjalankannya

```
C:\Users\acil\OneDrive\Desktop\2026 ACIL\LAIN LAIN\CLAUDE\pembukuan-usdt-main\pembukuan-marketing
```

⚠️ **Folder ini yang dipakai user.** Ada salinan lebih tua di
`D:\BACKUP\DATA ACIL\2026\CLAUDE\` — itu **cadangan**, jangan dikerjakan. Sesi
Claude sering dijalankan dari direktori D: itu, jadi mudah tertukar.

```bash
npm run dev      # http://localhost:3000
npm run build    # wajib bersih sebelum commit
```

`.env.local` sudah ada (tidak masuk git) dan mengarahkan database ke
`C:\Users\acil\pembukuan-marketing-data` — di luar folder proyek, karena folder
proyek ikut disinkronkan OneDrive dan berkas SQLite yang sedang dipakai tidak
aman disalin di tengah penulisan.

### Perangkat di mesin ini (menghemat waktumu)

| Hal | Kenyataan |
|---|---|
| `node`, `npm` | **Tidak ada di PATH.** Pakai `C:\Program Files\nodejs\node.exe` / `npm.cmd`, dan set `$env:PATH = "C:\Program Files\nodejs;$env:PATH"` sebelum `npm install/ci` — tanpa itu postinstall script gagal dengan "'node' is not recognized" |
| `git` | Tidak dikenali PowerShell; jalankan lewat Bash tool (Git Bash) |
| Heredoc Bash | Sering gagal (`unexpected EOF`) karena CRLF. Untuk isi berkas panjang pakai tool Write; untuk pesan commit pakai `git commit -F <file>` |
| Repo | Git lokal, **belum ada remote** — commit jalan, push belum bisa sampai user membuat repo GitHub-nya |
| Commit | Atas nama `Berto202 <acilsuracil138@gmail.com>`, **tanpa** trailer Co-Authored-By |

---

## 2. Satu aturan yang tidak boleh dilanggar

Uang dari finance **bukan pendapatan dan bukan biaya**. Biaya lahir saat uangnya
dipakai. Dua rute:

- **Langsung**: finance → rekening penerima = `belanja` (biaya langsung tercatat)
- **Lewat dompet**: finance → Bank Jago = `topup` (saldo naik, **belum** biaya) →
  auto payment = `belanja` dari dompet (baru di sini jadi biaya)

Kalau `topup` ikut dihitung biaya, setiap iklan yang dibayar dari dompet
terhitung **dua kali**. Seluruh aturan ini hidup di dua kolom turunan view
`v_transaksi` — `delta_biaya` dan `delta_saldo` (lihat `src/lib/db.ts`) — bukan
tersebar di query. **Jangan hitung biaya/saldo dengan rumus baru di query lain;
pakai dua kolom itu.**

| Jenis | delta_saldo | delta_biaya |
|---|---|---|
| `topup` | + | 0 |
| `belanja` | − (kalau `sumber='dompet'`) | + |
| `refund` | + (kalau ada dompet) | − |
| `biaya_dompet` | − | + |
| `koreksi` | ± (`arah`) | 0 |
| `transfer_keluar` / `transfer_masuk` | − / + | 0 |

Invarian lain yang sudah ditegakkan — kalau kamu mengubah sesuatu, pastikan
semuanya masih benar:

1. **Nominal INTEGER rupiah utuh.** Tidak ada REAL. Pembulatan sekali saja, di
   pintu masuk (`parseRupiahInt`).
2. **Transfer selalu dua baris berpasangan** (`pasangan_id`), satu baris tetap
   milik tepat satu dompet. Tidak bisa dibuat satu sisi, tidak bisa diubah satu
   sisi, dan hapusnya mengambil dua-duanya.
3. **Dana cair wajib berbukti.** Bukti divalidasi sebelum apa pun ditulis; kalau
   seluruh unggahan gagal, pencatatan dibatalkan. Bukti terakhir dari baris yang
   lahir dari pengajuan tidak bisa dihapus.
4. **Bentuk baris ditegakkan CHECK constraint di database**, bukan hanya
   formulir. Lihat jebakan di bagian 5.
5. **Izin diperiksa di server pada setiap aksi**, bukan cuma menyembunyikan
   tombol (`hasPerm` di `src/lib/policy.ts`).

---

## 3. Peta kode

| Berkas | Isi |
|---|---|
| `src/lib/db.ts` | Skema, migrasi, dua view (`v_transaksi`, `v_saldo_dompet`), seed divisi + platform |
| `src/lib/queries.ts` | Semua baca-data. Filter transaksi, laporan per kelompok, saldo & mutasi dompet, pengajuan |
| `src/app/actions.ts` | Semua tulis-data + validasi. ~1300 baris, dikelompokkan: master → bukti → pengajuan → buku besar → user/izin/backup |
| `src/lib/policy.ts` | Daftar izin (`PERM_LIST`), default per peran, kunci periode, log aktivitas |
| `src/lib/jenis.ts` | `JENIS_SEMUA` (filter) vs `JENIS_MANUAL` (yang boleh dibuat formulir satuan) |
| `src/lib/opts.ts` | Perakit pilihan dropdown + `rekLine()` (satu tempat merakit baris rekening) |
| `src/components/HarianForm.tsx` | Grid input harian dompet |
| `src/components/PengajuanForm.tsx` | Form pengajuan + perakit teks untuk finance |
| `src/components/BuktiInput.tsx` | Pemilih bukti: berkas, seret, **tempel Ctrl+V**; mengecilkan gambar dulu (`lib/shrink.ts`) |

Halaman: `/` ringkasan · `/pengajuan` · `/belanja` (+`/harian`, `/baru`,
`/[id]/ubah`) · `/dompet` (+`/[id]`, `/transfer`) · `/laporan` · `/master/*` ·
`/admin/*` · `/api/export` (CSV) · `/api/bukti/[id]` (bukti ber-auth).

Yang dipakai ulang apa adanya dari `pembukuan-usdt` sebelahnya: auth, sesi,
peran/izin, backup bertingkat, penyimpanan berkas (disk atau Supabase Storage),
tema, sidebar, palet warna, komponen chart.

---

## 4. Cara menguji (lakukan sebelum bilang "selesai")

Semua butuh folder data yang boleh dikotori — **jangan** pakai data user.

```bash
# instance uji
MARKETING_DATA_DIR=/tmp/uji PORT=3125 npm start

npm run cek-saldo    -- /tmp/uji/marketing.db     # aturan saldo & biaya + CHECK constraint
npm run cek-transfer -- /tmp/uji/marketing.db     # pindah saldo: pasangan, total, hapus dua sisi
npm run e2e          -- http://localhost:3125 /tmp/uji/marketing.db
```

`e2e` menekan formulir lewat **jalur tanpa-JavaScript** Next: setiap `<form>`
server action membawa kolom tersembunyi `$ACTION_REF_n` / `$ACTION_n:0` / `:1` /
`$ACTION_KEY`, dan mengirimkannya kembali sebagai multipart menjalankan aksi yang
sama persis dengan tombol di browser — termasuk seluruh validasinya. Ini cara
menguji tanpa browser; pakai pola yang sama untuk fitur baru.

Yang sudah dicakup e2e: setup owner → dua dompet → penerima → pengajuan rute
dompet → tolak cair tanpa bukti → cair dengan bukti → buka bukti (200 dengan
sesi, 401 tanpa sesi) → tolak hapus bukti terakhir → input harian 3 baris →
pengajuan rute langsung → pindah saldo + biaya transfer → cocokkan angka di
Ringkasan/Laporan/CSV → tiga penjagaan yang harus ditolak.

---

## 5. Jebakan yang sudah pernah menggigit (jangan ulangi)

1. **`CHECK (jenis <> 'x' OR kolom IN (...))` meloloskan NULL.** Di SQL
   `NULL IN (…)` bernilai NULL, dan CHECK bernilai NULL dianggap **lolos**
   SQLite. Tulis `kolom IS NOT NULL AND kolom IN (…)`. Ini pernah meloloskan
   belanja tanpa sumber dana.
2. **CHECK tidak bisa diubah lewat ALTER TABLE.** Menambah jenis baru berarti
   membangun ulang tabel — lihat `upgradeTransaksiJenis()` sebagai contoh yang
   aman dijalankan berulang. Ingat: view harus di-DROP dulu, indeks ikut hilang
   bersama tabel lama, dan indeks pada kolom baru harus dibuat **setelah**
   migrasi (kalau di blok awal, ia gagal di database lama). Salin dulu DB-nya
   dan bandingkan jumlah baris + jumlah nominal sesudahnya.
3. **`useActionState`: jangan bergantung pada `state.ok` sebagai dependency
   effect.** Dua keberhasilan berturut-turut sama-sama `ok: true`, jadi effect
   tidak jalan untuk yang kedua. Bandingkan **objek** state-nya
   (`sudahDibereskan.current === state`). Dan jangan pernah menaruh state yang
   diubah effect itu sendiri di dependency-nya — itu yang bikin "Maximum update
   depth exceeded" di `HarianForm`.
4. **Input `disabled` tidak ikut terkirim.** Di grid harian semua kolom setiap
   baris wajib dirender dan aktif; begitu satu kolom hilang dari satu baris,
   array `row_*` bergeser dan nominal mendarat di platform yang salah.
5. **Backtick di dalam SQL yang ditulis sebagai template literal** memutus
   string JS. Komentar SQL jangan pakai backtick.
6. **Jangan pakai `type="number"` untuk nominal.** Roda mouse mengubah nilainya
   saat terfokus. Semua kolom uang pakai `MoneyField` (`type="text"` + pratinjau
   dari parser yang sama dengan server).

---

## 6. Yang belum dikerjakan, urutan yang saya sarankan

1. **Import CSV dari Google Spreadsheet** — ini yang paling dinanti user; data
   lamanya masih di sheet. Pemetaan kolom sudah dirancang di `STRUKTUR.md` §7:
   unggah → pratinjau → tandai baris bermasalah → pilih rute → konfirmasi. Nama
   master baru harus **ditampilkan dulu sebelum dibuat**, supaya "Meta Ads" dan
   "meta ads" tidak jadi dua platform.
2. **Bukti untuk belanja harian & transfer** — sekarang hanya alur pengajuan yang
   menuntut bukti. Tabel, aksi (`addBukti`/`deleteBukti`), dan komponennya sudah
   ada, jadi ini pekerjaan memasang, bukan membangun.
3. **Alur pengajuan ubah/hapus untuk staff.** Tanpa izin `editBelanja`, staff
   belum punya jalan mengusulkan perbaikan. Panel USDT sebelahnya punya tabel
   `requests` + `RequestActions.tsx` yang bisa disalin; tabelnya sengaja belum
   saya bawa supaya tidak jadi kode mati.
4. **Budget per divisi/platform** — angkanya sudah tersimpan di master dan
   dipakai sebagai pembanding, tapi belum ada meter/peringatan di dashboard.
5. **Kirim format pengajuan ke grup Telegram finance** (sekarang copy-paste
   manual lewat tombol Salin).

Keputusan desain yang **sudah disepakati user**, jangan diubah tanpa bertanya:
platform tidak terikat satu divisi (divisi = kolom per transaksi, platform hanya
menyimpan divisi default); persetujuan finance tetap di luar panel — panel cuma
mencatat status `draft → diajukan → disetujui/ditolak → dibayar`.

---

## 7. Kebiasaan kerja yang diharapkan user

- Bahasa Indonesia, termasuk komentar kode. Komentar menjelaskan **kenapa**,
  bukan apa — dan hanya di tempat yang keputusannya tidak jelas dari kodenya.
- Commit tiap perubahan selesai, pesan yang menjelaskan alasan, tanpa trailer
  Claude.
- Kalau menemukan bug sendiri, sebut apa adanya beserta penyebabnya. User
  membaca angka: laporkan hasil uji dengan nominalnya, jangan cuma "sudah oke".
