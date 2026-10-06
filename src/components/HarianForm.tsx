"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
import { saveBelanjaHarian, type ActionState } from "@/app/actions";
import { fmtIdr } from "@/lib/format";
import { parseRupiah } from "@/lib/num";
import { Alert, FormButton } from "./ui";
import type { TxOpt } from "./TxForm";

const EMPTY: ActionState = { ok: false };

export interface DompetOpt {
  id: number;
  label: string;
  sisa: number;
  minSaldo: number;
}

interface Row {
  key: number;
  platformId: string;
  divisiId: string;
  brandId: string;
  akunId: string;
  nominal: string;
  ket: string;
}

const blank = (key: number): Row => ({
  key,
  platformId: "",
  divisiId: "",
  brandId: "",
  akunId: "",
  nominal: "",
  ket: "",
});

/**
 * Input harian belanja dari satu dompet: satu tanggal, banyak baris.
 *
 * Semua kolom setiap baris selalu dirender — tidak ada yang disembunyikan atau
 * di-disable. Input yang disabled tidak ikut terkirim, dan begitu satu kolom
 * hilang dari satu baris, seluruh baris di bawahnya bergeser dan nominal bisa
 * mendarat di platform yang salah tanpa kelihatan.
 */
export default function HarianForm({
  today,
  dompet,
  divisi,
  platform,
  brand,
  akun,
  defaultDompetId,
}: {
  today: string;
  dompet: DompetOpt[];
  divisi: TxOpt[];
  platform: TxOpt[];
  brand: TxOpt[];
  akun: TxOpt[];
  defaultDompetId?: number;
}) {
  const router = useRouter();
  const [state, action] = useActionState(saveBelanjaHarian, EMPTY);
  const [dompetId, setDompetId] = useState(
    String(defaultDompetId ?? dompet[0]?.id ?? ""),
  );
  /*
   * Penomor kunci baris hidup di ref, bukan di state.
   *
   * Angka ini hanya dipakai React untuk membedakan baris; ia tidak pernah
   * memengaruhi tampilan, jadi menyimpannya sebagai state cuma menambah satu
   * pemicu render — dan sebelumnya justru menjadi lingkaran: effect di bawah
   * menaikkan nomornya, nomornya jadi dependency effect itu, effect berjalan
   * lagi, sampai React menyerah dengan "Maximum update depth exceeded".
   */
  // Tiga baris pertama diberi kunci tetap supaya penomornya tidak perlu dibaca
  // saat render — membaca ref ketika render adalah pola yang dilarang React.
  const keyRef = useRef(3);
  const freshRow = () => blank((keyRef.current += 1));
  const [rows, setRows] = useState<Row[]>(() => [blank(1), blank(2), blank(3)]);

  // Satu hasil simpan diproses tepat sekali: yang dibandingkan objek state-nya,
  // bukan nilai `ok`-nya, supaya render ulang apa pun sesudahnya tidak memicu
  // pengosongan grid untuk kedua kali.
  const sudahDibereskan = useRef<ActionState | null>(null);
  useEffect(() => {
    if (!state.ok || sudahDibereskan.current === state) return;
    sudahDibereskan.current = state;
    // Berhasil → kosongkan grid supaya bisa lanjut tanggal/dompet berikutnya,
    // tanpa risiko mengirim ulang baris yang sama.
    setRows([freshRow(), freshRow(), freshRow()]);
    router.refresh();
    // freshRow sengaja tidak jadi dependency: ia hanya menaikkan penomor di ref.
  }, [state, router]);

  function patch(key: number, part: Partial<Row>) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...part } : r)));
  }

  const total = rows.reduce((s, r) => s + (parseRupiah(r.nominal) ?? 0), 0);
  const w = dompet.find((d) => String(d.id) === dompetId);
  const sisaSetelah = w ? w.sisa - total : null;
  const terisi = rows.filter((r) => r.nominal.trim() !== "").length;

  return (
    <form action={action} className="space-y-4">
      <Alert state={state} />

      <section className="card grid gap-4 p-4 sm:grid-cols-[160px_1fr_auto] sm:p-5">
        <div>
          <label className="label" htmlFor="h-tanggal">
            Tanggal
          </label>
          <input
            id="h-tanggal"
            name="tanggal"
            type="date"
            required
            className="field tnum"
            defaultValue={today}
          />
        </div>

        <div>
          <label className="label" htmlFor="h-dompet">
            Dompet yang membayar
          </label>
          <select
            id="h-dompet"
            name="dompet_id"
            className="field"
            required
            value={dompetId}
            onChange={(e) => setDompetId(e.target.value)}
          >
            <option value="">— pilih dompet —</option>
            {dompet.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label} · sisa {fmtIdr(d.sisa)}
              </option>
            ))}
          </select>
        </div>

        <div className="sm:text-right">
          <div className="label">Sisa setelah disimpan</div>
          <div
            className="tnum text-lg font-semibold"
            style={{
              color:
                sisaSetelah === null
                  ? undefined
                  : sisaSetelah < 0
                    ? "var(--status-critical)"
                    : w && sisaSetelah < w.minSaldo
                      ? "var(--status-serious)"
                      : undefined,
            }}
          >
            {sisaSetelah === null ? "–" : fmtIdr(sisaSetelah)}
          </div>
          {sisaSetelah !== null && sisaSetelah < 0 && (
            <p className="hint" style={{ color: "var(--status-critical)" }}>
              Melebihi saldo — mungkin ada top-up yang belum dicatat.
            </p>
          )}
        </div>
      </section>

      <section className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--hairline)] text-left text-xs text-[var(--text-muted)]">
              <th className="px-3 py-2 font-medium">Category</th>
              <th className="px-3 py-2 font-medium">Divisi</th>
              <th className="px-3 py-2 font-medium">Brand</th>
              <th className="px-3 py-2 font-medium">Akun iklan</th>
              <th className="px-3 py-2 font-medium">Nominal</th>
              <th className="px-3 py-2 font-medium">Keterangan</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const akunRow = akun.filter((a) => String(a.platformId) === r.platformId);
              const nominal = r.nominal.trim() === "" ? null : parseRupiah(r.nominal);
              return (
                <tr key={r.key} className="border-b border-[var(--hairline)] last:border-0">
                  <td className="px-3 py-2">
                    <select
                      name="row_platform"
                      className="field py-1.5 text-xs"
                      value={r.platformId}
                      onChange={(e) => {
                        const p = platform.find((x) => String(x.id) === e.target.value);
                        patch(r.key, {
                          platformId: e.target.value,
                          divisiId:
                            r.divisiId === "" && p?.divisiId
                              ? String(p.divisiId)
                              : r.divisiId,
                          akunId: "",
                        });
                      }}
                      aria-label="Category"
                    >
                      <option value="">—</option>
                      {platform.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <select
                      name="row_divisi"
                      className="field py-1.5 text-xs"
                      value={r.divisiId}
                      onChange={(e) => patch(r.key, { divisiId: e.target.value })}
                      aria-label="Divisi"
                    >
                      <option value="">—</option>
                      {divisi.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <select
                      name="row_brand"
                      className="field py-1.5 text-xs"
                      value={r.brandId}
                      onChange={(e) => patch(r.key, { brandId: e.target.value })}
                      aria-label="Brand"
                    >
                      <option value="">—</option>
                      {brand.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <select
                      name="row_akun"
                      className="field py-1.5 text-xs"
                      value={r.akunId}
                      onChange={(e) => patch(r.key, { akunId: e.target.value })}
                      aria-label="Akun iklan"
                    >
                      <option value="">—</option>
                      {akunRow.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <input
                      name="row_nominal"
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      className="field tnum w-[140px] py-1.5 text-xs"
                      placeholder="0"
                      value={r.nominal}
                      onChange={(e) => patch(r.key, { nominal: e.target.value })}
                      aria-label="Nominal"
                      aria-invalid={
                        r.nominal.trim() !== "" && nominal === null ? true : undefined
                      }
                    />
                    {r.nominal.trim() !== "" && (
                      <span
                        className="tnum mt-0.5 block text-[11px]"
                        style={{
                          color:
                            nominal === null
                              ? "var(--status-critical)"
                              : "var(--text-muted)",
                        }}
                      >
                        {nominal === null ? "tidak terbaca" : fmtIdr(nominal)}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <input
                      name="row_ket"
                      type="text"
                      className="field py-1.5 text-xs"
                      placeholder="opsional"
                      value={r.ket}
                      onChange={(e) => patch(r.key, { ket: e.target.value })}
                      aria-label="Keterangan"
                    />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      className="btn btn-ghost px-2 py-1 text-xs"
                      onClick={() =>
                        setRows((rs) =>
                          rs.length > 1 ? rs.filter((x) => x.key !== r.key) : rs,
                        )
                      }
                      aria-label="Hapus baris"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-[var(--hairline)]">
              <td colSpan={4} className="px-3 py-2.5 text-xs text-[var(--text-muted)]">
                {terisi} baris terisi
              </td>
              <td className="tnum px-3 py-2.5 font-semibold">{fmtIdr(total)}</td>
              <td colSpan={2} className="px-3 py-2.5 text-right">
                <button
                  type="button"
                  className="btn btn-ghost px-2.5 py-1 text-xs"
                  onClick={() => setRows((rs) => [...rs, freshRow()])}
                >
                  + Tambah baris
                </button>
              </td>
            </tr>
          </tfoot>
        </table>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <FormButton pendingLabel="Menyimpan…" disabled={terisi === 0}>
          Simpan {terisi > 0 ? `${terisi} baris` : "pengeluaran harian"}
        </FormButton>
        <p className="text-xs text-[var(--text-muted)]">
          Baris tanpa nominal dilewati. Semua baris disimpan sekaligus — kalau ada
          satu yang bermasalah, tidak ada yang tersimpan.
        </p>
      </div>
    </form>
  );
}
