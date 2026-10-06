import { revalidatePath } from "next/cache";
import { EXT_BY_MIME, MAX_BUKTI_PER_TX } from "@/lib/bukti";
import { one, run, setSetting } from "@/lib/db";
import { fmtIdr, normalLink } from "@/lib/format";
import { catatPembayaran } from "@/lib/pembayaran";
import {
  bisaBayar,
  bisaLeader,
  bisaSetujuiBayar,
  kirimBuktiKeGrup,
  penggunaTelegram,
  putuskan,
  sinkronTelegram,
  tahapOf,
  type Pelaku,
} from "@/lib/persetujuan";
import { logActivity } from "@/lib/policy";
import { getPengajuan, listDivisi } from "@/lib/queries";
import { esc, jawabTombol, kirimPesan, namaBot, ubahPesan, unduhBerkas } from "@/lib/telegram";

/**
 * Webhook bot Telegram.
 *
 * Telegram mengirim setiap pesan dan ketukan tombol ke sini. Keasliannya
 * dipastikan lewat header rahasia yang didaftarkan saat setWebhook — tanpa itu
 * siapa pun bisa memalsukan "leader menekan Setujui". Identitas penekan tombol
 * diambil dari `from.id` milik Telegram dan dicocokkan ke kolom telegram_id di
 * akun aplikasi; izinnya diperiksa dengan aturan yang sama seperti di aplikasi.
 *
 * Alasan menolak dan bukti bayar dikumpulkan lewat **chat pribadi** dengan bot:
 * bawaan Telegram, bot di grup tidak bisa membaca pesan biasa anggota.
 */

interface TgUser {
  id: number;
  first_name?: string;
  username?: string;
}
interface TgChat {
  id: number;
  type: "private" | "group" | "supergroup" | "channel";
  title?: string;
}
interface TgMessage {
  message_id: number;
  chat: TgChat;
  from?: TgUser;
  text?: string;
  caption?: string;
  photo?: Array<{ file_id: string; file_size?: number; width: number }>;
  document?: { file_id: string; mime_type?: string; file_name?: string };
}
interface TgCallback {
  id: string;
  from: TgUser;
  data?: string;
  message?: TgMessage;
}
interface TgUpdate {
  message?: TgMessage;
  callback_query?: TgCallback;
}

/** Percakapan terbuka seseorang dengan bot: menunggu alasan, atau mengumpulkan bukti. */
interface Tunggu {
  telegram_id: number;
  jenis: "alasan" | "bukti";
  pengajuan_id: number;
  tahap: "leader" | "bayar" | null;
  data: string;
  kedaluwarsa: string;
}
interface DataBukti {
  foto: Array<{ id: string; mime: string; nama: string }>;
  link: string[];
  /** Pesan bot berisi tombol Selesai/Batal, diperbarui tiap ada kiriman. */
  pesan?: number;
}

const BATAS_MENIT = 30;

export async function POST(request: Request) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
  if (!secret || request.headers.get("x-telegram-bot-api-secret-token") !== secret)
    return new Response("Forbidden", { status: 403 });

  let update: TgUpdate;
  try {
    update = (await request.json()) as TgUpdate;
  } catch {
    return new Response("Bad Request", { status: 400 });
  }

  try {
    if (update.callback_query) await tombol(update.callback_query);
    else if (update.message) await pesan(update.message);
  } catch (e) {
    // Selalu 200 ke Telegram: jawaban galat membuatnya mengulang kiriman yang
    // sama terus-menerus, dan keputusan bisa tercatat dua kali.
    console.error(`[telegram] gagal memproses update: ${(e as Error).stack}`);
  }
  return Response.json({ ok: true });
}

/* ================================================================== tombol */

async function tombol(cb: TgCallback) {
  const [aksi, arg] = (cb.data ?? "").split(":");
  const id = Number(arg);
  const user = penggunaTelegram(cb.from.id);
  if (!user)
    return jawabTombol(
      cb.id,
      `Akun Telegram Anda (ID ${cb.from.id}) belum terdaftar di aplikasi. Minta owner mengisinya di Admin → Pengguna.`,
      true,
    );

  if (aksi === "GD") return pilihGrupDivisi(cb, user, id);

  const g = getPengajuan(id);
  if (!g) return jawabTombol(cb.id, "Pengajuan tidak ditemukan.", true);

  switch (aksi) {
    case "L1":
    case "B1": {
      const h = putuskan({
        pengajuanId: id,
        user,
        tahap: aksi === "L1" ? "leader" : "bayar",
        setuju: true,
        lewat: "telegram",
      });
      if (!h.ok) return jawabTombol(cb.id, h.error, true);
      await jawabTombol(cb.id, h.message);
      revalidatePath("/", "layout");
      return sinkronTelegram(id);
    }

    case "L0":
    case "B0": {
      const tahap = aksi === "L0" ? "leader" : "bayar";
      // Diperiksa sebelum menanyakan alasan: yang tidak berhak tidak perlu
      // diminta menulis apa pun.
      if (tahapOf(g) !== tahap) return jawabTombol(cb.id, "Tahap ini sudah lewat.", true);
      const tidak =
        tahap === "leader"
          ? bisaLeader(user, g)
            ? null
            : "Hanya leader divisi ini yang bisa menolak di tahap ini."
          : bisaSetujuiBayar(user, g);
      if (tidak) return jawabTombol(cb.id, tidak, true);

      const m = await kirimPesan(
        cb.from.id,
        `❌ Menolak <b>pengajuan #${id}</b> — ${esc(g.keterangan)} (${fmtIdr(g.nominal)}).\n\n` +
          `Balas pesan ini dengan <b>alasan penolakannya</b>. Ketik /batal untuk membatalkan.`,
      );
      if (!m) return jawabTombol(cb.id, mintaStart(), true);
      bukaTunggu(cb.from.id, "alasan", id, tahap, {});
      return jawabTombol(cb.id, "Tulis alasannya di chat pribadi dengan bot.");
    }

    case "P": {
      if (!bisaBayar(user))
        return jawabTombol(cb.id, "Hanya finance (izin Tandai dana cair) yang bisa membayar.", true);
      if (tahapOf(g) !== "siap")
        return jawabTombol(cb.id, "Pengajuan ini tidak sedang menunggu dibayar.", true);
      const m = await kirimPesan(cb.from.id, teksBukti(id, { foto: [], link: [] }), tombolBukti(id));
      if (!m) return jawabTombol(cb.id, mintaStart(), true);
      bukaTunggu(cb.from.id, "bukti", id, null, { foto: [], link: [], pesan: m.message_id });
      return jawabTombol(cb.id, "Kirim bukti bayarnya di chat pribadi dengan bot.");
    }

    case "PS":
      return selesaiBayar(cb, user, id);

    case "PX": {
      tutupTunggu(cb.from.id);
      if (cb.message) await ubahPesan(cb.message.chat.id, cb.message.message_id, `Pembayaran pengajuan #${id} dibatalkan. Tidak ada yang tercatat.`);
      return jawabTombol(cb.id, "Dibatalkan.");
    }
  }
  return jawabTombol(cb.id);
}

function mintaStart(): string {
  return "Bot belum bisa mengirim pesan pribadi ke Anda. Buka chat dengan bot ini, tekan Start, lalu tekan tombolnya lagi.";
}

async function pilihGrupDivisi(cb: TgCallback, user: Pelaku, divisiId: number) {
  if (user.role !== "owner") return jawabTombol(cb.id, "Hanya owner yang bisa mengatur grup.", true);
  const chat = cb.message?.chat;
  if (!chat) return jawabTombol(cb.id);
  run(`UPDATE divisi SET telegram_chat_id = ? WHERE id = ?`, chat.id, divisiId);
  const d = one<{ name: string }>(`SELECT name FROM divisi WHERE id = ?`, divisiId);
  logActivity(user, "grup-divisi", `${d?.name} → Telegram ${chat.id}`);
  revalidatePath("/", "layout");
  await ubahPesan(chat.id, cb.message!.message_id, `✅ Grup ini sekarang grup divisi <b>${esc(d?.name ?? "")}</b>. Pengajuan divisi ini akan diposting di sini.`);
  return jawabTombol(cb.id, "Tersimpan.");
}

/* =================================================================== pesan */

async function pesan(m: TgMessage) {
  const teks = (m.text ?? "").trim();
  const perintah = teks.startsWith("/") ? teks.split(/[\s@]/)[0].toLowerCase() : "";
  const from = m.from;

  if (perintah === "/id") {
    return kirimPesan(
      m.chat.id,
      `ID chat ini: <code>${m.chat.id}</code>` + (from ? `\nID Telegram Anda: <code>${from.id}</code>` : ""),
    );
  }

  if (perintah === "/ajukan") return tombolAjukan(m);

  if (perintah === "/grupbayar" || perintah === "/grupdivisi") {
    if (m.chat.type === "private")
      return kirimPesan(m.chat.id, "Perintah ini dipakai di dalam grup, bukan di chat pribadi.");
    const user = from ? penggunaTelegram(from.id) : undefined;
    if (user?.role !== "owner")
      return kirimPesan(m.chat.id, "Hanya owner (yang ID Telegram-nya terdaftar) yang bisa mengatur grup.");

    if (perintah === "/grupbayar") {
      setSetting("telegram_grup_bayar", String(m.chat.id));
      logActivity(user, "grup-bayar", `Telegram ${m.chat.id}`);
      revalidatePath("/", "layout");
      return kirimPesan(m.chat.id, "✅ Grup ini sekarang <b>grup pembayaran</b>. Pengajuan yang lolos leader akan diposting di sini.");
    }
    const divisi = listDivisi();
    return kirimPesan(
      m.chat.id,
      "Grup ini untuk divisi apa?",
      divisi.map((d) => [{ text: d.name, callback_data: `GD:${d.id}` }]),
    );
  }

  if (m.chat.type !== "private" || !from) return;

  // /start ajukan_<divisi> — datang dari tombol /ajukan di grup divisi.
  const dariGrup = /^\/start\s+ajukan(?:_(\d+))?$/.exec(teks);
  if (dariGrup) return kirimPesan(m.chat.id, "Silakan isi pengajuannya:", bukaMiniApp(dariGrup[1]));

  if (perintah === "/start")
    return kirimPesan(
      m.chat.id,
      `Halo! Bot ini mengirim pengajuan dana untuk disetujui.\nID Telegram Anda: <code>${from.id}</code> — berikan ke owner supaya didaftarkan di aplikasi.`,
    );

  const t = tungguOf(from.id);
  if (!t) return;
  if (perintah === "/batal") {
    tutupTunggu(from.id);
    return kirimPesan(m.chat.id, "Dibatalkan.");
  }

  const user = penggunaTelegram(from.id);
  if (!user) return tutupTunggu(from.id);

  if (t.jenis === "alasan") {
    if (!teks || perintah) return kirimPesan(m.chat.id, "Tulis alasannya sebagai teks biasa, atau /batal.");
    const h = putuskan({
      pengajuanId: t.pengajuan_id,
      user,
      tahap: t.tahap ?? "leader",
      setuju: false,
      alasan: teks,
      lewat: "telegram",
    });
    if (!h.ok) {
      // Alasan terlalu pendek boleh diulang; galat lain menutup percakapannya.
      if (!h.error.startsWith("Tulis alasan")) tutupTunggu(from.id);
      return kirimPesan(m.chat.id, `⚠️ ${esc(h.error)}`);
    }
    tutupTunggu(from.id);
    revalidatePath("/", "layout");
    await sinkronTelegram(t.pengajuan_id);
    return kirimPesan(m.chat.id, `❌ Pengajuan #${t.pengajuan_id} ditolak. Alasannya sudah tercatat dan terlihat di grup.`);
  }

  // Mengumpulkan bukti bayar: foto, gambar sebagai berkas, dan/atau link.
  const data = JSON.parse(t.data) as DataBukti;
  let masuk = 0;
  const foto = m.photo?.at(-1); // ukuran terbesar ada di akhir
  if (foto) {
    data.foto.push({ id: foto.file_id, mime: "image/jpeg", nama: `bukti-${data.foto.length + 1}.jpg` });
    masuk++;
  } else if (m.document) {
    const mime = m.document.mime_type ?? "";
    if (!EXT_BY_MIME[mime])
      return kirimPesan(m.chat.id, "⚠️ Berkas itu bukan gambar (JPG/PNG/WEBP/GIF). Kirim sebagai foto atau link.");
    data.foto.push({ id: m.document.file_id, mime, nama: m.document.file_name ?? `bukti-${data.foto.length + 1}` });
    masuk++;
  }
  for (const kata of `${teks} ${m.caption ?? ""}`.split(/\s+/)) {
    if (!/^(https?:\/\/|www\.)/i.test(kata)) continue;
    const l = normalLink(kata);
    if (l && !data.link.includes(l)) {
      data.link.push(l);
      masuk++;
    }
  }
  if (masuk === 0)
    return kirimPesan(m.chat.id, "Kirim foto bukti atau link-nya, lalu tekan ✅ Selesai. Ketik /batal untuk membatalkan.");
  if (data.foto.length > MAX_BUKTI_PER_TX) {
    data.foto = data.foto.slice(0, MAX_BUKTI_PER_TX);
    await kirimPesan(m.chat.id, `⚠️ Maksimal ${MAX_BUKTI_PER_TX} foto. Sisanya diabaikan.`);
  }

  // Pesan Selesai/Batal dikirim ulang di paling bawah, supaya tombolnya tidak
  // tenggelam di atas foto-foto yang baru masuk.
  const baru = await kirimPesan(m.chat.id, teksBukti(t.pengajuan_id, data), tombolBukti(t.pengajuan_id));
  if (baru && data.pesan) await ubahPesan(m.chat.id, data.pesan, "⬇️ lanjut di bawah");
  if (baru) data.pesan = baru.message_id;
  run(`UPDATE telegram_tunggu SET data = ? WHERE telegram_id = ?`, JSON.stringify(data), from.id);
}

/* ================================================================ mini app */

const urlMini = (divisi?: string) =>
  `${(process.env.PUBLIC_URL || "https://pembukuan-rupiah.com").replace(/\/$/, "")}/mini${divisi ? `?divisi=${divisi}` : ""}`;

/** Tombol pembuka Mini App — hanya boleh di chat pribadi (aturan Telegram). */
const bukaMiniApp = (divisi?: string) => [
  [{ text: "📝 Ajukan dana", web_app: { url: urlMini(divisi) } }],
];

/**
 * /ajukan. Di chat pribadi langsung membuka Mini App. Di grup, Telegram tidak
 * mengizinkan tombol Mini App, jadi bot memberi tautan ke chat pribadinya yang
 * membawa divisi grup itu — formulirnya terbuka dengan divisi sudah terpilih.
 */
async function tombolAjukan(m: TgMessage) {
  if (m.chat.type === "private")
    return kirimPesan(m.chat.id, "Silakan isi pengajuannya:", bukaMiniApp());
  const d = one<{ id: number; name: string }>(
    `SELECT id, name FROM divisi WHERE telegram_chat_id = ? AND archived = 0`,
    m.chat.id,
  );
  const bot = await namaBot();
  if (!bot) return;
  return kirimPesan(
    m.chat.id,
    `Buat pengajuan${d ? ` divisi <b>${esc(d.name)}</b>` : ""} — formulirnya terbuka di chat pribadi dengan bot:`,
    [[{ text: "📝 Ajukan dana", url: `https://t.me/${bot}?start=ajukan${d ? `_${d.id}` : ""}` }]],
  );
}

/* ============================================================ bukti bayar */

function teksBukti(id: number, d: DataBukti): string {
  const g = getPengajuan(id);
  const ke = g
    ? `${fmtIdr(g.nominal)} — ${esc(g.penerima_nama ? `${g.penerima_bank ?? ""} ${g.penerima_no_rek ?? ""} (${g.penerima_nama})` : (g.dompet_name ?? ""))}`
    : "";
  return (
    `💸 <b>Bukti bayar pengajuan #${id}</b>\n${ke}\n\n` +
    `Kirim di sini: <b>foto bukti</b> (boleh beberapa) dan/atau <b>link</b>.\n` +
    `Nominal dicatat penuh, tanggal hari ini — kalau beda, bayar lewat aplikasi.\n\n` +
    `Terkumpul: ${d.foto.length} foto, ${d.link.length} link`
  );
}

const tombolBukti = (id: number) => [
  [
    { text: "✅ Selesai", callback_data: `PS:${id}` },
    { text: "Batal", callback_data: `PX:${id}` },
  ],
];

async function selesaiBayar(cb: TgCallback, user: Pelaku, id: number) {
  const t = tungguOf(cb.from.id);
  if (!t || t.jenis !== "bukti" || t.pengajuan_id !== id)
    return jawabTombol(cb.id, "Sesi bukti ini sudah berakhir. Tekan 💸 Bayar lagi di grup.", true);
  const data = JSON.parse(t.data) as DataBukti;
  if (data.foto.length === 0 && data.link.length === 0)
    return jawabTombol(cb.id, "Belum ada bukti. Kirim foto atau link dulu.", true);

  const g = getPengajuan(id);
  if (!g) return jawabTombol(cb.id, "Pengajuan tidak ditemukan.", true);
  await jawabTombol(cb.id, "Menyimpan…");

  // Foto diunduh dari Telegram lalu disimpan seperti unggahan dari aplikasi.
  const files: File[] = [];
  for (const f of data.foto) {
    const b = await unduhBerkas(f.id);
    if (b) files.push(new File([new Uint8Array(b.data)], f.nama, { type: f.mime }));
  }
  if (data.foto.length > 0 && files.length === 0 && data.link.length === 0)
    return kirimPesan(cb.from.id, "⚠️ Foto bukti gagal diunduh dari Telegram. Kirim ulang fotonya lalu tekan Selesai.");

  const h = await catatPembayaran(g, user, { files, links: data.link });
  if (!h.ok) return kirimPesan(cb.from.id, `⚠️ ${esc(h.error)}`);

  tutupTunggu(cb.from.id);
  revalidatePath("/", "layout");
  if (cb.message) await ubahPesan(cb.message.chat.id, cb.message.message_id, `✅ ${esc(h.message)}`);
  await sinkronTelegram(id);
  await kirimBuktiKeGrup(id);
}

/* ========================================================= tunggu balasan */

function bukaTunggu(tgId: number, jenis: "alasan" | "bukti", pengajuanId: number, tahap: string | null, data: object) {
  run(
    `INSERT OR REPLACE INTO telegram_tunggu (telegram_id, jenis, pengajuan_id, tahap, data, kedaluwarsa)
     VALUES (?, ?, ?, ?, ?, ?)`,
    tgId, jenis, pengajuanId, tahap, JSON.stringify(data),
    new Date(Date.now() + BATAS_MENIT * 60_000).toISOString(),
  );
}

function tungguOf(tgId: number): Tunggu | undefined {
  const t = one<Tunggu>(`SELECT * FROM telegram_tunggu WHERE telegram_id = ?`, tgId);
  if (t && t.kedaluwarsa < new Date().toISOString()) {
    tutupTunggu(tgId);
    return undefined;
  }
  return t;
}

function tutupTunggu(tgId: number) {
  run(`DELETE FROM telegram_tunggu WHERE telegram_id = ?`, tgId);
}
