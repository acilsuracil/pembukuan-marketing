import { todayISO } from "@/lib/format";
import { isSortKey, listTransactions, type TxFilter } from "@/lib/queries";
import { getUser } from "@/lib/session";

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
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
    "Nominal USDT", "Fee USDT", "Arus USDT", "Kurs IDR",
    "Sumber kurs", "Nilai IDR", "Bukti", "Dicatat oleh", "Tx Hash",
  ];

  // Delimiter titik-koma + desimal koma agar langsung terbaca Excel lokal ID.
  const num = (n: number | null, d = 2) =>
    n === null ? "" : n.toFixed(d).replace(".", ",");

  const lines = [
    header.join(";"),
    ...rows.map((t) =>
      [
        t.date,
        t.type === "in" ? "Masuk" : "Keluar",
        t.brand_name ?? "",
        t.category_name ?? "",
        t.description,
        t.counterparty,
        num(t.amount_usdt),
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
        .join(";"),
    ),
  ];

  // BOM supaya Excel membaca UTF-8 dengan benar.
  const body = `﻿${lines.join("\r\n")}\r\n`;

  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="pembukuan-usdt-${todayISO()}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
