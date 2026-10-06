import { all, getSetting, one, run, tx as inTransaction } from "./db";
import { brandFinance, fmtDate, fmtIdr, linkFinance, pisahLink } from "./format";
import { rekLine } from "./opts";
import { hasPerm, logActivity, type Principal } from "./policy";
import { attachmentsOf, brandPengajuan, getDivisi, getPengajuan, listTransaksi } from "./queries";
import { getObject } from "./storage";
import { esc, kirimAlbum, kirimPesan, ubahPesan, type TgButton } from "./telegram";
import type { PengajuanRow } from "./types";

/**
 * Alur persetujuan pengajuan:
 *
 *   staff ajukan → leader divisi (grup divisi) → penyetuju pembayaran (grup
 *   pembayaran) → finance bayar + bukti → dibayar
 *
 * Setiap langkah bisa diambil dari aplikasi maupun dari tombol Telegram; dua
 * jalur itu memanggil fungsi yang sama di sini, jadi aturannya satu.
 */

/** Berapa persetujuan pembayaran yang dibutuhkan sebelum finance boleh membayar. */
export const JUMLAH_PERSETUJUAN = 1;

export type Tahap = "draft" | "leader" | "bayar" | "siap" | "ditolak" | "dibayar";

export type Pelaku = Pick<Principal, "id" | "username" | "role" | "perms"> & { name?: string };

export function tahapOf(g: Pick<PengajuanRow, "status" | "leader_at">): Tahap {
  switch (g.status) {
    case "draft":
      return "draft";
    case "diajukan":
      return g.leader_at ? "bayar" : "leader";
    case "disetujui":
      return "siap";
    case "ditolak":
      return "ditolak";
    default:
      return "dibayar";
  }
}

export const TAHAP_LABEL: Record<Tahap, string> = {
  draft: "Draft",
  leader: "Menunggu leader",
  bayar: "Menunggu persetujuan",
  siap: "Siap dibayar",
  ditolak: "Ditolak",
  dibayar: "Dibayar",
};

/* ---------------------------------------------------------------- siapa boleh */

/**
 * Leader divisi pengajuan ini. Owner hanya jadi cadangan untuk divisi yang
 * belum punya leader — begitu leader dipilih, hanya dia yang memutuskan.
 */
export function bisaLeader(user: Pelaku, g: PengajuanRow): boolean {
  const d = g.divisi_id ? getDivisi(g.divisi_id) : undefined;
  if (d?.leader_id) return d.leader_id === user.id;
  return user.role === "owner";
}

/**
 * Penyetuju pembayaran: punya izinnya, dan bukan pembuat pengajuan maupun leader
 * yang meloloskannya — persetujuan yang berarti datang dari orang ketiga.
 */
export function bisaSetujuiBayar(user: Pelaku, g: PengajuanRow): string | null {
  if (!hasPerm(user, "approveBayar")) return "Anda tidak punya izin persetujuan pembayaran.";
  if (user.id === g.created_by) return "Pembuat pengajuan tidak bisa menyetujui pembayarannya sendiri.";
  if (user.id === g.leader_by) return "Leader yang meloloskan tidak bisa sekaligus jadi penyetuju pembayaran.";
  return null;
}

/**
 * Pembayaran: hanya peran Finance, dan bukan orang yang menyetujui
 * pembayaran pengajuan ini. Menyetujui dan mengeksekusi pembayaran yang sama
 * adalah dua tugas yang sengaja dipisah.
 */
export function bisaBayar(user: Pelaku, g: Pick<PengajuanRow, "id">): string | null {
  if (user.role !== "finance") return "Hanya Finance yang bisa melakukan pembayaran.";
  const penyetuju = one(
    `SELECT 1 FROM pengajuan_persetujuan
     WHERE pengajuan_id = ? AND tahap = 'bayar' AND setuju = 1 AND user_id = ?`,
    g.id, user.id,
  );
  if (penyetuju) return "Penyetuju pembayaran tidak bisa sekaligus membayar pengajuan yang ia setujui.";
  return null;
}

/** Akun aplikasi milik sebuah akun Telegram, kalau sudah dipasangkan dan aktif. */
export function penggunaTelegram(telegramId: number): Pelaku | undefined {
  return one<Pelaku>(
    `SELECT id, username, name, role, perms FROM users
     WHERE telegram_id = ? AND active = 1`,
    telegramId,
  );
}

/* ------------------------------------------------------------------ riwayat */

export interface Keputusan {
  tahap: "leader" | "bayar";
  setuju: number;
  alasan: string;
  lewat: "app" | "telegram";
  ts: string;
  user_id: number | null;
  nama: string;
}

export function keputusanOf(pengajuanId: number): Keputusan[] {
  return all<Keputusan>(
    `SELECT p.tahap, p.setuju, p.alasan, p.lewat, p.ts, p.user_id,
            IFNULL(NULLIF(u.name, ''), IFNULL(u.username, '(akun dihapus)')) AS nama
     FROM pengajuan_persetujuan p
     LEFT JOIN users u ON u.id = p.user_id
     WHERE p.pengajuan_id = ?
     ORDER BY p.ts, p.id`,
    pengajuanId,
  );
}

/* --------------------------------------------------------------- keputusan */

export type Hasil = { ok: true; message: string } | { ok: false; error: string };

/**
 * Pengajuan baru saja masuk status 'diajukan'. Leader yang mengajukan untuk
 * divisinya sendiri tidak menunggu dirinya sendiri: tahap leader langsung
 * dianggap lolos dan pengajuannya terus ke penyetuju pembayaran.
 */
export function setelahDiajukan(pengajuanId: number) {
  const g = getPengajuan(pengajuanId);
  if (!g || tahapOf(g) !== "leader" || !g.created_by || !g.divisi_id) return;
  const d = getDivisi(g.divisi_id);
  if (d?.leader_id !== g.created_by) return;

  const now = new Date().toISOString();
  inTransaction(() => {
    run(
      `INSERT OR IGNORE INTO pengajuan_persetujuan
         (pengajuan_id, tahap, user_id, setuju, alasan, lewat, ts)
       VALUES (?, 'leader', ?, 1, 'diajukan oleh leader sendiri', 'app', ?)`,
      g.id, g.created_by, now,
    );
    run(
      `UPDATE pengajuan SET leader_by = ?, leader_at = ? WHERE id = ?`,
      g.created_by, now, g.id,
    );
  });
}

/**
 * Satu keputusan leader atau penyetuju pembayaran. Menolak wajib beralasan —
 * staff perlu tahu apa yang harus diperbaiki.
 *
 * Seluruh pemeriksaannya diulang di dalam transaksi terhadap data terbaru:
 * dua orang yang menekan tombol hampir bersamaan tidak boleh sama-sama lolos
 * dari keadaan lama.
 */
export function putuskan(args: {
  pengajuanId: number;
  user: Pelaku;
  tahap: "leader" | "bayar";
  setuju: boolean;
  alasan?: string;
  lewat: "app" | "telegram";
}): Hasil {
  const alasan = (args.alasan ?? "").trim();
  if (!args.setuju && alasan.length < 3)
    return { ok: false, error: "Tulis alasan penolakannya (minimal 3 karakter)." };

  return inTransaction((): Hasil => {
    const g = getPengajuan(args.pengajuanId);
    if (!g) return { ok: false, error: "Pengajuan tidak ditemukan." };
    const t = tahapOf(g);

    if (t !== args.tahap)
      return {
        ok: false,
        error:
          t === "ditolak"
            ? "Pengajuan ini sudah ditolak."
            : t === "dibayar"
              ? "Pengajuan ini sudah dibayar."
              : `Pengajuan ini sedang di tahap "${TAHAP_LABEL[t]}", bukan tahap ini.`,
      };

    if (args.tahap === "leader" && !bisaLeader(args.user, g)) {
      const d = g.divisi_id ? getDivisi(g.divisi_id) : undefined;
      return {
        ok: false,
        error: `Hanya leader ${d?.name ?? "divisi ini"} yang bisa memutuskan tahap ini.`,
      };
    }
    if (args.tahap === "bayar") {
      const tidak = bisaSetujuiBayar(args.user, g);
      if (tidak) return { ok: false, error: tidak };
    }

    const now = new Date().toISOString();
    try {
      run(
        `INSERT INTO pengajuan_persetujuan
           (pengajuan_id, tahap, user_id, setuju, alasan, lewat, ts)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        g.id, args.tahap, args.user.id, args.setuju ? 1 : 0, alasan, args.lewat, now,
      );
    } catch {
      return { ok: false, error: "Anda sudah memberi keputusan untuk pengajuan ini." };
    }

    let message: string;
    if (!args.setuju) {
      run(
        `UPDATE pengajuan SET status = 'ditolak', alasan_tolak = ?, updated_at = ? WHERE id = ?`,
        alasan, now, g.id,
      );
      message = `Pengajuan #${g.id} ditolak.`;
    } else if (args.tahap === "leader") {
      run(
        `UPDATE pengajuan SET leader_by = ?, leader_at = ?, updated_at = ? WHERE id = ?`,
        args.user.id, now, now, g.id,
      );
      message = `Pengajuan #${g.id} disetujui dan diteruskan ke penyetuju pembayaran.`;
    } else {
      const n =
        one<{ n: number }>(
          `SELECT COUNT(*) AS n FROM pengajuan_persetujuan
           WHERE pengajuan_id = ? AND tahap = 'bayar' AND setuju = 1`,
          g.id,
        )?.n ?? 0;
      if (n >= JUMLAH_PERSETUJUAN) {
        run(
          `UPDATE pengajuan SET status = 'disetujui', updated_at = ? WHERE id = ?`,
          now, g.id,
        );
        message = `Pengajuan #${g.id} disetujui — siap dibayar finance.`;
      } else {
        message = `Persetujuan tercatat (${n}/${JUMLAH_PERSETUJUAN}).`;
      }
    }

    logActivity(
      args.user,
      `${args.setuju ? "setujui" : "tolak"}-${args.tahap}`,
      `#${g.id}${alasan ? ` — ${alasan}` : ""}${args.lewat === "telegram" ? " (Telegram)" : ""}`,
    );
    return { ok: true, message };
  });
}

/* ---------------------------------------------------------------- telegram */

export function grupBayar(): number | null {
  const v = Number(getSetting("telegram_grup_bayar"));
  return Number.isInteger(v) && v !== 0 ? v : null;
}

/** Format untuk finance — sama dengan yang ditampilkan di halaman detail. */
export function teksFinance(g: PengajuanRow): string {
  const porsi = brandPengajuan(g.id);
  const rek =
    g.tujuan === "dompet"
      ? rekLine(
          g.dompet_bank || g.dompet_name || "",
          g.dompet_no_rek ?? "",
          g.dompet_pemilik || g.dompet_name || "",
        )
      : g.penerima_nama
        ? rekLine(g.penerima_bank ?? "", g.penerima_no_rek ?? "", g.penerima_nama)
        : "—";
  return [
    `Keterangan : ${g.keterangan}`,
    `Nominal : ${fmtIdr(g.nominal)}`,
    `Rekening : ${rek}`,
    brandFinance(
      g.brand_name ?? "",
      porsi.map((p) => ({ nama: p.brand_name, nominal: p.nominal })),
    ),
    `Category : ${g.platform_name ?? "—"}`,
    `Divisi : ${g.divisi_name ?? "—"}`,
    ...linkFinance(pisahLink(g.links)),
  ].join("\n");
}

const jam = (iso: string) =>
  new Date(iso).toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

/** Badan pesan + baris-baris status di bawahnya, untuk grup divisi maupun pembayaran. */
function teksPesan(g: PengajuanRow, jenis: "divisi" | "bayar"): string {
  const keputusan = keputusanOf(g.id);
  const baris: string[] = [];
  for (const k of keputusan) {
    const siapa = `${k.tahap === "leader" ? "Leader" : "Penyetuju"} ${esc(k.nama)}`;
    baris.push(
      k.setuju
        ? `✅ ${siapa} · ${jam(k.ts)}`
        : `❌ Ditolak ${siapa} · ${jam(k.ts)}\n<i>Alasan: ${esc(k.alasan)}</i>`,
    );
  }

  const t = tahapOf(g);
  if (t === "leader") baris.push("⏳ Menunggu persetujuan leader");
  if (t === "bayar")
    baris.push(
      jenis === "divisi"
        ? "⏳ Diteruskan ke grup pembayaran — menunggu persetujuan"
        : "⏳ Menunggu persetujuan pembayaran",
    );
  if (t === "siap") baris.push("🟢 Siap dibayar finance");
  if (t === "dibayar") {
    const bukti = pisahLink(g.bukti_links);
    baris.push(
      `💸 <b>Dibayar</b> ${g.tanggal_bayar ? fmtDate(g.tanggal_bayar) : ""}` +
        (g.nominal_cair ? ` · cair ${fmtIdr(g.nominal_cair)}` : ""),
    );
    for (const l of bukti) baris.push(`🔗 ${esc(l)}`);
  }

  return (
    `🧾 <b>Pengajuan #${g.id}</b> — dari ${esc(g.created_by_name ?? "–")}\n\n` +
    `<pre>${esc(teksFinance(g))}</pre>\n\n` +
    baris.join("\n")
  );
}

function tombolPesan(g: PengajuanRow, jenis: "divisi" | "bayar"): TgButton[][] {
  const t = tahapOf(g);
  if (jenis === "divisi" && t === "leader")
    return [
      [
        { text: "✅ Setujui & kirim ke pembayaran", callback_data: `L1:${g.id}` },
        { text: "❌ Tolak", callback_data: `L0:${g.id}` },
      ],
    ];
  if (jenis === "bayar" && t === "bayar")
    return [
      [
        { text: "✅ Setujui", callback_data: `B1:${g.id}` },
        { text: "❌ Tolak", callback_data: `B0:${g.id}` },
      ],
    ];
  if (jenis === "bayar" && t === "siap") return [[{ text: "💸 Bayar", callback_data: `P:${g.id}` }]];
  return [];
}

function pesanTersimpan(pengajuanId: number, jenis: "divisi" | "bayar") {
  return one<{ chat_id: number; message_id: number }>(
    `SELECT chat_id, message_id FROM telegram_pesan WHERE pengajuan_id = ? AND jenis = ?`,
    pengajuanId, jenis,
  );
}

/**
 * Menyamakan pesan Telegram dengan keadaan pengajuan sekarang: mengirim pesan
 * yang belum ada, memperbarui teks dan tombol yang sudah ada. Aman dipanggil
 * berulang — dipanggil setelah setiap perubahan, dari aplikasi maupun bot.
 */
export async function sinkronTelegram(pengajuanId: number): Promise<void> {
  const g = getPengajuan(pengajuanId);
  if (!g || g.status === "draft") return;
  const t = tahapOf(g);

  // Grup divisi: tempat pengajuan pertama kali muncul, dan tempat staff
  // mengikuti nasibnya sampai dibayar.
  const d = g.divisi_id ? getDivisi(g.divisi_id) : undefined;
  const pDiv = pesanTersimpan(g.id, "divisi");
  if (pDiv) {
    await ubahPesan(pDiv.chat_id, pDiv.message_id, teksPesan(g, "divisi"), tombolPesan(g, "divisi"));
  } else if (d?.telegram_chat_id) {
    const m = await kirimPesan(d.telegram_chat_id, teksPesan(g, "divisi"), tombolPesan(g, "divisi"));
    if (m) simpanPesan(g.id, "divisi", d.telegram_chat_id, m.message_id);
  }

  // Grup pembayaran: hanya yang sudah lolos leader. Yang ditolak leader tidak
  // pernah sampai ke sana.
  const lolosLeader = Boolean(g.leader_at);
  const gb = grupBayar();
  const pBayar = pesanTersimpan(g.id, "bayar");
  if (pBayar) {
    await ubahPesan(pBayar.chat_id, pBayar.message_id, teksPesan(g, "bayar"), tombolPesan(g, "bayar"));
  } else if (lolosLeader && gb && t !== "ditolak") {
    const m = await kirimPesan(gb, teksPesan(g, "bayar"), tombolPesan(g, "bayar"));
    if (m) simpanPesan(g.id, "bayar", gb, m.message_id);
  }
}

function simpanPesan(pengajuanId: number, jenis: "divisi" | "bayar", chatId: number, messageId: number) {
  run(
    `INSERT OR REPLACE INTO telegram_pesan (pengajuan_id, jenis, chat_id, message_id, ts)
     VALUES (?, ?, ?, ?, ?)`,
    pengajuanId, jenis, chatId, messageId, new Date().toISOString(),
  );
}

/**
 * Bukti bayar sebagai album yang membalas pesan pengajuan di grup pembayaran —
 * Telegram tidak bisa menempelkan foto ke pesan teks yang sudah terkirim.
 * Diambil dari penyimpanan aplikasi, jadi bukti dari tombol aplikasi maupun
 * dari bot tampil dengan cara yang sama.
 */
export async function kirimBuktiKeGrup(pengajuanId: number): Promise<void> {
  const g = getPengajuan(pengajuanId);
  const p = pesanTersimpan(pengajuanId, "bayar");
  if (!g || !p) return;

  const foto: Array<{ data: Buffer; mime: string; name: string }> = [];
  for (const t of listTransaksi({ pengajuanId })) {
    for (const a of attachmentsOf(t.id)) {
      if (!a.mime.startsWith("image/")) continue;
      const o = await getObject(a.stored_name, a.storage);
      if (o) foto.push({ data: o.body, mime: a.mime, name: a.orig_name || a.stored_name });
    }
  }
  const links = pisahLink(g.bukti_links);
  const caption =
    `💸 Bukti bayar pengajuan #${g.id} — ${fmtIdr(g.nominal_cair ?? g.nominal)}` +
    (links.length ? `\n${links.map((l) => `🔗 ${esc(l)}`).join("\n")}` : "");

  if (foto.length > 0) await kirimAlbum(p.chat_id, foto, caption, p.message_id);
  else if (links.length > 0)
    await kirimPesan(p.chat_id, caption, [], {
      reply_parameters: { message_id: p.message_id, allow_sending_without_reply: true },
    });
}

/** Pesan Telegram pengajuan yang dihapus: tombolnya dicabut, isinya dicoret. */
export async function tandaiDihapus(pengajuanId: number): Promise<void> {
  for (const jenis of ["divisi", "bayar"] as const) {
    const p = pesanTersimpan(pengajuanId, jenis);
    if (p) await ubahPesan(p.chat_id, p.message_id, `🗑 Pengajuan #${pengajuanId} dihapus dari aplikasi.`);
  }
}

/**
 * Mengirim pengajuan divisi ini yang masih menunggu leader tapi belum pernah
 * diposting — terjadi kalau pengajuannya dibuat sebelum grup divisinya dipasang.
 */
export async function kirimTertunda(divisiId: number): Promise<number> {
  const tertunda = all<{ id: number }>(
    `SELECT p.id FROM pengajuan p
     WHERE p.divisi_id = ? AND p.status = 'diajukan'
       AND NOT EXISTS (SELECT 1 FROM telegram_pesan t
                       WHERE t.pengajuan_id = p.id AND t.jenis = 'divisi')
     ORDER BY p.id`,
    divisiId,
  );
  for (const p of tertunda) await sinkronTelegram(p.id);
  return tertunda.length;
}

/** Peringatan untuk pembuat pengajuan kalau divisinya belum tersambung ke Telegram. */
export function peringatanGrup(divisiId: number | null): string {
  if (!divisiId || !process.env.TELEGRAM_BOT_TOKEN) return "";
  const d = getDivisi(divisiId);
  if (!d || d.telegram_chat_id) return "";
  return ` ⚠️ Divisi ${d.name} belum punya grup Telegram — pengajuan belum terkirim ke leader. Akan terkirim otomatis begitu grupnya dipasang di Master → Divisi.`;
}
