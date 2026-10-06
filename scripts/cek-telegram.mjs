/**
 * Uji alur persetujuan lewat bot Telegram, tanpa Telegram sungguhan.
 *
 * Skrip ini menjalankan server Bot API tiruan yang mencatat setiap panggilan
 * bot, lalu memainkan peran Telegram: mengirim ketukan tombol dan pesan ke
 * webhook aplikasi, persis seperti yang dikirim Telegram.
 *
 * Jalankan SETELAH scripts/e2e.mjs, pada basis data yang sama, dan aplikasinya
 * harus dijalankan dengan:
 *   TELEGRAM_BOT_TOKEN=uji TELEGRAM_WEBHOOK_SECRET=rahasia-uji
 *   TELEGRAM_API_BASE=http://localhost:3399
 *
 *   node scripts/cek-telegram.mjs http://localhost:3002 /path/marketing.db
 */
import http from "node:http";
import { DatabaseSync } from "node:sqlite";

const BASE = process.argv[2] ?? "http://localhost:3000";
const DB = process.argv[3];
const SECRET = "rahasia-uji";

const GRUP_DIVISI = -500;
const GRUP_BAYAR = -600;
const TG = { berto: 1001, sari: 1002, rina: 1003 };

let gagal = 0;
const check = (label, got, want) => {
  const ok = got === want;
  if (!ok) gagal++;
  console.log(`${ok ? "OK  " : "GAGAL"} ${label}: ${got}${ok ? "" : ` (harusnya ${want})`}`);
};
const step = (s) => console.log(`\n── ${s}`);

/* ------------------------------------------------- server Bot API tiruan */

/** Setiap panggilan bot: { method, body } — body JSON, atau penanda multipart. */
let calls = [];
let nextMsg = 100;
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==",
  "base64",
);

const fake = http.createServer((req, res) => {
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    if (req.url.startsWith("/file/")) {
      res.writeHead(200, { "content-type": "image/jpeg" });
      return res.end(PNG);
    }
    const method = req.url.split("/").pop();
    const raw = Buffer.concat(chunks).toString("utf8");
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      // multipart (album bukti): cukup catat chat_id-nya
      body = { multipart: true, chat_id: Number(/name="chat_id"\r\n\r\n(-?\d+)/.exec(raw)?.[1]) };
    }
    calls.push({ method, body });
    const result =
      method === "getFile"
        ? { file_path: `photos/${body.file_id}.jpg` }
        : method === "sendMessage" || method === "sendPhoto"
          ? { message_id: nextMsg++ }
          : method === "sendMediaGroup"
            ? [{ message_id: nextMsg++ }]
            : true;
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, result }));
  });
});
await new Promise((r) => fake.listen(3399, r));

/* ----------------------------------------------------------- pembantu */

const db = () => new DatabaseSync(DB);
const one = (sql, ...p) => {
  const d = db();
  try {
    return d.prepare(sql).get(...p);
  } finally {
    d.close();
  }
};
const exec = (sql, ...p) => {
  const d = db();
  try {
    d.prepare(sql).run(...p);
  } finally {
    d.close();
  }
};

let updateId = 1;
async function webhook(update, secret = SECRET) {
  const r = await fetch(`${BASE}/api/telegram`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-telegram-bot-api-secret-token": secret },
    body: JSON.stringify({ update_id: updateId++, ...update }),
  });
  return r.status;
}
const tekan = (dari, data, chat = GRUP_BAYAR, messageId = 1) =>
  webhook({
    callback_query: {
      id: `cb${updateId}`,
      from: { id: dari },
      data,
      message: { message_id: messageId, chat: { id: chat, type: "supergroup" } },
    },
  });
const kirim = (dari, isi) =>
  webhook({
    message: { message_id: updateId, chat: { id: dari, type: "private" }, from: { id: dari }, ...isi },
  });

const panggilan = (method) => calls.filter((c) => c.method === method);
const alertTerakhir = () => panggilan("answerCallbackQuery").at(-1)?.body;

// Sesi aplikasi untuk membuat pengajuan lewat formulir sungguhan.
let cookie = "";
async function get(path) {
  const res = await fetch(BASE + path, { headers: cookie ? { cookie } : {}, redirect: "manual" });
  return { status: res.status, body: res.status === 200 ? await res.text() : "" };
}
async function submit(path, penanda, data) {
  const page = await get(path);
  const block = page.body.split("<form").find((b) => b.includes(penanda));
  if (!block) throw new Error(`form "${penanda}" tidak ada di ${path}`);
  const fd = new FormData();
  for (const m of block.matchAll(/name="(\$ACTION[^"]*)"(?:\s+value="([^"]*)")?/g))
    fd.set(m[1], (m[2] ?? "").replaceAll("&quot;", '"').replaceAll("&amp;", "&"));
  for (const [k, v] of Object.entries(data)) fd.set(k, String(v));
  const res = await fetch(BASE + path, { method: "POST", headers: cookie ? { cookie } : {}, body: fd, redirect: "manual" });
  for (const c of res.headers.getSetCookie?.() ?? []) if (c.startsWith("ledger_sess=")) cookie = c.split(";")[0];
  return res;
}
async function login(username) {
  cookie = "";
  await submit("/login", 'name="username"', { username, password: "rahasia123" });
}
async function ajukan(keterangan) {
  const endorse = one(`SELECT id FROM divisi WHERE name='Endorse'`).id;
  await submit("/pengajuan/baru", 'name="keterangan"', {
    tanggal: "2026-09-01",
    keterangan,
    nominal: "2.000.000",
    tujuan: "langsung",
    penerima_no_rek: "0987654321",
    penerima_nama: "Dewi Endorser",
    penerima_bank: "BCA",
    platform_id: "",
    divisi_id: endorse,
    brand_id: "",
    catatan: "",
  });
  return one(`SELECT * FROM pengajuan ORDER BY id DESC LIMIT 1`);
}

/* ---------------------------------------------------------------- uji */

step("Persiapan: leader, ID Telegram, dan grup");
{
  await login("berto");
  exec(
    // Rina juga diberi izin penyetuju, supaya aturan "leader tidak boleh
    // merangkap penyetuju pengajuan yang ia loloskan" benar-benar teruji.
    `INSERT INTO users (username, pass_hash, name, role, active, perms, created_at)
     SELECT 'rina', pass_hash, 'Rina', 'staff', 1, '{"approveBayar":true}', ?
     FROM users WHERE username = 'berto'`,
    new Date().toISOString(),
  );
  const rina = one(`SELECT id FROM users WHERE username='rina'`).id;
  exec(`UPDATE users SET telegram_id = ? WHERE username = 'berto'`, TG.berto);
  exec(`UPDATE users SET telegram_id = ? WHERE username = 'sari'`, TG.sari);
  exec(`UPDATE users SET telegram_id = ? WHERE username = 'rina'`, TG.rina);
  exec(`UPDATE divisi SET leader_id = ?, telegram_chat_id = ? WHERE name = 'Endorse'`, rina, GRUP_DIVISI);
  exec(`INSERT OR REPLACE INTO settings (key, value) VALUES ('telegram_grup_bayar', ?)`, String(GRUP_BAYAR));
  check("rina jadi leader Endorse", one(`SELECT leader_id FROM divisi WHERE name='Endorse'`).leader_id, rina);
}

step("Webhook menolak kiriman tanpa header rahasia");
check("tanpa rahasia → 403", await webhook({ message: { text: "/id" } }, "salah"), 403);

step("Staff mengajukan → bot posting ke grup divisi");
calls = [];
const g1 = await ajukan("Endorse uji Telegram");
{
  const kirimDiv = panggilan("sendMessage").find((c) => c.body.chat_id === GRUP_DIVISI);
  check("pesan masuk grup divisi", Boolean(kirimDiv), true);
  check("pesan memuat format finance", kirimDiv?.body.text.includes("Rekening : BCA 0987654321 (Dewi Endorser)"), true);
  check("tombol leader ada", kirimDiv?.body.reply_markup.inline_keyboard[0][0].callback_data, `L1:${g1.id}`);
  check("belum ada posting ke grup pembayaran", panggilan("sendMessage").some((c) => c.body.chat_id === GRUP_BAYAR), false);
}

step("Hanya leader divisi yang bisa menyetujui di grup divisi");
calls = [];
await tekan(TG.sari, `L1:${g1.id}`, GRUP_DIVISI);
check("bukan leader ditolak", alertTerakhir()?.text.startsWith("Hanya leader"), true);
check("status tetap menunggu leader", one(`SELECT leader_at FROM pengajuan WHERE id=?`, g1.id).leader_at, null);
await tekan(9999, `L1:${g1.id}`, GRUP_DIVISI);
check("akun Telegram tak terdaftar ditolak", alertTerakhir()?.text.includes("belum terdaftar"), true);

calls = [];
await tekan(TG.rina, `L1:${g1.id}`, GRUP_DIVISI);
{
  check("leader menyetujui lewat Telegram", Boolean(one(`SELECT leader_at FROM pengajuan WHERE id=?`, g1.id).leader_at), true);
  const kirimBayar = panggilan("sendMessage").find((c) => c.body.chat_id === GRUP_BAYAR);
  check("diteruskan ke grup pembayaran", Boolean(kirimBayar), true);
  check("tombol penyetuju ada", kirimBayar?.body.reply_markup.inline_keyboard[0][0].callback_data, `B1:${g1.id}`);
  const editDiv = panggilan("editMessageText").find((c) => c.body.chat_id === GRUP_DIVISI);
  check("pesan grup divisi diperbarui, tombol dicabut", editDiv?.body.reply_markup.inline_keyboard.length, 0);
  check(
    "keputusan tercatat lewat telegram",
    one(`SELECT lewat FROM pengajuan_persetujuan WHERE pengajuan_id=? AND tahap='leader'`, g1.id).lewat,
    "telegram",
  );
}

step("Penyetuju pembayaran: leader tidak boleh merangkap, satu persetujuan cukup");
calls = [];
await tekan(TG.rina, `B1:${g1.id}`);
check("leader tidak bisa merangkap penyetuju", alertTerakhir()?.text.includes("Leader yang meloloskan"), true);
await tekan(TG.sari, `B1:${g1.id}`);
check("status jadi siap dibayar", one(`SELECT status FROM pengajuan WHERE id=?`, g1.id).status, "disetujui");
{
  const edit = panggilan("editMessageText").find((c) => c.body.chat_id === GRUP_BAYAR);
  check("tombol berganti jadi 💸 Bayar", edit?.body.reply_markup.inline_keyboard[0][0].callback_data, `P:${g1.id}`);
}

step("Finance membayar: bukti foto + link lewat chat pribadi");
calls = [];
await tekan(TG.sari, `P:${g1.id}`);
check("yang bukan finance ditolak", alertTerakhir()?.text.startsWith("Hanya finance"), true);
await tekan(TG.berto, `P:${g1.id}`);
check("bot meminta bukti di chat pribadi", panggilan("sendMessage").some((c) => c.body.chat_id === TG.berto), true);

await kirim(TG.berto, { photo: [{ file_id: "kecil", width: 90 }, { file_id: "FOTO1", width: 1280 }] });
await kirim(TG.berto, { photo: [{ file_id: "FOTO2", width: 1280 }] });
await kirim(TG.berto, { text: "ini linknya https://drive.google.com/bukti-1" });
{
  const t = JSON.parse(one(`SELECT data FROM telegram_tunggu WHERE telegram_id=?`, TG.berto).data);
  check("dua foto (ukuran terbesar) terkumpul", t.foto.map((f) => f.id).join(","), "FOTO1,FOTO2");
  check("link terkumpul", t.link.join(","), "https://drive.google.com/bukti-1");
}

calls = [];
await tekan(TG.berto, `PS:${g1.id}`, TG.berto);
{
  const g = one(`SELECT * FROM pengajuan WHERE id=?`, g1.id);
  check("status jadi dibayar", g.status, "dibayar");
  check("link bukti tersimpan", g.bukti_links, "https://drive.google.com/bukti-1");
  const tx = one(`SELECT id, jenis, nominal FROM transaksi WHERE pengajuan_id=?`, g1.id);
  check("baris pengeluaran lahir", tx?.jenis, "belanja");
  check("nominal penuh", tx?.nominal, 2000000);
  check("dua foto tersimpan di aplikasi", one(`SELECT COUNT(*) AS n FROM attachments WHERE tx_id=?`, tx.id).n, 2);
  const album = calls.find((c) => (c.method === "sendMediaGroup" || c.method === "sendPhoto") && c.body.chat_id === GRUP_BAYAR);
  check("album bukti dikirim ke grup pembayaran", Boolean(album), true);
  check("sesi bukti ditutup", one(`SELECT COUNT(*) AS n FROM telegram_tunggu WHERE telegram_id=?`, TG.berto).n, 0);
}

step("Leader menolak: bot meminta alasan di chat pribadi");
{
  await login("berto");
  const g2 = await ajukan("Endorse yang akan ditolak");
  calls = [];
  await tekan(TG.rina, `L0:${g2.id}`, GRUP_DIVISI);
  check("bot meminta alasan ke leader", panggilan("sendMessage").some((c) => c.body.chat_id === TG.rina), true);
  check("belum ditolak sebelum ada alasan", one(`SELECT status FROM pengajuan WHERE id=?`, g2.id).status, "diajukan");
  await kirim(TG.rina, { text: "ok" });
  check("alasan terlalu pendek ditolak", one(`SELECT status FROM pengajuan WHERE id=?`, g2.id).status, "diajukan");
  await kirim(TG.rina, { text: "nominal kebesaran" });
  const g = one(`SELECT status, alasan_tolak FROM pengajuan WHERE id=?`, g2.id);
  check("status jadi ditolak", g.status, "ditolak");
  check("alasan tersimpan", g.alasan_tolak, "nominal kebesaran");
  const edit = panggilan("editMessageText").find((c) => c.body.chat_id === GRUP_DIVISI);
  check("grup divisi melihat alasannya", edit?.body.text.includes("nominal kebesaran"), true);
  check("tidak pernah sampai ke grup pembayaran", panggilan("sendMessage").some((c) => c.body.chat_id === GRUP_BAYAR), false);
}

step("Leader yang mengajukan sendiri langsung ke grup pembayaran");
{
  await login("rina");
  calls = [];
  const g3 = await ajukan("Diajukan leader sendiri");
  check("tahap leader terlewati", Boolean(one(`SELECT leader_at FROM pengajuan WHERE id=?`, g3.id).leader_at), true);
  check("langsung diposting ke grup pembayaran", panggilan("sendMessage").some((c) => c.body.chat_id === GRUP_BAYAR), true);
}

fake.close();
console.log(gagal === 0 ? "\n✓ Semua pemeriksaan Telegram lolos." : `\n✗ ${gagal} pemeriksaan gagal.`);
process.exit(gagal === 0 ? 0 : 1);
