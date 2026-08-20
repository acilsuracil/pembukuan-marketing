import Link from "next/link";
import { connection } from "next/server";
import MasterForm, { type Field } from "@/components/MasterForm";
import MasterRowActions from "@/components/MasterRowActions";
import StatTile from "@/components/StatTile";
import { Badge } from "@/components/ui";
import { fmtDate, fmtIdr, todayISO } from "@/lib/format";
import { hasPerm } from "@/lib/policy";
import { getDompet, masterUsage, saldoDompet, totalSaldo } from "@/lib/queries";
import { requireUser } from "@/lib/session";
import { first, type SP } from "@/lib/sp";

export default async function DompetPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  await connection();
  const me = await requireUser();
  const sp = await searchParams;

  const canManage = hasPerm(me, "manageDompet");
  const editId = Number(first(sp, "edit")) || 0;
  const editing = editId ? getDompet(editId) : undefined;

  const rows = saldoDompet(true).map((d) => ({
    ...d,
    used: masterUsage("dompet", d.id),
  }));
  const aktif = rows.filter((d) => d.archived === 0);
  const total = totalSaldo();
  const tipis = aktif.filter((d) => d.min_saldo > 0 && d.sisa < d.min_saldo);

  const fields: Field[] = [
    {
      kind: "text",
      name: "name",
      label: "Nama dompet",
      value: editing?.name,
      required: true,
      minLength: 2,
      placeholder: "mis. Bank Jago",
    },
    {
      kind: "select",
      name: "jenis",
      label: "Jenis",
      value: editing?.jenis ?? "bank",
      options: [
        { value: "bank", label: "Rekening bank" },
        { value: "ewallet", label: "E-wallet" },
        { value: "lain", label: "Lain-lain" },
      ],
    },
    { kind: "text", name: "bank", label: "Bank", value: editing?.bank, placeholder: "mis. Jago" },
    {
      kind: "text",
      name: "no_rek",
      label: "Nomor rekening",
      value: editing?.no_rek,
      placeholder: "dipakai di format pengajuan",
    },
    {
      kind: "text",
      name: "pemilik",
      label: "Nama pemilik rekening",
      value: editing?.pemilik,
    },
    {
      kind: "money",
      name: "saldo_awal",
      label: "Saldo awal",
      value: editing?.saldo_awal,
      hint: "Saldo saat pembukuan ini mulai dipakai untuk dompet tersebut.",
    },
    {
      kind: "date",
      name: "tanggal_awal",
      label: "Tanggal saldo awal",
      value: editing?.tanggal_awal ?? todayISO(),
      required: true,
      hint: "Mutasi sebelum tanggal ini tidak dicatat di sini.",
    },
    {
      kind: "money",
      name: "min_saldo",
      label: "Batas saldo minimum",
      value: editing?.min_saldo,
      hint: "Panel memberi peringatan kalau sisa saldo turun di bawah angka ini. 0 = tanpa peringatan.",
    },
    { kind: "text", name: "note", label: "Catatan", value: editing?.note, placeholder: "opsional" },
  ];

  return (
    <div className="space-y-5">
      <div className="page-header flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Dompet</h1>
          <p className="mt-0.5 text-sm text-[var(--text-muted)]">
            Dana dari finance mendarat di sini dulu, lalu dipakai auto payment.
            Saldonya = saldo awal + top-up ± pindahan − belanja dari dompet.
          </p>
        </div>
        {hasPerm(me, "addBelanja") && aktif.length >= 2 && (
          <Link href="/dompet/transfer" className="btn btn-ghost">
            Pindah saldo
          </Link>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile
          label="Total saldo semua dompet"
          value={fmtIdr(total)}
          sub={`${aktif.length} dompet aktif`}
          hero
        />
        <StatTile
          label="Dompet di bawah batas minimum"
          value={String(tipis.length)}
          sub={
            tipis.length > 0
              ? tipis.map((d) => d.name).join(", ")
              : "semua masih di atas batas"
          }
        />
        <StatTile
          label="Saldo minus"
          value={String(aktif.filter((d) => d.sisa < 0).length)}
          sub="biasanya berarti ada top-up yang belum dicatat"
        />
      </div>

      <div className={`grid items-start gap-4 ${canManage ? "lg:grid-cols-[320px_1fr]" : ""}`}>
        {canManage && (
          <section className="card p-4 sm:p-5">
            <MasterForm
              kind="dompet"
              fields={fields}
              editingId={editing?.id}
              title={editing ? `Ubah "${editing.name}"` : "Tambah dompet"}
              submitLabel={editing ? "Simpan perubahan" : "Tambah dompet"}
              listHref="/dompet"
            />
            <p className="hint mt-3 border-t border-[var(--hairline)] pt-3">
              Mengubah saldo awal menggeser seluruh saldo berjalan dompet ini.
              Perubahannya tercatat di log aktivitas.
            </p>
          </section>
        )}

        <section className="space-y-3">
          {rows.length === 0 && (
            <div className="card p-6 text-center text-sm text-[var(--text-muted)]">
              Belum ada dompet. Tambahkan Bank Jago / Jenius beserta saldo awalnya.
            </div>
          )}

          {rows.map((d) => {
            const kurang = d.min_saldo > 0 && d.sisa < d.min_saldo;
            return (
              <article key={d.id} className="card p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="flex items-center gap-2 text-base font-semibold">
                      <Link href={`/dompet/${d.id}`} className="hover:underline">
                        {d.name}
                      </Link>
                      {d.archived === 1 && <Badge>arsip</Badge>}
                      {d.sisa < 0 ? (
                        <Badge tone="critical">saldo minus</Badge>
                      ) : kurang ? (
                        <Badge tone="serious">di bawah minimum</Badge>
                      ) : null}
                    </h2>
                    <p className="tnum mt-0.5 text-xs text-[var(--text-muted)]">
                      {[d.bank, d.no_rek, d.pemilik].filter(Boolean).join(" · ") ||
                        "tanpa detail rekening"}
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-[var(--text-secondary)]">Sisa saldo</div>
                    <div
                      className="tnum text-2xl font-semibold"
                      style={{
                        color:
                          d.sisa < 0
                            ? "var(--status-critical)"
                            : kurang
                              ? "var(--status-serious)"
                              : undefined,
                      }}
                    >
                      {fmtIdr(d.sisa)}
                    </div>
                  </div>
                </div>

                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 border-t border-[var(--hairline)] pt-3 text-xs sm:grid-cols-4">
                  {[
                    ["Saldo awal", fmtIdr(d.saldo_awal), fmtDate(d.tanggal_awal)],
                    ["Masuk", fmtIdr(d.masuk), `top-up ${fmtIdr(d.topup)}`],
                    ["Keluar", fmtIdr(d.keluar), `belanja ${fmtIdr(d.belanja)}`],
                    [
                      "Batas minimum",
                      d.min_saldo > 0 ? fmtIdr(d.min_saldo) : "–",
                      d.last_tanggal ? `mutasi terakhir ${fmtDate(d.last_tanggal)}` : "belum ada mutasi",
                    ],
                  ].map(([k, v, sub]) => (
                    <div key={k}>
                      <dt className="text-[var(--text-muted)]">{k}</dt>
                      <dd className="tnum font-medium">{v}</dd>
                      <dd className="text-[var(--text-muted)]">{sub}</dd>
                    </div>
                  ))}
                </dl>

                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--hairline)] pt-3">
                  <div className="flex flex-wrap gap-2">
                    <Link href={`/dompet/${d.id}`} className="btn btn-ghost px-2.5 py-1 text-xs">
                      Mutasi &amp; opname
                    </Link>
                    {hasPerm(me, "addBelanja") && (
                      <>
                        <Link
                          href={`/belanja/harian?dompet=${d.id}`}
                          className="btn btn-ghost px-2.5 py-1 text-xs"
                        >
                          Input harian
                        </Link>
                        <Link
                          href={`/belanja/baru?dompet=${d.id}&jenis=topup&back=/dompet/${d.id}`}
                          className="btn btn-ghost px-2.5 py-1 text-xs"
                        >
                          Catat top-up
                        </Link>
                        {aktif.length >= 2 && (
                          <Link
                            href={`/dompet/transfer?asal=${d.id}&back=/dompet`}
                            className="btn btn-ghost px-2.5 py-1 text-xs"
                          >
                            Pindah saldo
                          </Link>
                        )}
                      </>
                    )}
                  </div>
                  {canManage && (
                    <MasterRowActions
                      kind="dompet"
                      id={d.id}
                      name={d.name}
                      archived={d.archived === 1}
                      used={d.used}
                      editHref={`/dompet?edit=${d.id}`}
                    />
                  )}
                </div>
              </article>
            );
          })}
        </section>
      </div>
    </div>
  );
}
