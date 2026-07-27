# Deploy ke Railway + domain sendiri

Panduan ini spesifik untuk Railway. Urutannya penting — terutama **Volume**,
karena tanpa itu seluruh pembukuan dan bukti transfer hilang setiap kali deploy.

---

## Ringkasan yang perlu disiapkan

| Hal | Nilai |
|---|---|
| Build command | `npm run build` |
| Start command | `npm start` |
| Node | 22.5 atau lebih baru (sudah dikunci di `package.json`) |
| Volume | wajib, mount di `/data` (untuk database) |
| Env wajib | `LEDGER_DATA_DIR`, `SESSION_SECRET` |
| Env disarankan | `PUBLIC_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` |
| Bukti transfer | Supabase Storage (bucket **privat**), lihat Langkah 4b |

---

## Langkah 1 — Naikkan kode ke GitHub

Railway men-deploy dari repo. Dari folder proyek:

```bash
cd ~/usdt-ledger
git init
git add .
git commit -m "Panel pembukuan USDT: multi-brand, multi-user, approval staff"
git branch -M main
git remote add origin https://github.com/<user>/<repo>.git
git push -u origin main
```

Folder `data/` sudah masuk `.gitignore`, jadi database lokal dan bukti transfer
tidak ikut ter-push. Pastikan memang begitu sebelum push:

```bash
git status --short   # tidak boleh ada apa pun di bawah data/
```

---

## Langkah 2 — Buat service di Railway

1. Railway → **New Project** → **Deploy from GitHub repo** → pilih repo tadi.
2. Railway mendeteksi Next.js sendiri. Kalau perlu diisi manual:
   - Build: `npm run build`
   - Start: `npm start`
3. **Jangan di-deploy dulu** sampai Langkah 3 dan 4 selesai — kalau terlanjur
   jalan, data yang sempat dibuat akan hilang begitu volume dipasang.

---

## Langkah 3 — Pasang Volume (paling penting)

Aplikasi ini memakai SQLite — seluruh pembukuan ada di satu berkas. Filesystem
Railway bersifat sementara: tanpa volume, setiap redeploy mengembalikan aplikasi
ke kondisi kosong.

1. Service → tab **Volumes** → **Add Volume**
2. Mount path: `/data`
3. Ukuran: 1 GB sudah sangat lega. Bukti transfer tidak ikut di sini kalau
   Supabase Storage dipakai (Langkah 4b), jadi yang tersimpan hanya database.

Setelah ini, isi volume:

```
/data/ledger.db      ← seluruh pembukuan
/data/bukti/         ← hanya terpakai kalau Supabase Storage tidak diaktifkan
```

---

## Langkah 4 — Environment variables

Service → **Variables**:

| Nama | Wajib | Nilai |
|------|-------|-------|
| `LEDGER_DATA_DIR` | ✅ | `/data` — mengarahkan database & bukti ke volume |
| `SESSION_SECRET` | ✅ | string acak panjang, lihat perintah di bawah |
| `PUBLIC_URL` | ⬜ | `https://pembukuan.domainkamu.com` (tanpa garis miring di akhir) |

Membuat `SESSION_SECRET`:

```bash
openssl rand -hex 32
```

Kenapa wajib: rahasia ini yang menandatangani cookie sesi. Kalau tidak diisi,
aplikasi membuat sendiri satu dan menyimpannya di database — tetap jalan, tapi
menaruhnya di environment lebih baik karena tidak ikut terbawa kalau file
database disalin keluar untuk backup.

`PORT` tidak perlu diisi — Railway mengisinya sendiri dan `npm start` sudah
mengikuti.

---

## Langkah 4b — Bucket Supabase untuk bukti transfer

Bukti transfer disimpan di Supabase Storage. Kalau env di bawah tidak diisi,
aplikasi otomatis kembali menyimpan ke disk (`/data/bukti/`) — jadi ini opsional,
tapi disarankan supaya volume tidak cepat penuh.

**Di Supabase:**

1. **Storage → New bucket**, nama: `bukti`
2. **Public bucket: JANGAN dicentang.** Biarkan privat.
3. Tidak perlu membuat policy apa pun. Server memakai service key yang
   melewati RLS, dan browser tidak pernah bicara langsung ke Supabase.

**Di Railway → Variables:**

| Nama | Nilai |
|------|-------|
| `SUPABASE_URL` | `https://xxxx.supabase.co` |
| `SUPABASE_SERVICE_KEY` | **service_role key** — Supabase → Settings → API |
| `SUPABASE_BUCKET` | `bukti` (boleh dikosongkan, ini sudah default) |

> ⚠️ **service_role key bersifat rahasia penuh.** Hanya boleh ada di environment
> variable Railway — jangan pernah masuk ke repo, ke kode, atau dikirim lewat
> chat. Kunci ini melewati seluruh RLS.

**Kenapa bucket-nya privat, beda dengan DOC PEMBUKUAN.** Di sistem lamamu
bucket-nya publik, artinya siapa pun yang memegang URL bisa membuka bukti
transfer tanpa login — dan URL itu gampang bocor lewat riwayat browser, share
layar, atau screenshot. Di sini berkasnya diambil server lalu diteruskan lewat
`/api/bukti/[id]` yang memeriksa sesi dulu. Tidak ada URL publik sama sekali.

Setelah deploy, buka **Admin → Penyimpanan bukti transfer**. Kalau tulisannya
“Supabase Storage” dengan titik hijau, berarti sudah tersambung.

---

## Langkah 5 — Deploy, lalu buat akun admin

1. Trigger deploy. Tunggu sampai statusnya hijau.
2. Buka URL `*.up.railway.app` yang diberikan Railway.
3. Aplikasi otomatis membuka halaman **/setup** karena belum ada akun.
4. Buat akun admin pertama. Setelah ini `/setup` mengunci dirinya sendiri —
   tidak bisa dipakai orang lain untuk membuat admin kedua.
5. Masuk → **Brand** → buat brand-brandmu. Ini harus lebih dulu, karena setiap
   pengeluaran wajib bertanda brand.
6. **Admin → Tambah akun** untuk tiap staff.

---

## Langkah 6 — Pasang domain

1. Railway → service → **Settings** → **Networking** → **Custom Domain**
2. Masukkan domainmu, mis. `pembukuan.domainkamu.com`
3. Railway memberi target CNAME. Di panel DNS domainmu:

   | Type | Name | Value |
   |------|------|-------|
   | CNAME | `pembukuan` | `<yang diberikan Railway>` |

   Untuk domain akar (`domainkamu.com` tanpa subdomain), pakai fitur ALIAS /
   ANAME / CNAME-flattening dari penyedia DNS-mu — CNAME biasa tidak boleh di
   root. Kalau tidak tersedia, pakai subdomain saja.
4. Tunggu propagasi (biasanya beberapa menit) — Railway menerbitkan sertifikat
   HTTPS otomatis.
5. Setelah domain aktif, isi `PUBLIC_URL` dengan domain itu lalu redeploy.

Cookie sesi otomatis memakai flag `Secure` begitu diakses lewat HTTPS, jadi tidak
ada yang perlu diubah di kode.

---

## Setelah live — yang perlu dijaga

**Jangan naikkan jumlah replika.** SQLite hanya boleh ditulis satu proses.
Railway → Settings → pastikan replicas tetap 1. Ini bukan aplikasi yang bisa
di-scale horizontal apa adanya.

**Backup rutin.** Seluruh pembukuan ada di satu berkas. Cara paling sederhana,
lewat Railway CLI:

```bash
railway link                 # sekali saja, pilih project
railway ssh "cat /data/ledger.db" > backup-$(date +%F).db
```

Bukti transfer ada di bucket Supabase (atau `/data/bukti/` kalau Supabase tidak
dipakai). Supabase punya backup sendiri di paket berbayar; untuk paket gratis,
unduh berkalanya sendiri kalau bukti penting untuk audit.

Alternatif tanpa CLI: **Laporan → Ekspor CSV** memberi seluruh transaksi dalam
format yang terbaca Excel. Itu bukan pengganti backup database (bukti dan log
tidak ikut), tapi cukup sebagai jaring pengaman kedua.

**Kunci periode setelah laporan selesai.** Admin → Kunci periode. Angka yang
sudah dilaporkan tidak bisa berubah lagi, termasuk oleh admin sendiri.

---

## Cek keamanan setelah deploy

Jalankan ini setelah live. Semua harus sesuai kolom kanan:

| Yang dicek | Hasil yang benar |
|---|---|
| Buka `/` tanpa login | dialihkan ke `/login` |
| Buka `/admin` sebagai staff | dialihkan keluar, tidak menampilkan daftar user |
| Buka `/setup` setelah ada admin | dialihkan ke `/login` |
| `curl -I https://<domain>/api/bukti/<id>` tanpa cookie | `401` |
| `curl -I https://<domain>/api/export` tanpa cookie | `401` |
| View source halaman mana pun, cari `eyJ` | tidak ada kunci apa pun |
| Buka URL bucket Supabase langsung tanpa token | ditolak (bucket privat) |
| Cek header respons | ada `X-Frame-Options: DENY` |
| Reset password seorang staff | staff itu langsung ter-logout di semua perangkat |

---

## Yang belum ada (biar tidak ada kejutan)

- **Tidak ada reset password mandiri.** Staff yang lupa password harus di-reset
  oleh admin. Tidak ada email keluar dari aplikasi ini.
- **Tidak ada 2FA.**
- **Rate limit login disimpan di memori**, jadi hitungannya kembali nol setiap
  redeploy. Cukup untuk menahan tebak-tebakan biasa, bukan serangan serius.
- **Bukti transfer tidak dipindai antivirus.** Hanya dibatasi tipe gambar dan
  ukuran 5 MB, dan disajikan lewat route yang butuh login.
- **Belum ada backup otomatis.** Jadwalkan sendiri sesuai catatan di atas.
