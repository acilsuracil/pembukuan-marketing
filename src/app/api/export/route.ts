import { todayISO } from "@/lib/format";
import { isSortKey, listTransactions, type TxFilter } from "@/lib/queries";
import { getUser } from "@/lib/session";

// CSV standar (RFC 4180): delimiter koma, desimal titik, tanpa pemisah ribuan.
// Format lama (delimiter ";" + desimal ",") bikin Excel yang list separator-nya
// koma memecah tiap baris di tengah angka, dan semua ";" ikut jadi teks.
const SEP = ",";

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  // Kutip kalau ada delimiter, tanda kutip, atau newline. Spasi di ujung juga
  // dikutip supaya tidak dipotong saat dibuka ulang.
  return /[",\r\n]/.test(s) || s !== s.trim()
    ? `"${s.replace(/"/g, '""')}"`
    : s;
}

export async function GET(request: Request) {
  const user = await getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const sp = new URL(request.url).searchParams;
  const typeRaw = sp.get("type");
  const brandRaw = sp.get("brand") ?? "";
  const sortRaw = sp.get("sort") ?? "";

  const filter: TxFilter = {
    from: sp.get("from") || undefined,
    to: sp.get("to") || undefined,
    type: typeRaw === "in" || typeRaw === "out" ? typeRaw : undefined,
    categoryId: sp.get("cat") ? Number(sp.get("cat")) : undefined,
    noBrand: brandRaw === "none",
    brandId: brandRaw && brandRaw !== "none" ? Number(brandRaw) : undefined,
    q: sp.get("q") || undefined,
    sort: isSortKey(sortRaw) ? sortRaw : "date",
    dir: sp.get("dir") === "asc" ? "asc" : "desc",
  };

  const rows = listTransactions(filter);

  const header = [
    "Tanggal", "Jenis", "Brand", "Kategori", "Keterangan", "Pihak",
    "Nominal USDT", "Fee agency %", "Fee agency USDT", "Biaya jaringan USDT",
    "Arus USDT", "Kurs IDR",
    "Sumber kurs", "Nilai IDR", "Bukti", "Dicatat oleh", "Tx Hash",
  ];

  const num = (n: number | null, d = 2) =>
    n === null || !Number.isFinite(n) ? "" : n.toFixed(d);

  const lines = [
    header.join(SEP),
    ...rows.map((t) =>
      [
        t.date,
        t.type === "in" ? "Masuk" : "Keluar",
        t.brand_name ?? "",
        t.category_name ?? "",
        t.description,
        t.counterparty,
        num(t.amount_usdt),
        num(t.fee_pct),
        num(t.fee_pct_usdt),
        num(t.fee_usdt),
        num(t.flow_usdt),
        num(t.eff_rate, 0),
        t.type === "in" ? "kurs beli" : t.rate_source,
        t.eff_rate === null ? "" : num(t.flow_usdt * t.eff_rate, 0),
        String(t.bukti_count),
        t.created_by_name ?? "",
        t.tx_hash,
      ]
        .map(csvCell)
        .join(SEP),
    ),
  ];

  // Baris "sep=" bikin Excel memakai delimiter ini apa pun regional setting-nya
  // (locale ID default-nya ";", jadi tanpa hint semua kolom nempel di kolom A).
  // BOM di depan supaya Excel membaca UTF-8 dengan benar.
  const body = `\ufeffsep=${SEP}\r\n${lines.join("\r\n")}\r\n`;

  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="pembukuan-usdt-${todayISO()}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
