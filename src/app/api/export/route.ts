import { JENIS_LABEL, SUMBER_LABEL, todayISO } from "@/lib/format";
import { JENIS_SEMUA } from "@/lib/jenis";
import { hasPerm } from "@/lib/policy";
import { listTransaksi, type TxFilter } from "@/lib/queries";
import { getUser } from "@/lib/session";
import type { Jenis } from "@/lib/types";

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(request: Request) {
  const user = await getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  if (!hasPerm(user, "exportData")) return new Response("Forbidden", { status: 403 });

  const sp = new URL(request.url).searchParams;
  const jenisRaw = sp.get("jenis") ?? "";
  const idOf = (k: string) => {
    const n = Number(sp.get(k));
    return Number.isInteger(n) && n > 0 ? n : undefined;
  };

  const filter: TxFilter = {
    from: sp.get("from") || undefined,
    to: sp.get("to") || undefined,
    jenis: JENIS_SEMUA.includes(jenisRaw as Jenis) ? (jenisRaw as Jenis) : undefined,
    divisiId: idOf("divisi"),
    platformId: idOf("platform"),
    brandId: idOf("brand"),
    dompetId: idOf("dompet"),
    q: sp.get("q") || undefined,
    sort: "tanggal",
    dir: "asc",
  };

  const rows = listTransaksi(filter);

  const header = [
    "Tanggal", "Jenis", "Divisi", "Category", "Akun iklan", "Brand",
    "Sumber dana", "Dompet", "Penerima", "Keterangan", "No referensi",
    "Nominal", "Pengaruh biaya", "Pengaruh saldo dompet", "Dari pengajuan",
    "Dicatat oleh",
  ];

  // Delimiter titik-koma supaya langsung terbaca Excel lokal Indonesia, dan
  // nominal ditulis sebagai bilangan bulat tanpa pemisah ribuan — angka yang
  // dibubuhi titik akan dibaca Excel sebagai teks, bukan angka.
  const lines = [
    header.join(";"),
    ...rows.map((t) =>
      [
        t.tanggal,
        JENIS_LABEL[t.jenis],
        t.divisi_name ?? "",
        t.platform_name ?? "",
        t.akun_iklan_name ?? "",
        t.brand_name ?? "",
        t.sumber ? SUMBER_LABEL[t.sumber] : "",
        t.dompet_name ?? "",
        t.penerima_nama ?? "",
        t.keterangan,
        t.no_ref,
        t.nominal,
        t.delta_biaya,
        t.delta_saldo,
        t.pengajuan_id ?? "",
        t.created_by_name ?? "",
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
      "Content-Disposition": `attachment; filename="pembukuan-marketing-${todayISO()}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
