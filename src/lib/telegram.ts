/**
 * Klien Bot API Telegram yang tipis.
 *
 * Bot hanyalah jalur kedua: semua keputusan juga bisa diambil dari aplikasi.
 * Karena itu tidak ada fungsi di sini yang melempar galat ke pemanggilnya —
 * Telegram yang sedang gangguan tidak boleh menggagalkan penyimpanan pengajuan
 * atau pembayaran. Kegagalan dicatat ke log server dan hasilnya `null`.
 */

export interface TgButton {
  text: string;
  callback_data: string;
}

/** Token dari env. Tanpa token, bot dianggap tidak dipasang dan semua kiriman dilewati. */
function token(): string | null {
  return process.env.TELEGRAM_BOT_TOKEN?.trim() || null;
}

export function botAktif(): boolean {
  return token() !== null;
}

/** Bisa diarahkan ke server tiruan saat pengujian. */
const API_BASE = () => process.env.TELEGRAM_API_BASE?.trim() || "https://api.telegram.org";

async function call<T>(method: string, body: unknown): Promise<T | null> {
  const t = token();
  if (!t) return null;
  try {
    const res = await fetch(`${API_BASE()}/bot${t}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    const json = (await res.json()) as { ok: boolean; result?: T; description?: string };
    if (!json.ok) {
      // "message is not modified" bukan masalah: isi pesannya memang sudah benar.
      if (!json.description?.includes("message is not modified"))
        console.error(`[telegram] ${method} gagal: ${json.description}`);
      return null;
    }
    return json.result ?? null;
  } catch (e) {
    console.error(`[telegram] ${method} gagal: ${(e as Error).message}`);
    return null;
  }
}

const keyboard = (rows: TgButton[][]) =>
  rows.length > 0 ? { inline_keyboard: rows } : { inline_keyboard: [] };

/** Teks bebas dari pengguna/basis data, aman dipakai di parse_mode HTML. */
export function esc(s: string): string {
  return s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

export async function kirimPesan(
  chatId: number,
  html: string,
  tombol: TgButton[][] = [],
  extra: Record<string, unknown> = {},
): Promise<{ message_id: number } | null> {
  return call("sendMessage", {
    chat_id: chatId,
    text: html,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: keyboard(tombol),
    ...extra,
  });
}

export async function ubahPesan(
  chatId: number,
  messageId: number,
  html: string,
  tombol: TgButton[][] = [],
): Promise<unknown> {
  return call("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text: html,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: keyboard(tombol),
  });
}

/** Menjawab ketukan tombol. `alert` = munculkan sebagai jendela, bukan toast. */
export async function jawabTombol(id: string, teks = "", alert = false): Promise<unknown> {
  return call("answerCallbackQuery", { callback_query_id: id, text: teks, show_alert: alert });
}

/**
 * Mengunggah foto (berkas mentah) sebagai album yang membalas sebuah pesan.
 * Telegram membatasi satu album 2–10 foto; satu foto dikirim biasa, lebih dari
 * sepuluh dipecah. Dipakai untuk bukti bayar, dari aplikasi maupun dari bot.
 */
export async function kirimAlbum(
  chatId: number,
  foto: Array<{ data: Buffer; mime: string; name: string }>,
  caption: string,
  balasKe?: number,
): Promise<void> {
  const t = token();
  if (!t || foto.length === 0) return;
  const reply = balasKe
    ? JSON.stringify({ message_id: balasKe, allow_sending_without_reply: true })
    : null;

  for (let i = 0; i < foto.length; i += 10) {
    const potong = foto.slice(i, i + 10);
    const fd = new FormData();
    fd.set("chat_id", String(chatId));
    if (reply) fd.set("reply_parameters", reply);
    potong.forEach((f, j) =>
      fd.set(`f${j}`, new Blob([new Uint8Array(f.data)], { type: f.mime }), f.name),
    );
    const cap = i === 0 ? caption : "";

    let method = "sendMediaGroup";
    if (potong.length === 1) {
      method = "sendPhoto";
      fd.set("photo", "attach://f0");
      if (cap) {
        fd.set("caption", cap);
        fd.set("parse_mode", "HTML");
      }
    } else {
      fd.set(
        "media",
        JSON.stringify(
          potong.map((_, j) => ({
            type: "photo",
            media: `attach://f${j}`,
            ...(j === 0 && cap ? { caption: cap, parse_mode: "HTML" } : {}),
          })),
        ),
      );
    }

    try {
      const res = await fetch(`${API_BASE()}/bot${t}/${method}`, {
        method: "POST",
        body: fd,
        signal: AbortSignal.timeout(60_000),
      });
      const json = (await res.json()) as { ok: boolean; description?: string };
      if (!json.ok) console.error(`[telegram] ${method} gagal: ${json.description}`);
    } catch (e) {
      console.error(`[telegram] ${method} gagal: ${(e as Error).message}`);
    }
  }
}

/** Mengunduh berkas kiriman pengguna (foto bukti) dari server Telegram. */
export async function unduhBerkas(
  fileId: string,
): Promise<{ data: Buffer; path: string } | null> {
  const t = token();
  if (!t) return null;
  const f = await call<{ file_path?: string }>("getFile", { file_id: fileId });
  if (!f?.file_path) return null;
  try {
    const res = await fetch(`${API_BASE()}/file/bot${t}/${f.file_path}`, {
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return { data: Buffer.from(await res.arrayBuffer()), path: f.file_path };
  } catch (e) {
    console.error(`[telegram] unduh berkas gagal: ${(e as Error).message}`);
    return null;
  }
}

export async function pasangWebhook(url: string, secret: string): Promise<unknown> {
  return call("setWebhook", {
    url,
    secret_token: secret,
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: true,
  });
}
