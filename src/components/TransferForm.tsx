"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
import { saveTransfer, type ActionState } from "@/app/actions";
import { fmtIdr } from "@/lib/format";
import { parseRupiah } from "@/lib/num";
import type { DompetOpt } from "./HarianForm";
import MoneyField from "./MoneyField";
import { Alert, FormButton } from "./ui";

const EMPTY: ActionState = { ok: false };

/**
 * Pindah saldo antar-dompet.
 *
 * Yang ditampilkan sambil mengetik adalah **sisa kedua dompet setelah** pindahan
 * — bukan cuma nominalnya. Itu satu-satunya angka yang menentukan apakah
 * pindahan ini aman: dompet asal yang kekeringan membuat auto payment iklan
 * gagal, dan kegagalan itu baru terasa sehari kemudian.
 */
export default function TransferForm({
  today,
  dompet,
  defaultAsalId,
  backHref = "/dompet",
}: {
  today: string;
  dompet: DompetOpt[];
  defaultAsalId?: number;
  backHref?: string;
}) {
  const router = useRouter();
  const [state, action] = useActionState(saveTransfer, EMPTY);

  const [asalId, setAsalId] = useState(String(defaultAsalId ?? dompet[0]?.id ?? ""));
  const [tujuanId, setTujuanId] = useState(
    String(dompet.find((d) => String(d.id) !== String(defaultAsalId ?? dompet[0]?.id))?.id ?? ""),
  );
  const [nominalText, setNominalText] = useState("");
  const [biayaText, setBiayaText] = useState("");

  const sudahDibereskan = useRef<ActionState | null>(null);
  useEffect(() => {
    if (!state.ok || sudahDibereskan.current === state) return;
    sudahDibereskan.current = state;
    setNominalText("");
    setBiayaText("");
    router.refresh();
  }, [state, router]);

  const asal = dompet.find((d) => String(d.id) === asalId);
  const tujuan = dompet.find((d) => String(d.id) === tujuanId);
  const nominal = parseRupiah(nominalText) ?? 0;
  const biaya = parseRupiah(biayaText) ?? 0;
  const sisaAsal = asal ? asal.sisa - nominal - biaya : null;
  const sisaTujuan = tujuan ? tujuan.sisa + nominal : null;
  const sama = asalId !== "" && asalId === tujuanId;

  return (
    <form action={action} className="card space-y-4 p-4 sm:p-5">
      <Alert state={state} />

      <div className="grid gap-4 sm:grid-cols-[160px_1fr_1fr]">
        <div>
          <label className="label" htmlFor="tf-tanggal">
            Tanggal
          </label>
          <input
            id="tf-tanggal"
            name="tanggal"
            type="date"
            required
            className="field tnum"
            defaultValue={today}
          />
        </div>

        <div>
          <label className="label" htmlFor="tf-asal">
            Dari dompet
          </label>
          <select
            id="tf-asal"
            name="dompet_asal_id"
            className="field"
            required
            value={asalId}
            onChange={(e) => setAsalId(e.target.value)}
          >
            <option value="">— pilih dompet —</option>
            {dompet.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label} · sisa {fmtIdr(d.sisa)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label" htmlFor="tf-tujuan">
            Ke dompet
          </label>
          <select
            id="tf-tujuan"
            name="dompet_tujuan_id"
            className="field"
            required
            value={tujuanId}
            onChange={(e) => setTujuanId(e.target.value)}
            aria-invalid={sama || undefined}
          >
            <option value="">— pilih dompet —</option>
            {dompet.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label} · sisa {fmtIdr(d.sisa)}
              </option>
            ))}
          </select>
          {sama && (
            <p className="hint" style={{ color: "var(--status-critical)" }}>
              Dompet asal dan tujuan tidak boleh sama.
            </p>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <MoneyField
          name="nominal"
          label="Nominal dipindah"
          required
          onTextChange={setNominalText}
        />
        <MoneyField
          name="biaya_admin"
          label="Biaya transfer"
          hint="Kosongkan kalau gratis. Dicatat terpisah sebagai biaya bank pada dompet asal — pindahannya sendiri bukan biaya."
          onTextChange={setBiayaText}
        />
      </div>

      {(asal || tujuan) && (
        <div className="grid gap-3 rounded-lg border border-[var(--hairline)] p-3 sm:grid-cols-2">
          <div>
            <div className="text-xs text-[var(--text-muted)]">
              Sisa {asal?.label ?? "dompet asal"} setelah
            </div>
            <div
              className="tnum text-lg font-semibold"
              style={{
                color:
                  sisaAsal === null
                    ? undefined
                    : sisaAsal < 0
                      ? "var(--status-critical)"
                      : asal && sisaAsal < asal.minSaldo
                        ? "var(--status-serious)"
                        : undefined,
              }}
            >
              {sisaAsal === null ? "–" : fmtIdr(sisaAsal)}
            </div>
            {sisaAsal !== null && sisaAsal < 0 && (
              <p className="hint" style={{ color: "var(--status-critical)" }}>
                Melebihi saldo yang ada.
              </p>
            )}
            {sisaAsal !== null && asal && sisaAsal >= 0 && sisaAsal < asal.minSaldo && (
              <p className="hint" style={{ color: "var(--status-serious)" }}>
                Di bawah batas minimum {fmtIdr(asal.minSaldo)} — auto payment bisa
                gagal.
              </p>
            )}
          </div>
          <div>
            <div className="text-xs text-[var(--text-muted)]">
              Sisa {tujuan?.label ?? "dompet tujuan"} setelah
            </div>
            <div className="tnum text-lg font-semibold">
              {sisaTujuan === null ? "–" : fmtIdr(sisaTujuan)}
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-[1fr_200px]">
        <div>
          <label className="label" htmlFor="tf-ket">
            Keterangan
          </label>
          <input
            id="tf-ket"
            name="keterangan"
            type="text"
            className="field"
            placeholder="opsional — mis. siapkan dana iklan TikTok"
          />
          <p className="hint">
            Ikut ditulis di kedua sisi mutasi, bersama nama dompet lawannya.
          </p>
        </div>
        <div>
          <label className="label" htmlFor="tf-ref">
            No. referensi
          </label>
          <input
            id="tf-ref"
            name="no_ref"
            type="text"
            className="field"
            placeholder="ref mutasi bank"
          />
        </div>
      </div>

      <div className="flex gap-2 pt-1">
        <FormButton pendingLabel="Menyimpan…" disabled={sama || dompet.length < 2}>
          Pindahkan saldo
        </FormButton>
        <Link href={backHref} className="btn btn-ghost">
          Selesai
        </Link>
      </div>

      {dompet.length < 2 && (
        <p className="hint" style={{ color: "var(--status-serious)" }}>
          Pindah saldo butuh minimal dua dompet aktif.
        </p>
      )}
    </form>
  );
}
