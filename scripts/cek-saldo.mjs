/**
 * Memeriksa dua kolom turunan yang menentukan seluruh angka pembukuan ini:
 * pengaruh tiap jenis baris ke saldo dompet dan ke total biaya. Dijalankan
 * langsung di atas database sungguhan, jadi yang diuji skema dan view-nya —
 * bukan tiruannya.
 *
 *   node scripts/cek-saldo.mjs <path/marketing.db>
 *
 * Database yang dipakai harus yang boleh dikotori: skrip ini mengosongkan tabel
 * transaksi dan dompet sebelum dan sesudah bekerja.
 */
import { DatabaseSync } from "node:sqlite";

const file = process.argv[2];
if (!file) {
  console.error("Sebutkan path database: node scripts/cek-saldo.mjs <marketing.db>");
  process.exit(2);
}

const db = new DatabaseSync(file);
db.exec("PRAGMA foreign_keys = ON");

const one = (sql, ...p) => db.prepare(sql).get(...p);
const run = (sql, ...p) => db.prepare(sql).run(...p);
const now = new Date().toISOString();

let fail = 0;
const check = (label, got, want) => {
  const ok = got === want;
  if (!ok) fail++;
  console.log(`${ok ? "OK  " : "GAGAL"} ${label}: ${got}${ok ? "" : ` (harusnya ${want})`}`);
};
const rejects = (label, fn) => {
  try {
    fn();
    fail++;
    console.log(`GAGAL ${label}: baris cacat malah diterima`);
  } catch {
    console.log(`OK   ${label}: ditolak database`);
  }
};

run("DELETE FROM transaksi");
run("DELETE FROM dompet_opname");
run("DELETE FROM dompet");

run(
  `INSERT INTO dompet (name, jenis, bank, no_rek, pemilik, saldo_awal, tanggal_awal, min_saldo, created_at)
   VALUES ('Uji Jago', 'bank', 'Jago', '1234567890', 'Uji', 1000000, '2026-08-01', 500000, ?)`,
  now,
);
const w = one(`SELECT id FROM dompet WHERE name = 'Uji Jago'`).id;
const divisi = one(`SELECT id FROM divisi ORDER BY id LIMIT 1`).id;
const platform = one(`SELECT id FROM platform ORDER BY id LIMIT 1`).id;

const tx = (jenis, nominal, extra = {}) => {
  const cols = ["tanggal", "jenis", "nominal", "created_at"];
  const vals = ["2026-08-10", jenis, nominal, now];
  for (const [k, v] of Object.entries(extra)) {
    cols.push(k);
    vals.push(v);
  }
  run(
    `INSERT INTO transaksi (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`,
    ...vals,
  );
};

tx("topup", 5000000, { dompet_id: w });
tx("belanja", 2000000, {
  sumber: "dompet", dompet_id: w, divisi_id: divisi, platform_id: platform,
});
tx("belanja", 1500000, { sumber: "finance", divisi_id: divisi, platform_id: platform });
tx("refund", 200000, { dompet_id: w, divisi_id: divisi, platform_id: platform });
tx("biaya_dompet", 6500, { dompet_id: w });
tx("koreksi", 3500, { dompet_id: w, arah: -1 });

// 1.000.000 + 5.000.000 − 2.000.000 + 200.000 − 6.500 − 3.500
check("sisa saldo dompet", one(`SELECT sisa FROM v_saldo_dompet WHERE id = ?`, w).sisa, 4190000);

// 2.000.000 + 1.500.000 − 200.000 + 6.500 ; top-up dan koreksi tidak masuk
check(
  "total biaya marketing",
  one(`SELECT IFNULL(SUM(delta_biaya), 0) AS v FROM v_transaksi`).v,
  3306500,
);
check(
  "top-up tidak dihitung biaya",
  one(`SELECT IFNULL(SUM(delta_biaya), 0) AS v FROM v_transaksi WHERE jenis = 'topup'`).v,
  0,
);
check(
  "belanja finance tidak menyentuh saldo dompet",
  one(
    `SELECT IFNULL(SUM(delta_saldo), 0) AS v FROM v_transaksi
     WHERE jenis = 'belanja' AND sumber = 'finance'`,
  ).v,
  0,
);
check(
  "biaya kelompok pertama",
  one(`SELECT IFNULL(SUM(delta_biaya), 0) AS v FROM v_transaksi WHERE divisi_id = ?`, divisi).v,
  3300000,
);

rejects("belanja tanpa sumber dana", () => tx("belanja", 1000, { divisi_id: divisi }));
rejects("top-up tanpa dompet", () => tx("topup", 1000));
rejects("belanja dompet tanpa dompet_id", () =>
  tx("belanja", 1000, { sumber: "dompet", divisi_id: divisi }),
);
rejects("nominal nol", () => tx("belanja", 0, { sumber: "finance" }));
rejects("jenis di luar daftar", () => tx("entah", 1000));
rejects("koreksi dengan arah aneh", () => tx("koreksi", 1000, { dompet_id: w, arah: 2 }));

run("DELETE FROM transaksi");
run("DELETE FROM dompet");

console.log(fail === 0 ? "\nSemua pemeriksaan lolos." : `\n${fail} pemeriksaan gagal.`);
process.exit(fail === 0 ? 0 : 1);
