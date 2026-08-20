# Struktur Panel Pembukuan Marketing (Rupiah)

Dokumen rancangan — belum ada kode. Tujuannya menyepakati model data, alur, dan
struktur halaman sebelum dibangun.

Turunan dari `pembukuan-usdt` (Next.js + `node:sqlite`), jadi auth, peran/izin,
bukti foto, alur pengajuan edit/hapus, activity log, dan backup bisa dipakai ulang.
Yang dibuang: kurs IDR/USDT dan tipe transaksi "pemasukan". Yang ditambah: **divisi**,
**platform**, **dompet (wallet)**, dan **pengajuan dana ke finance**.

---

## 0. Keputusan yang sudah disepakati

| Hal | Keputusan |
|---|---|
| Basis aplikasi | **Fork `pembukuan-usdt`** ke folder baru `pembukuan-marketing`. DB dan login terpisah dari pembukuan USDT |
| Platform vs divisi | **Platform bebas**, tidak terikat satu divisi. Platform menyimpan *divisi default* (mengisi form otomatis), tetapi divisi tetap kolom per transaksi dan boleh diubah — jadi TikTok bisa dipakai divisi Ads maupun Endorse tanpa dibuat dua kali |
| Alur persetujuan | Persetujuan finance **tetap di luar panel** (chat). Panel hanya mencatat statusnya: `draft → diajukan → disetujui/ditolak → dibayar`. Finance tidak perlu punya akun. Nilainya: panel tahu mana dana yang diminta tapi belum turun, beserta umurnya |

---

## 1. Keputusan inti (semua laporan bergantung ini)

Uang dari finance itu **bukan pemasukan** dan **bukan biaya**. Biaya baru lahir saat
uangnya dipakai. Ada dua rute:

```
RUTE A — bayar langsung
  Finance --(transfer ke rekening penerima)--> Endorser / Agency / Vendor SEO
  1 kejadian = 1 BELANJA (biaya langsung tercatat)

RUTE B — lewat dompet
  Finance --(top-up)--> Bank Jago / Jenius --(auto payment)--> Meta / Google / TikTok Ads
  kejadian 1 = TOPUP   (saldo naik, BUKAN biaya)
  kejadian 2 = BELANJA (biaya, saldo turun) <- ini yang diinput harian dari mutasi dompet
```

**Aturan anti dobel-hitung:** `Total Biaya Marketing` = jumlah **BELANJA** saja.
Top-up ke dompet tidak pernah masuk total biaya. Kalau top-up ikut dihitung, biaya
rute B terhitung dua kali.

**Sisa saldo dompet** = `saldo_awal + topup + refund ± koreksi − belanja_dari_dompet − biaya_admin_bank`

---

## 2. Master data (semua bisa ditambah / ubah / arsipkan dari panel)

| Tabel | Isi | Catatan |
|---|---|---|
| `divisi` | Endorse, Ads, SEO, … | seed 3, bebas tambah. Punya warna + budget bulanan opsional |
| `platform` | Meta Ads, Google Ads, TikTok Ads, IG endorse, TikTok endorse, vendor backlink, … | bebas tambah. Opsional: default divisi + default dompet |
| `akun_iklan` | akun iklan per platform (mis. `PN138-ADS-01`) | opsional, sangat membantu rekonsiliasi auto payment Bank Jago |
| `brand` | brand yang diiklankan | ikut pola `brands` di pembukuan-usdt |
| `dompet` | Bank Jago, Bank Jenius | `saldo_awal`, `tanggal_awal`, no rek, pemilik, batas saldo minimum |
| `penerima` | bank + no rek + nama pemilik (endorser / agency / vendor) | biar tidak ketik ulang tiap pengajuan; dipakai untuk format ke finance |

Arsip (bukan hapus) untuk semua master, supaya data lama tetap terbaca.

---

## 3. Tabel inti

### 3.1 `pengajuan` — permintaan dana ke finance (persis format yang dipakai sekarang)

```sql
CREATE TABLE pengajuan (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  tanggal        TEXT    NOT NULL,                      -- tanggal diajukan
  keterangan     TEXT    NOT NULL,                      -- baris 1 format
  nominal        INTEGER NOT NULL CHECK (nominal > 0),  -- rupiah utuh, tanpa sen
  tujuan         TEXT    NOT NULL CHECK (tujuan IN ('langsung','dompet')),
  penerima_id    INTEGER REFERENCES penerima(id),       -- rute langsung
  dompet_id      INTEGER REFERENCES dompet(id),         -- rute dompet (rek tujuan = rek dompet)
  brand_id       INTEGER REFERENCES brand(id),
  platform_id    INTEGER REFERENCES platform(id),
  divisi_id      INTEGER REFERENCES divisi(id),
  status         TEXT    NOT NULL DEFAULT 'draft'
                 CHECK (status IN ('draft','diajukan','disetujui','ditolak','dibayar')),
  tanggal_bayar  TEXT,
  nominal_cair   INTEGER,                               -- kalau cair beda dari yang diminta
  catatan        TEXT    NOT NULL DEFAULT '',
  created_by     INTEGER REFERENCES users(id),
  created_at     TEXT    NOT NULL,
  updated_at     TEXT
);
```

Fitur yang menempel di tabel ini:

- Tombol **Copy format** → teks siap kirim ke finance:
  `Keterangan / Nominal / No & Nama rekening penerima / Brand / Platform / Divisi`
- Rute `dompet`: rekening penerima otomatis diambil dari data dompet, tidak diisi manual.
- Saat status jadi **`dibayar`**, panel otomatis membuat baris di `transaksi`:
  - `tujuan='langsung'` → `jenis='belanja'`, `sumber='finance'`
  - `tujuan='dompet'` → `jenis='topup'` ke dompet tersebut
- Outstanding = pengajuan berstatus `diajukan` / `disetujui` (belum cair) + umur harinya.

### 3.2 `transaksi` — buku besar sesungguhnya

```sql
CREATE TABLE transaksi (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  tanggal       TEXT    NOT NULL,
  jenis         TEXT    NOT NULL
                CHECK (jenis IN ('topup','belanja','refund','biaya_dompet','koreksi')),
  nominal       INTEGER NOT NULL CHECK (nominal > 0),         -- selalu positif
  arah          INTEGER NOT NULL DEFAULT 1,                   -- hanya 'koreksi': +1 / -1
  sumber        TEXT CHECK (sumber IN ('finance','dompet')),  -- wajib untuk 'belanja'
  dompet_id     INTEGER REFERENCES dompet(id),
  divisi_id     INTEGER REFERENCES divisi(id),
  platform_id   INTEGER REFERENCES platform(id),
  brand_id      INTEGER REFERENCES brand(id),
  akun_iklan_id INTEGER REFERENCES akun_iklan(id),
  penerima_id   INTEGER REFERENCES penerima(id),
  pengajuan_id  INTEGER REFERENCES pengajuan(id),             -- asal dananya, kalau ada
  keterangan    TEXT    NOT NULL DEFAULT '',
  no_ref        TEXT    NOT NULL DEFAULT '',                  -- no invoice / ref mutasi bank
  split_group   TEXT,                                         -- 1 bayar dipakai bbrp brand
  created_by    INTEGER REFERENCES users(id),
  created_at    TEXT    NOT NULL,
  updated_at    TEXT
);
```

Arti tiap `jenis`:

| jenis | Saldo dompet | Total biaya | Kapan dipakai |
|---|---|---|---|
| `topup` | + | 0 | finance isi Bank Jago / Jenius |
| `belanja` | − (kalau `sumber='dompet'`) | + | auto payment iklan, bayar endorser, bayar SEO |
| `refund` | + (kalau kembali ke dompet) | − | refund/cashback platform, endorse batal |
| `biaya_dompet` | − | + | biaya admin/transfer bank (bukan biaya platform) |
| `koreksi` | ± | 0 | penyesuaian selisih hasil cek saldo, tanpa mengubah biaya |

Tambahan: `dompet_opname` (`id`, `dompet_id`, `tanggal`, `saldo_aktual`, `catatan`)
untuk mencatat saldo riil dari mutasi bank → panel menampilkan selisih vs saldo tercatat.

---

## 4. View & rumus (mirror pola `tx_view` di pembukuan-usdt)

`v_transaksi` — semua kolom + nama divisi/platform/brand/dompet + kolom turunan:

```
delta_saldo = topup        : +nominal
              belanja      : sumber='dompet' ? -nominal : 0
              refund       : dompet_id IS NOT NULL ? +nominal : 0
              biaya_dompet : -nominal
              koreksi      : arah * nominal

delta_biaya = belanja      : +nominal
              refund       : -nominal
              biaya_dompet : +nominal
              topup        : 0
              koreksi      : 0

bulan       = substr(tanggal, 1, 7)
```

View turunan:

- `v_saldo_dompet` → per dompet: `saldo_awal`, total masuk, total keluar, **sisa saldo**,
  tanggal transaksi terakhir, status (aman / di bawah batas minimum)
- `v_biaya_divisi`, `v_biaya_platform`, `v_biaya_brand` → total per periode, % dari total,
  realisasi vs budget
- `v_biaya_harian` → grafik tren
- `v_matriks` → divisi × platform

---

## 5. Struktur halaman

```
/                     Ringkasan
                      - Total Biaya Marketing (periode aktif)
                      - Belanja hari ini / bulan ini
                      - Sisa saldo tiap dompet + peringatan saldo tipis
                      - Outstanding pengajuan (belum cair) + umurnya
                      - Grafik tren harian, bar per divisi, top platform

/pengajuan            Daftar pengajuan ke finance + filter status
/pengajuan/baru       Form sesuai format finance + tombol Copy format
/pengajuan/[id]       Detail, bukti transfer, tombol "Tandai dibayar"

/belanja              Tabel transaksi + filter: periode, divisi, platform, brand,
                      dompet, sumber, jenis. Export CSV.
/belanja/baru         Input satuan (endorse / SEO / bayar vendor)
/belanja/harian       * Input harian dompet: pilih tanggal + dompet, lalu grid baris
                      (platform / akun iklan / brand / nominal) — simpan sekaligus.
                      Sisa saldo berjalan tampil saat mengetik.

/dompet               Daftar dompet + saldo awal, masuk, keluar, sisa
/dompet/[id]          Mutasi dompet (running balance), input opname, selisih

/laporan              Per divisi / per platform / per brand / matriks divisi x platform /
                      tren bulanan / realisasi vs budget / export CSV

/master/divisi        CRUD divisi
/master/platform      CRUD platform + akun iklan
/master/brand         CRUD brand
/master/penerima      CRUD rekening penerima
/master/dompet        CRUD dompet (saldo awal, batas minimum)
/master/import        Import CSV dari Google Spreadsheet

/admin/*              Pengguna, peran/izin, aktivitas, backup (pakai ulang dari usdt)
```

---

## 6. Peran & izin

| Peran | Bisa |
|---|---|
| `owner` | semua, termasuk hapus permanen, ubah saldo awal, restore backup |
| `admin` | semua input + setujui pengajuan edit/hapus + kelola master |
| `staff` | input pengajuan & belanja harian, lihat laporan. Edit/hapus wajib **mengajukan** (pakai ulang tabel `requests` dari pembukuan-usdt) |

Semua perubahan tercatat di `activity_log`.

---

## 7. Migrasi dari Google Spreadsheet

Pemetaan kolom saat import CSV:

| Kolom sheet | → | Field |
|---|---|---|
| Tanggal | → | `tanggal` |
| Keterangan | → | `keterangan` |
| Nominal | → | `nominal` (pembersih otomatis: `Rp`, titik, koma) |
| No & Nama rekening | → | cari / buat `penerima` |
| Brand | → | cari / buat `brand` |
| Platform | → | cari / buat `platform` |
| Divisi | → | cari / buat `divisi` |

Alur import: unggah → pratinjau → tandai baris bermasalah → pilih rute
(`langsung` / `dompet`) → konfirmasi. Nama master baru ditampilkan dulu sebelum dibuat,
supaya "Meta Ads" dan "meta ads" tidak jadi dua platform.

---

## 8. Urutan pengerjaan

| Fase | Isi |
|---|---|
| 0 | Fork struktur pembukuan-usdt, buang kurs & pemasukan, DB baru, auth + peran |
| 1 | Master (divisi/platform/brand/dompet/penerima) + `pengajuan` + `belanja` + `dompet` + Ringkasan |
| 2 | Input harian dompet, bukti foto, laporan lengkap + export, import CSV dari sheet |
| 3 | Budget per divisi/platform + peringatan saldo tipis, opname & rekonsiliasi, kirim format pengajuan ke grup Telegram finance |

---

## 9. Catatan teknis

- Nominal disimpan **INTEGER rupiah utuh** (tanpa sen) — tidak ada `REAL`, jadi total
  tidak pernah meleset sepeser. Tampilan pakai `Intl.NumberFormat('id-ID')`.
- Tanggal `TEXT` format `YYYY-MM-DD`; zona waktu Asia/Jakarta ditetapkan di satu helper.
- DB SQLite di volume terpisah lewat `LEDGER_DATA_DIR` — pembukuan-usdt sudah punya
  peringatan soal data hilang tiap deploy kalau ini salah pasang.
