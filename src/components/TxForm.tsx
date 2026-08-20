"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { saveTransaksi, type ActionState } from "@/app/actions";
import { JENIS_LABEL, todayISO } from "@/lib/format";
import type { Jenis, Sumber, TxRow } from "@/lib/types";
import MoneyField from "./MoneyField";
import { Alert, FormButton } from "./ui";

const EMPTY: ActionState = { ok: false };

export interface TxOpt {
  id: number;
  label: string;
  divisiId?: number | null;
  platformId?: number;
  dompetId?: number | null;
}

const JENIS_HINT: Record<Jenis, string> = {
  belanja: "Uang yang benar-benar jadi biaya marketing.",
  topup: "Dana dari finance masuk dompet. Menambah saldo, belum jadi biaya.",
  refund:
    "Pengembalian dari platform atau endorse yang batal. Mengurangi biaya divisi/platform terkait.",
  biaya_dompet: "Biaya admin atau transfer bank. Biaya, tapi bukan biaya platform.",
  koreksi:
    "Penyesuaian saldo dompet saja — untuk merapikan selisih hasil cek mutasi. Tidak mengubah total biaya.",
};

const JENIS_ORDER: Jenis[] = ["belanja", "topup", "refund", "biaya_dompet", "koreksi"];

export default function TxForm({
  initial,
  divisi,
  platform,
  brand,
  dompet,
  akun,
  penerima,
  /** Nilai awal saat membuka form dari halaman dompet. */
  presetDompetId,
  presetJenis,
  backHref = "/belanja",
}: {
  initial?: TxRow;
  divisi: TxOpt[];
  platform: TxOpt[];
  brand: TxOpt[];
  dompet: TxOpt[];
  akun: TxOpt[];
  penerima: TxOpt[];
  presetDompetId?: number;
  presetJenis?: Jenis;
  backHref?: string;
}) {
  const router = useRouter();
  const editing = Boolean(initial);
  const [state, action] = useActionState(saveTransaksi, EMPTY);

  const [jenis, setJenis] = useState<Jenis>(initial?.jenis ?? presetJenis ?? "belanja");
  const [sumber, setSumber] = useState<Sumber>(initial?.sumber ?? "dompet");
  const [platformId, setPlatformId] = useState(String(initial?.platform_id ?? ""));
  const [divisiId, setDivisiId] = useState(String(initial?.divisi_id ?? ""));
  const [dompetId, setDompetId] = useState(
    String(initial?.dompet_id ?? presetDompetId ?? ""),
  );

  useEffect(() => {
    if (state.ok) router.push(backHref);
  }, [state.ok, backHref, router]);

  const pakaiKelompok = jenis === "belanja" || jenis === "refund";
  const pakaiDompet =
    jenis === "topup" ||
    jenis === "biaya_dompet" ||
    jenis === "koreksi" ||
    (jenis === "belanja" && sumber === "dompet") ||
    jenis === "refund";
  const akunTerpilih = akun.filter((a) => String(a.platformId) === platformId);

  return (
    <form action={action} className="card space-y-4 p-4 sm:p-5">
      {editing && <input type="hidden" name="id" value={initial!.id} />}
      <Alert state={state} />

      <div className="grid gap-4 sm:grid-cols-[160px_1fr]">
        <div>
          <label className="label" htmlFor="t-tanggal">
            Tanggal
          </label>
          <input
            id="t-tanggal"
            name="tanggal"
            type="date"
            required
            className="field tnum"
            defaultValue={initial?.tanggal ?? todayISO()}
          />
        </div>

        <div>
          <label className="label" htmlFor="t-jenis">
            Jenis
          </label>
          <select
            id="t-jenis"
            name="jenis"
            className="field"
            value={jenis}
            onChange={(e) => setJenis(e.target.value as Jenis)}
          >
            {JENIS_ORDER.map((j) => (
              <option key={j} value={j}>
                {JENIS_LABEL[j]}
              </option>
            ))}
          </select>
          <p className="hint">{JENIS_HINT[jenis]}</p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <MoneyField
          name="nominal"
          label="Nominal"
          defaultValue={initial?.nominal ?? ""}
          required
        />

        {jenis === "koreksi" && (
          <div>
            <label className="label" htmlFor="t-arah">
              Arah koreksi
            </label>
            <select
              id="t-arah"
              name="arah"
              className="field"
              defaultValue={String(initial?.arah ?? 1)}
            >
              <option value="1">Menambah saldo</option>
              <option value="-1">Mengurangi saldo</option>
            </select>
          </div>
        )}

        {jenis === "belanja" && (
          <fieldset>
            <legend className="label">Sumber dana</legend>
            <div className="flex gap-2">
              {(
                [
                  { v: "dompet" as Sumber, t: "Dari dompet" },
                  { v: "finance" as Sumber, t: "Finance langsung" },
                ] as const
              ).map((o) => (
                <label
                  key={o.v}
                  className="flex flex-1 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition"
                  style={{
                    borderColor:
                      sumber === o.v ? "var(--series-1)" : "var(--hairline)",
                    background: sumber === o.v ? "var(--wash)" : "transparent",
                  }}
                >
                  <input
                    type="radio"
                    name="sumber"
                    value={o.v}
                    checked={sumber === o.v}
                    onChange={() => setSumber(o.v)}
                    className="sr-only"
                  />
                  <span aria-hidden>{sumber === o.v ? "◉" : "○"}</span>
                  {o.t}
                </label>
              ))}
            </div>
          </fieldset>
        )}
      </div>

      {pakaiDompet && (
        <div>
          <label className="label" htmlFor="t-dompet">
            Dompet
            {jenis === "refund" && (
              <span className="font-normal text-[var(--text-muted)]">
                {" "}
                — kosongkan kalau refundnya kembali ke finance
              </span>
            )}
          </label>
          <select
            id="t-dompet"
            name="dompet_id"
            className="field"
            value={dompetId}
            onChange={(e) => setDompetId(e.target.value)}
            required={jenis !== "refund"}
          >
            <option value="">
              {jenis === "refund" ? "— tidak masuk dompet —" : "— pilih dompet —"}
            </option>
            {dompet.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {pakaiKelompok && (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="label" htmlFor="t-platform">
                Platform
              </label>
              <select
                id="t-platform"
                name="platform_id"
                className="field"
                required
                value={platformId}
                onChange={(e) => {
                  setPlatformId(e.target.value);
                  const p = platform.find((x) => String(x.id) === e.target.value);
                  if (p?.divisiId && divisiId === "") setDivisiId(String(p.divisiId));
                  if (p?.dompetId && dompetId === "") setDompetId(String(p.dompetId));
                }}
              >
                <option value="">— pilih platform —</option>
                {platform.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="label" htmlFor="t-divisi">
                Divisi
              </label>
              <select
                id="t-divisi"
                name="divisi_id"
                className="field"
                required
                value={divisiId}
                onChange={(e) => setDivisiId(e.target.value)}
              >
                <option value="">— pilih divisi —</option>
                {divisi.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="label" htmlFor="t-brand">
                Brand
              </label>
              <select
                id="t-brand"
                name="brand_id"
                className="field"
                defaultValue={String(initial?.brand_id ?? "")}
              >
                <option value="">— tanpa brand —</option>
                {brand.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {jenis === "belanja" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="t-akun">
                  Akun iklan
                </label>
                <select
                  id="t-akun"
                  name="akun_iklan_id"
                  className="field"
                  defaultValue={String(initial?.akun_iklan_id ?? "")}
                  disabled={akunTerpilih.length === 0}
                >
                  <option value="">
                    {akunTerpilih.length === 0
                      ? "— platform ini belum punya akun iklan —"
                      : "— tanpa akun iklan —"}
                  </option>
                  {akunTerpilih.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="label" htmlFor="t-penerima">
                  Penerima
                </label>
                <select
                  id="t-penerima"
                  name="penerima_id"
                  className="field"
                  defaultValue={String(initial?.penerima_id ?? "")}
                >
                  <option value="">— tidak dicatat —</option>
                  {penerima.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </>
      )}

      <div className="grid gap-4 sm:grid-cols-[1fr_200px]">
        <div>
          <label className="label" htmlFor="t-ket">
            Keterangan
          </label>
          <input
            id="t-ket"
            name="keterangan"
            type="text"
            className="field"
            placeholder="mis. Auto payment Meta 12 Agu"
            defaultValue={initial?.keterangan ?? ""}
          />
        </div>
        <div>
          <label className="label" htmlFor="t-ref">
            No. referensi
          </label>
          <input
            id="t-ref"
            name="no_ref"
            type="text"
            className="field"
            placeholder="invoice / ref mutasi"
            defaultValue={initial?.no_ref ?? ""}
          />
        </div>
      </div>

      <div className="flex gap-2 pt-1">
        <FormButton pendingLabel="Menyimpan…">
          {editing ? "Simpan perubahan" : "Simpan transaksi"}
        </FormButton>
        <Link href={backHref} className="btn btn-ghost">
          Batal
        </Link>
      </div>
    </form>
  );
}
