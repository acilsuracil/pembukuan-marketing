import { DatabaseSync } from "node:sqlite";

const file = process.argv[2];
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
run("DELETE FROM dompet");

const mkDompet = (name, saldo) => {
  run(
    `INSERT INTO dompet (name, jenis, saldo_awal, tanggal_awal, created_at)
     VALUES (?, 'bank', ?, '2026-08-01', ?)`,
    name, saldo, now,
  );
  return one(`SELECT id FROM dompet WHERE name = ?`, name).id;
};

const a = mkDompet("Uji A", 3000000);
const b = mkDompet("Uji B", 500000);

const totalSaldo = () => one(`SELECT IFNULL(SUM(sisa), 0) AS v FROM v_saldo_dompet`).v;
const sisa = (id) => one(`SELECT sisa FROM v_saldo_dompet WHERE id = ?`, id).sisa;
const totalBiaya = () => one(`SELECT IFNULL(SUM(delta_biaya), 0) AS v FROM v_transaksi`).v;

check("total saldo awal", totalSaldo(), 3500000);

// Pindah 1.200.000 dari A ke B — dua baris berpasangan, seperti yang ditulis aksi.
const insTransfer = (jenis, dompetId, ket) =>
  Number(
    run(
      `INSERT INTO transaksi (tanggal, jenis, nominal, dompet_id, keterangan, created_at)
       VALUES ('2026-08-15', ?, 1200000, ?, ?, ?)`,
      jenis, dompetId, ket, now,
    ).lastInsertRowid,
  );
const keluar = insTransfer("transfer_keluar", a, "Pindah saldo ke Uji B");
const masuk = insTransfer("transfer_masuk", b, "Pindah saldo dari Uji A");
run(`UPDATE transaksi SET pasangan_id = ? WHERE id = ?`, masuk, keluar);
run(`UPDATE transaksi SET pasangan_id = ? WHERE id = ?`, keluar, masuk);

check("sisa A setelah pindah", sisa(a), 1800000);
check("sisa B setelah pindah", sisa(b), 1700000);
check("total saldo tidak berubah", totalSaldo(), 3500000);
check("pindah saldo bukan biaya", totalBiaya(), 0);
check(
  "pasangan saling menunjuk",
  one(`SELECT pasangan_id FROM transaksi WHERE id = ?`, masuk).pasangan_id,
  keluar,
);
check(
  "nama dompet lawan terbaca dari view",
  one(`SELECT pasangan_dompet_name AS n FROM v_transaksi WHERE id = ?`, keluar).n,
  "Uji B",
);

// Biaya transfernya sendiri memang biaya, dan hanya membebani dompet asal.
run(
  `INSERT INTO transaksi (tanggal, jenis, nominal, dompet_id, keterangan, created_at)
   VALUES ('2026-08-15', 'biaya_dompet', 6500, ?, 'Biaya transfer ke Uji B', ?)`,
  a, now,
);
check("biaya transfer masuk total biaya", totalBiaya(), 6500);
check("biaya transfer memotong dompet asal", sisa(a), 1793500);

// Menghapus transfer harus mengambil kedua sisinya.
run(`DELETE FROM transaksi WHERE id = ? OR id = ?`, keluar, masuk);
check("sisa A setelah transfer dihapus", sisa(a), 2993500);
check("sisa B setelah transfer dihapus", sisa(b), 500000);

rejects("transfer tanpa dompet", () =>
  run(
    `INSERT INTO transaksi (tanggal, jenis, nominal, created_at)
     VALUES ('2026-08-15', 'transfer_keluar', 1000, ?)`,
    now,
  ),
);
rejects("transfer dengan sumber dana terisi", () =>
  run(
    `INSERT INTO transaksi (tanggal, jenis, nominal, dompet_id, sumber, created_at)
     VALUES ('2026-08-15', 'transfer_masuk', 1000, ?, 'dompet', ?)`,
    a, now,
  ),
);

run("DELETE FROM transaksi");
run("DELETE FROM dompet");

console.log(fail === 0 ? "\nSemua pemeriksaan lolos." : `\n${fail} pemeriksaan gagal.`);
process.exit(fail === 0 ? 0 : 1);
