/**
 * Uji end-to-end lewat HTTP sungguhan.
 *
 * Formulirnya ditembak lewat jalur tanpa-JavaScript milik Next: setiap <form>
 * server action membawa kolom tersembunyi $ACTION_REF_n / $ACTION_n:0 / :1 /
 * $ACTION_KEY, dan mengirimkannya kembali sebagai multipart menjalankan aksi
 * yang sama persis dengan yang dijalankan tombol di browser. Jadi yang diuji
 * di sini benar-benar validasi dan penulisan database aplikasinya, bukan tiruan.
 */
import { DatabaseSync } from "node:sqlite";

const BASE = process.argv[2] ?? "http://localhost:3000";
const DB = process.argv[3];

let cookie = "";
let gagal = 0;
const langkah = [];

const rupiah = (n) => `Rp ${Number(n).toLocaleString("id-ID")}`;

function check(label, got, want) {
  const ok = got === want;
  if (!ok) gagal++;
  console.log(`${ok ? "OK  " : "GAGAL"} ${label}: ${got}${ok ? "" : ` (harusnya ${want})`}`);
}

function checkIncludes(label, haystack, needle) {
  const ok = haystack.includes(needle);
  if (!ok) gagal++;
  console.log(`${ok ? "OK  " : "GAGAL"} ${label}${ok ? "" : ` — tidak menemukan "${needle}"`}`);
}

async function get(path) {
  const res = await fetch(BASE + path, {
    headers: cookie ? { cookie } : {},
    redirect: "manual",
  });
  const body = res.status === 200 ? await res.text() : "";
  return { status: res.status, location: res.headers.get("location"), body };
}

/** Kolom tersembunyi milik satu <form>, dipilih lewat penanda isinya. */
function actionFields(html, penanda) {
  const blocks = html.split("<form").filter((b) => b.includes(penanda));
  if (blocks.length === 0) throw new Error(`form dengan penanda "${penanda}" tidak ada`);
  const block = blocks[0];
  const fields = {};
  const re = /name="(\$ACTION[^"]*)"(?:\s+value="([^"]*)")?/g;
  let m;
  while ((m = re.exec(block)) !== null) {
    fields[m[1]] = (m[2] ?? "")
      .replaceAll("&quot;", '"')
      .replaceAll("&amp;", "&")
      .replaceAll("&lt;", "<")
      .replaceAll("&gt;", ">");
  }
  if (Object.keys(fields).length === 0)
    throw new Error(`form "${penanda}" tidak punya kolom aksi`);
  return fields;
}

/**
 * @param data nilai kolom formulir. Array berarti kolom berulang (grid harian).
 */
async function submit(path, penanda, data) {
  const page = await get(path);
  if (page.status !== 200)
    throw new Error(`GET ${path} → ${page.status} ${page.location ?? ""}`);
  const fields = actionFields(page.body, penanda);

  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  const nilai = (x) => (x instanceof File ? x : String(x));
  for (const [k, v] of Object.entries(data)) {
    if (Array.isArray(v)) for (const item of v) fd.append(k, nilai(item));
    else fd.set(k, nilai(v));
  }

  const res = await fetch(BASE + path, {
    method: "POST",
    headers: cookie ? { cookie } : {},
    body: fd,
    redirect: "manual",
  });
  const set = res.headers.getSetCookie?.() ?? [];
  for (const c of set) {
    const [pair] = c.split(";");
    if (pair.startsWith("ledger_sess=")) cookie = pair;
  }
  const body = await res.text();
  return { status: res.status, location: res.headers.get("location"), body };
}

/**
 * PNG 1x1 yang sah, dipakai sebagai bukti transfer palsu. Server memeriksa tipe
 * dan ukurannya, bukan isinya — jadi ini cukup untuk menguji seluruh jalurnya.
 */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==",
  "base64",
);
const buktiPalsu = (nama = "bukti.png") => new File([PNG], nama, { type: "image/png" });

const db = () => new DatabaseSync(DB, { readOnly: true });
const one = (sql, ...p) => {
  const d = db();
  try {
    return d.prepare(sql).get(...p);
  } finally {
    d.close();
  }
};
const semua = (sql, ...p) => {
  const d = db();
  try {
    return d.prepare(sql).all(...p);
  } finally {
    d.close();
  }
};

function step(n) {
  langkah.push(n);
  console.log(`\n── ${n}`);
}

/* ------------------------------------------------------------------ mulai */

step("Buat akun owner lewat /setup");
{
  const r = await submit("/setup", 'name="username"', {
    username: "berto",
    name: "Berto",
    password: "rahasia123",
    confirm: "rahasia123",
  });
  check("status setelah setup", r.status, 303);
  check("dapat cookie sesi", cookie.startsWith("ledger_sess=") ? "ya" : "tidak", "ya");
  check("akun tersimpan", one(`SELECT role FROM users WHERE username='berto'`).role, "owner");
}

step("Tambah dua dompet");
{
  await submit("/dompet", 'name="tanggal_awal"', {
    name: "Bank Jago",
    jenis: "bank",
    bank: "Jago",
    no_rek: "1234567890",
    pemilik: "Berto",
    saldo_awal: "1.000.000",
    tanggal_awal: "2026-08-01",
    min_saldo: "2.000.000",
    note: "",
  });
  await submit("/dompet", 'name="tanggal_awal"', {
    name: "Bank Jenius",
    jenis: "bank",
    bank: "Jenius",
    no_rek: "9876543210",
    pemilik: "Berto",
    saldo_awal: "0",
    tanggal_awal: "2026-08-01",
    min_saldo: "0",
    note: "",
  });
  const n = one(`SELECT COUNT(*) AS n FROM dompet`).n;
  check("jumlah dompet", n, 2);
  const jago = one(`SELECT * FROM v_saldo_dompet WHERE name='Bank Jago'`);
  check("saldo awal Bank Jago terbaca", jago.saldo_awal, 1000000);
  check("sisa Bank Jago = saldo awal", jago.sisa, 1000000);

  const halaman = await get("/dompet");
  checkIncludes("halaman dompet menyebut sisa saldo", halaman.body, rupiah(1000000));
  checkIncludes("peringatan di bawah minimum muncul", halaman.body, "di bawah minimum");
}

step("Tambah rekening penerima");
{
  await submit("/master/penerima", 'name="nama"', {
    nama: "Dewi Endorser",
    bank: "BCA",
    no_rek: "0987654321",
    note: "endorser TikTok",
  });
  check(
    "penerima tersimpan",
    one(`SELECT nama FROM penerima`).nama,
    "Dewi Endorser",
  );
}

step("Pengajuan rute dompet, lalu tandai dana cair");
{
  const jago = one(`SELECT id FROM dompet WHERE name='Bank Jago'`).id;
  const ads = one(`SELECT id FROM divisi WHERE name='Ads'`).id;
  const meta = one(`SELECT id FROM platform WHERE name='Meta Ads'`).id;

  const r = await submit("/pengajuan/baru", 'name="keterangan"', {
    tanggal: "2026-08-05",
    keterangan: "Top-up iklan Meta minggu 3",
    nominal: "5.000.000",
    tujuan: "dompet",
    dompet_id: jago,
    platform_id: meta,
    divisi_id: ads,
    brand_id: "",
    catatan: "",
    status: "diajukan",
  });
  // useActionState menjawab dengan halaman yang dirender ulang (200); pindah
  // halamannya dilakukan di klien, jadi tanpa JS memang tidak ada redirect.
  check("simpan pengajuan diterima", r.status === 200 || r.status === 303, true);

  const pg = one(`SELECT * FROM pengajuan ORDER BY id DESC LIMIT 1`);
  check("nominal pengajuan", pg.nominal, 5000000);
  check("status pengajuan", pg.status, "diajukan");
  check("belum ada baris buku besar", one(`SELECT COUNT(*) AS n FROM transaksi`).n, 0);

  const detail = await get(`/pengajuan/${pg.id}`);
  checkIncludes("format untuk finance memuat rekening dompet", detail.body, "1234567890");
  checkIncludes("format memuat nominal", detail.body, rupiah(5000000));

  // Bukti transfer wajib: tanpa lampiran, pencatatan harus ditolak utuh —
  // tidak ada baris buku besar, status pengajuan tidak berubah.
  const tanpaBukti = await submit(`/pengajuan/${pg.id}`, 'name="tanggal_bayar"', {
    id: pg.id,
    status: "dibayar",
    tanggal_bayar: "2026-08-06",
    nominal_cair: "",
    no_ref: "TRF-001",
  });
  checkIncludes("cair tanpa bukti ditolak", tanpaBukti.body, "Lampirkan bukti transfernya");
  check(
    "status belum berubah",
    one(`SELECT status FROM pengajuan WHERE id = ?`, pg.id).status,
    "diajukan",
  );
  check("belum ada baris buku besar", one(`SELECT COUNT(*) AS n FROM transaksi`).n, 0);

  await submit(`/pengajuan/${pg.id}`, 'name="tanggal_bayar"', {
    id: pg.id,
    status: "dibayar",
    tanggal_bayar: "2026-08-06",
    nominal_cair: "",
    no_ref: "TRF-001",
    bukti: [buktiPalsu("mutasi-jago.png")],
  });

  const after = one(`SELECT * FROM pengajuan WHERE id = ?`, pg.id);
  check("status jadi dibayar", after.status, "dibayar");
  const tx = one(`SELECT * FROM v_transaksi WHERE pengajuan_id = ?`, pg.id);
  check("baris yang lahir berjenis topup", tx.jenis, "topup");
  check("top-up tidak jadi biaya", tx.delta_biaya, 0);
  check("saldo Jago naik", one(`SELECT sisa FROM v_saldo_dompet WHERE id=?`, jago).sisa, 6000000);
  check("total biaya masih nol", one(`SELECT IFNULL(SUM(delta_biaya),0) AS v FROM v_transaksi`).v, 0);

  const att = one(`SELECT * FROM attachments WHERE tx_id = ?`, tx.id);
  check("bukti tersimpan di baris itu", att.orig_name, "mutasi-jago.png");
  check("bukti tercatat sebagai PNG", att.mime, "image/png");

  const berkas = await fetch(`${BASE}/api/bukti/${att.id}`, { headers: { cookie } });
  check("bukti bisa dibuka lewat route ber-auth", berkas.status, 200);
  check("tipe yang disajikan dari database", berkas.headers.get("content-type"), "image/png");
  const tanpaSesi = await fetch(`${BASE}/api/bukti/${att.id}`);
  check("bukti ditolak tanpa sesi", tanpaSesi.status, 401);

  const detailBukti = await get(`/pengajuan/${pg.id}`);
  checkIncludes("detail pengajuan menampilkan buktinya", detailBukti.body, `/api/bukti/${att.id}`);

  // Bukti terakhir dari dana yang sudah cair tidak boleh dihapus — itu pintu
  // belakang menuju keadaan yang justru dicegah aturan ini.
  const hapusBukti = await submit(`/pengajuan/${pg.id}`, `value="${att.id}"`, {
    id: att.id,
  });
  checkIncludes("bukti terakhir tidak bisa dihapus", hapusBukti.body, "bukti terakhir");
  check("buktinya masih ada", one(`SELECT COUNT(*) AS n FROM attachments`).n, 1);
}

step("Input harian dompet: tiga baris sekaligus");
{
  const jago = one(`SELECT id FROM dompet WHERE name='Bank Jago'`).id;
  const ads = one(`SELECT id FROM divisi WHERE name='Ads'`).id;
  const endorse = one(`SELECT id FROM divisi WHERE name='Endorse'`).id;
  const meta = one(`SELECT id FROM platform WHERE name='Meta Ads'`).id;
  const google = one(`SELECT id FROM platform WHERE name='Google Ads'`).id;
  const tiktok = one(`SELECT id FROM platform WHERE name='TikTok'`).id;

  const r = await submit("/belanja/harian", 'name="row_nominal"', {
    tanggal: "2026-08-13",
    dompet_id: jago,
    row_platform: [meta, google, tiktok],
    row_divisi: [ads, ads, endorse],
    row_brand: ["", "", ""],
    row_akun: ["", "", ""],
    row_nominal: ["1.250.000", "800.000", "450.000"],
    row_ket: ["Auto payment Meta", "Auto payment Google", "Endorse harian"],
  });
  check("status input harian", r.status, 200);

  check("tiga baris tersimpan", one(`SELECT COUNT(*) AS n FROM transaksi WHERE jenis='belanja'`).n, 3);
  check(
    "total biaya = 2.500.000",
    one(`SELECT IFNULL(SUM(delta_biaya),0) AS v FROM v_transaksi`).v,
    2500000,
  );
  check(
    "sisa Jago = 6jt − 2,5jt",
    one(`SELECT sisa FROM v_saldo_dompet WHERE id=?`, jago).sisa,
    3500000,
  );
}

step("Belanja rute langsung dari pengajuan kedua");
{
  const dewi = one(`SELECT id FROM penerima`).id;
  const endorse = one(`SELECT id FROM divisi WHERE name='Endorse'`).id;
  const ig = one(`SELECT id FROM platform WHERE name='Instagram'`).id;

  await submit("/pengajuan/baru", 'name="keterangan"', {
    tanggal: "2026-08-12",
    keterangan: "Endorse Dewi 1 slot IG",
    nominal: "3.500.000",
    tujuan: "langsung",
    penerima_id: dewi,
    platform_id: ig,
    divisi_id: endorse,
    brand_id: "",
    catatan: "",
    status: "diajukan",
  });
  const pg = one(`SELECT * FROM pengajuan WHERE tujuan='langsung' ORDER BY id DESC LIMIT 1`);

  await submit(`/pengajuan/${pg.id}`, 'name="tanggal_bayar"', {
    id: pg.id,
    status: "dibayar",
    tanggal_bayar: "2026-08-14",
    nominal_cair: "",
    no_ref: "TRF-002",
    bukti: [buktiPalsu("transfer-dewi.png"), buktiPalsu("chat-dewi.png")],
  });

  const tx = one(`SELECT * FROM v_transaksi WHERE pengajuan_id = ?`, pg.id);
  check("baris berjenis belanja", tx.jenis, "belanja");
  check("sumber dananya finance", tx.sumber, "finance");
  check("langsung jadi biaya", tx.delta_biaya, 3500000);
  check("tidak menyentuh saldo dompet", tx.delta_saldo, 0);
  check(
    "total biaya jadi 6.000.000",
    one(`SELECT IFNULL(SUM(delta_biaya),0) AS v FROM v_transaksi`).v,
    6000000,
  );
}

step("Pengajuan yang dibagi ke beberapa brand");
{
  const dewi = one(`SELECT id FROM penerima`).id;
  const ads = one(`SELECT id FROM divisi WHERE name='Ads'`).id;
  const meta = one(`SELECT id FROM platform WHERE name='Meta Ads'`).id;

  // Dua brand baru supaya pembagiannya jelas terbaca di laporan.
  for (const nama of ["PN138", "TIKTOK88"]) {
    await submit("/master/brand", 'name="pic"', {
      name: nama,
      pic: "",
      budget_idr: "",
      note: "",
      color_slot: "1",
    });
  }
  const a = one(`SELECT id FROM brand WHERE name='PN138'`).id;
  const b = one(`SELECT id FROM brand WHERE name='TIKTOK88'`).id;

  // Porsi yang jumlahnya tidak pas harus ditolak sebelum apa pun tersimpan.
  const jumlahSebelum = one(`SELECT COUNT(*) AS n FROM pengajuan`).n;
  const salah = await submit("/pengajuan/baru", 'name="keterangan"', {
    tanggal: "2026-08-18",
    keterangan: "Iklan bersama dua brand",
    nominal: "4.000.000",
    tujuan: "langsung",
    penerima_id: dewi,
    platform_id: meta,
    divisi_id: ads,
    brand_mode: "multi",
    porsi_brand: [a, b],
    porsi_nominal: ["3.000.000", "500.000"],
    catatan: "",
    status: "diajukan",
  });
  checkIncludes("porsi yang tidak pas ditolak", salah.body, "tidak sama dengan nominalnya");
  check(
    "pengajuannya tidak tersimpan",
    one(`SELECT COUNT(*) AS n FROM pengajuan`).n,
    jumlahSebelum,
  );

  await submit("/pengajuan/baru", 'name="keterangan"', {
    tanggal: "2026-08-18",
    keterangan: "Iklan bersama dua brand",
    nominal: "4.000.000",
    tujuan: "langsung",
    penerima_id: dewi,
    platform_id: meta,
    divisi_id: ads,
    brand_mode: "multi",
    porsi_brand: [a, b],
    porsi_nominal: ["2.500.000", "1.500.000"],
    catatan: "",
    status: "diajukan",
  });
  const pg = one(`SELECT * FROM pengajuan ORDER BY id DESC LIMIT 1`);
  check("porsi tersimpan dua baris", one(
    `SELECT COUNT(*) AS n FROM pengajuan_brand WHERE pengajuan_id = ?`, pg.id,
  ).n, 2);
  check("brand tunggal dikosongkan", pg.brand_id, null);

  const format = await get(`/pengajuan/${pg.id}`);
  checkIncludes("format ke finance memuat pembagiannya", format.body, "PN138");

  // Cair kurang dari yang diminta: porsinya diskalakan, jumlahnya tetap pas.
  await submit(`/pengajuan/${pg.id}`, 'name="tanggal_bayar"', {
    id: pg.id,
    status: "dibayar",
    tanggal_bayar: "2026-08-19",
    nominal_cair: "2.000.000",
    no_ref: "TRF-003",
    bukti: [buktiPalsu("transfer-bersama.png")],
  });

  const baris = semua(
    `SELECT brand_name, nominal, split_group, delta_biaya FROM v_transaksi
     WHERE pengajuan_id = ? ORDER BY nominal DESC`,
    pg.id,
  );
  check("lahir dua baris, satu per brand", baris.length, 2);
  check("porsi PN138 setelah diskalakan", baris[0].nominal, 1250000);
  check("porsi TIKTOK88 setelah diskalakan", baris[1].nominal, 750000);
  check(
    "jumlah pecahan sama dengan yang cair",
    baris.reduce((s, r) => s + r.nominal, 0),
    2000000,
  );
  check(
    "kedua pecahan satu grup",
    baris[0].split_group !== null && baris[0].split_group === baris[1].split_group,
    true,
  );
  check(
    "biaya per brand terpisah di laporan",
    one(
      `SELECT IFNULL(SUM(delta_biaya),0) AS v FROM v_transaksi WHERE brand_id = ?`, a,
    ).v,
    1250000,
  );
  check("bukti cukup satu untuk pembayarannya", one(
    `SELECT COUNT(*) AS n FROM attachments a
     JOIN transaksi t ON t.id = a.tx_id WHERE t.pengajuan_id = ?`, pg.id,
  ).n, 1);
}

step("Pindah saldo Bank Jago → Bank Jenius");
{
  const jago = one(`SELECT id FROM dompet WHERE name='Bank Jago'`).id;
  const jenius = one(`SELECT id FROM dompet WHERE name='Bank Jenius'`).id;
  const biayaSebelum = one(`SELECT IFNULL(SUM(delta_biaya),0) AS v FROM v_transaksi`).v;
  const totalSebelum = one(`SELECT IFNULL(SUM(sisa),0) AS v FROM v_saldo_dompet`).v;

  const r = await submit("/dompet/transfer", 'name="dompet_asal_id"', {
    tanggal: "2026-08-15",
    dompet_asal_id: jago,
    dompet_tujuan_id: jenius,
    nominal: "1.000.000",
    biaya_admin: "6.500",
    keterangan: "siapkan dana TikTok Ads",
    no_ref: "TRF-003",
  });
  check("status pindah saldo", r.status, 200);

  check("sisa Jago", one(`SELECT sisa FROM v_saldo_dompet WHERE id=?`, jago).sisa, 2493500);
  check("sisa Jenius", one(`SELECT sisa FROM v_saldo_dompet WHERE id=?`, jenius).sisa, 1000000);
  check(
    "total saldo hanya berkurang sebesar biaya transfer",
    one(`SELECT IFNULL(SUM(sisa),0) AS v FROM v_saldo_dompet`).v,
    totalSebelum - 6500,
  );
  check(
    "biaya naik hanya 6.500",
    one(`SELECT IFNULL(SUM(delta_biaya),0) AS v FROM v_transaksi`).v,
    biayaSebelum + 6500,
  );
  const keluar = one(`SELECT * FROM v_transaksi WHERE jenis='transfer_keluar'`);
  check("sisi keluar punya pasangan", keluar.pasangan_id === null ? "tidak" : "ya", "ya");
  check("nama dompet lawan", keluar.pasangan_dompet_name, "Bank Jenius");
}

step("Halaman ringkasan & laporan menampilkan angka yang sama");
{
  const ringkasan = await get("/");
  check("status /", ringkasan.status, 200);
  checkIncludes("total biaya bulan ini", ringkasan.body, rupiah(8006500));
  checkIncludes("saldo semua dompet", ringkasan.body, rupiah(3493500));

  const laporan = await get("/laporan");
  check("status /laporan", laporan.status, 200);
  checkIncludes("laporan memuat total biaya", laporan.body, rupiah(8006500));
  checkIncludes("laporan menyebut divisi Ads", laporan.body, "Ads");
  checkIncludes("laporan menyebut divisi Endorse", laporan.body, "Endorse");

  const csv = await fetch(`${BASE}/api/export`, { headers: { cookie } });
  const teks = await csv.text();
  check("ekspor CSV terunduh", csv.status, 200);
  const baris = teks.trim().split("\r\n").length - 1;
  check("jumlah baris CSV", baris, one(`SELECT COUNT(*) AS n FROM transaksi`).n);
  checkIncludes("CSV memuat kolom pengaruh biaya", teks, "Pengaruh biaya");
}

step("Penjagaan: hal-hal yang harus ditolak");
{
  const jago = one(`SELECT id FROM dompet WHERE name='Bank Jago'`).id;

  const samaDompet = await submit("/dompet/transfer", 'name="dompet_asal_id"', {
    tanggal: "2026-08-15",
    dompet_asal_id: jago,
    dompet_tujuan_id: jago,
    nominal: "100.000",
    biaya_admin: "",
    keterangan: "",
    no_ref: "",
  });
  checkIncludes(
    "transfer ke dompet yang sama ditolak",
    samaDompet.body,
    "tidak boleh sama",
  );

  const nominalNgawur = await submit("/belanja/harian", 'name="row_nominal"', {
    tanggal: "2026-08-16",
    dompet_id: jago,
    row_platform: [one(`SELECT id FROM platform LIMIT 1`).id],
    row_divisi: [one(`SELECT id FROM divisi LIMIT 1`).id],
    row_brand: [""],
    row_akun: [""],
    row_nominal: ["dua juta"],
    row_ket: [""],
  });
  checkIncludes("nominal tak terbaca ditolak", nominalNgawur.body, "tidak terbaca");

  const tanpaPlatform = await submit("/belanja/harian", 'name="row_nominal"', {
    tanggal: "2026-08-16",
    dompet_id: jago,
    row_platform: [""],
    row_divisi: [""],
    row_brand: [""],
    row_akun: [""],
    row_nominal: ["100.000"],
    row_ket: [""],
  });
  checkIncludes("baris tanpa platform ditolak", tanpaPlatform.body, "platform belum dipilih");

  check(
    "tidak ada baris tambahan yang lolos",
    one(`SELECT COUNT(*) AS n FROM transaksi WHERE tanggal='2026-08-16'`).n,
    0,
  );
}

console.log(
  gagal === 0
    ? `\n✓ ${langkah.length} langkah, semua pemeriksaan lolos.`
    : `\n✗ ${gagal} pemeriksaan gagal.`,
);
process.exit(gagal === 0 ? 0 : 1);
