"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { savePengajuan, type ActionState } from "@/app/actions";
import { fmtIdr, todayISO } from "@/lib/format";
import { parseRupiah } from "@/lib/num";
import type { PengajuanRow, Tujuan } from "@/lib/types";
import CopyBox from "./CopyBox";
import MoneyField from "./MoneyField";
import { Alert, FormButton } from "./ui";

const EMPTY: ActionState = { ok: false };

export interface Opt {
  id: number;
  label: string;
  /** Divisi usulan platform — mengisi kolom divisi saat platform dipilih. */
  divisiId?: number | null;
  /** Baris rekening siap tempel untuk format ke finance. */
  rek?: string;
}

export default function PengajuanForm({
  initial,
  penerima,
  dompet,
  brand,
  platform,
  divisi,
}: {
  initial?: PengajuanRow;
  penerima: Opt[];
  dompet: Opt[];
  brand: Opt[];
  platform: Opt[];
  divisi: Opt[];
}) {
  const router = useRouter();
  const editing = Boolean(initial);
  const [state, action] = useActionState(savePengajuan, EMPTY);
  const formRef = useRef<HTMLFormElement>(null);

  const [tujuan, setTujuan] = useState<Tujuan>(initial?.tujuan ?? "langsung");
  const [keterangan, setKeterangan] = useState(initial?.keterangan ?? "");
  const [nominalText, setNominalText] = useState(
    initial ? String(initial.nominal) : "",
  );
  const [penerimaId, setPenerimaId] = useState(String(initial?.penerima_id ?? ""));
  const [dompetId, setDompetId] = useState(String(initial?.dompet_id ?? ""));
  const [brandId, setBrandId] = useState(String(initial?.brand_id ?? ""));
  const [platformId, setPlatformId] = useState(String(initial?.platform_id ?? ""));
  const [divisiId, setDivisiId] = useState(String(initial?.divisi_id ?? ""));

  useEffect(() => {
    if (!state.ok) return;
    if (editing) router.push(`/pengajuan/${initial!.id}`);
    else router.push("/pengajuan");
  }, [state.ok, editing, initial, router]);

  const label = (list: Opt[], id: string) =>
    list.find((o) => String(o.id) === id)?.label ?? "";

  /**
   * Teks yang dikirim ke finance. Disusun dari data yang tersimpan, bukan
   * diketik ulang di chat — nomor rekening yang salah satu digit adalah cara
   * paling mahal kehilangan uang di alur ini.
   */
  const format = useMemo(() => {
    const nominal = parseRupiah(nominalText);
    const rek =
      tujuan === "dompet"
        ? (dompet.find((d) => String(d.id) === dompetId)?.rek ?? "")
        : (penerima.find((p) => String(p.id) === penerimaId)?.rek ?? "");
    return [
      `Keterangan : ${keterangan || "—"}`,
      `Nominal : ${nominal === null ? "—" : fmtIdr(nominal)}`,
      `Rekening : ${rek || "—"}`,
      `Brand : ${label(brand, brandId) || "—"}`,
      `Platform : ${label(platform, platformId) || "—"}`,
      `Divisi : ${label(divisi, divisiId) || "—"}`,
    ].join("\n");
  }, [
    keterangan, nominalText, tujuan, dompetId, penerimaId, brandId, platformId,
    divisiId, brand, platform, divisi, dompet, penerima,
  ]);

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[1fr_320px]">
      <form ref={formRef} action={action} className="card space-y-4 p-4 sm:p-5">
        {editing && <input type="hidden" name="id" value={initial!.id} />}
        <Alert state={state} />

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="p-tanggal">
              Tanggal pengajuan
            </label>
            <input
              id="p-tanggal"
              name="tanggal"
              type="date"
              required
              className="field tnum"
              defaultValue={initial?.tanggal ?? todayISO()}
            />
          </div>

          <MoneyField
            name="nominal"
            label="Nominal yang diminta"
            defaultValue={initial?.nominal ?? ""}
            required
            onTextChange={setNominalText}
          />
        </div>

        <div>
          <label className="label" htmlFor="p-keterangan">
            Keterangan
          </label>
          <input
            id="p-keterangan"
            name="keterangan"
            type="text"
            required
            minLength={3}
            className="field"
            placeholder="mis. Top-up iklan Meta PN138 minggu 3"
            value={keterangan}
            onChange={(e) => setKeterangan(e.target.value)}
          />
          <p className="hint">Baris pertama yang dibaca finance.</p>
        </div>

        <fieldset>
          <legend className="label">Dana dikirim ke mana</legend>
          <div className="flex flex-col gap-2 sm:flex-row">
            {(
              [
                {
                  v: "langsung" as Tujuan,
                  t: "Rekening penerima",
                  d: "Endorser, agency, vendor SEO. Langsung jadi biaya begitu cair.",
                },
                {
                  v: "dompet" as Tujuan,
                  t: "Dompet kita",
                  d: "Bank Jago / Jenius. Jadi saldo dulu, belum biaya.",
                },
              ] as const
            ).map((o) => (
              <label
                key={o.v}
                className="flex flex-1 cursor-pointer flex-col gap-0.5 rounded-lg border px-3 py-2 text-sm transition"
                style={{
                  borderColor:
                    tujuan === o.v ? "var(--series-1)" : "var(--hairline)",
                  background: tujuan === o.v ? "var(--wash)" : "transparent",
                }}
              >
                <span className="flex items-center gap-2 font-medium">
                  <input
                    type="radio"
                    name="tujuan"
                    value={o.v}
                    checked={tujuan === o.v}
                    onChange={() => setTujuan(o.v)}
                    className="sr-only"
                  />
                  <span aria-hidden>{tujuan === o.v ? "◉" : "○"}</span>
                  {o.t}
                </span>
                <span className="text-xs text-[var(--text-muted)]">{o.d}</span>
              </label>
            ))}
          </div>
        </fieldset>

        {tujuan === "langsung" ? (
          <div>
            <label className="label" htmlFor="p-penerima">
              Rekening penerima
            </label>
            <select
              id="p-penerima"
              name="penerima_id"
              className="field"
              value={penerimaId}
              onChange={(e) => setPenerimaId(e.target.value)}
            >
              <option value="">— pilih penerima —</option>
              {penerima.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.rek ?? p.label}
                </option>
              ))}
            </select>
            <p className="hint">
              Belum ada di daftar?{" "}
              <Link href="/master/penerima" className="underline">
                tambah rekening penerima
              </Link>
              .
            </p>
          </div>
        ) : (
          <div>
            <label className="label" htmlFor="p-dompet">
              Dompet tujuan
            </label>
            <select
              id="p-dompet"
              name="dompet_id"
              className="field"
              value={dompetId}
              onChange={(e) => setDompetId(e.target.value)}
            >
              <option value="">— pilih dompet —</option>
              {dompet.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.rek ?? d.label}
                </option>
              ))}
            </select>
            <p className="hint">
              Dana yang cair ke sini dicatat sebagai top-up, bukan biaya. Biayanya
              muncul saat kamu input belanja hariannya.
            </p>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="label" htmlFor="p-platform">
              Platform
            </label>
            <select
              id="p-platform"
              name="platform_id"
              className="field"
              value={platformId}
              onChange={(e) => {
                setPlatformId(e.target.value);
                // Divisi usulan platform hanya mengisi kolom yang masih kosong;
                // pilihan yang sudah dibuat orang tidak ditimpa.
                const p = platform.find((x) => String(x.id) === e.target.value);
                if (p?.divisiId && divisiId === "") setDivisiId(String(p.divisiId));
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
            <label className="label" htmlFor="p-divisi">
              Divisi
            </label>
            <select
              id="p-divisi"
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
            <label className="label" htmlFor="p-brand">
              Brand
            </label>
            <select
              id="p-brand"
              name="brand_id"
              className="field"
              value={brandId}
              onChange={(e) => setBrandId(e.target.value)}
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

        <div>
          <label className="label" htmlFor="p-catatan">
            Catatan internal
          </label>
          <input
            id="p-catatan"
            name="catatan"
            type="text"
            className="field"
            placeholder="opsional — tidak ikut dikirim ke finance"
            defaultValue={initial?.catatan ?? ""}
          />
        </div>

        {!editing && (
          <fieldset>
            <legend className="label">Simpan sebagai</legend>
            <div className="flex gap-4 text-sm">
              <label className="flex items-center gap-1.5">
                <input type="radio" name="status" value="draft" defaultChecked />
                Draft
              </label>
              <label className="flex items-center gap-1.5">
                <input type="radio" name="status" value="diajukan" />
                Sudah dikirim ke finance
              </label>
            </div>
          </fieldset>
        )}

        <div className="flex gap-2 pt-1">
          <FormButton pendingLabel="Menyimpan…">
            {editing ? "Simpan perubahan" : "Simpan pengajuan"}
          </FormButton>
          <Link
            href={editing ? `/pengajuan/${initial!.id}` : "/pengajuan"}
            className="btn btn-ghost"
          >
            Batal
          </Link>
        </div>
      </form>

      <section className="card p-4 sm:p-5">
        <h2 className="text-sm font-semibold">Format untuk finance</h2>
        <p className="mt-0.5 mb-3 text-xs text-[var(--text-muted)]">
          Isi formulirnya, lalu tempel teks ini ke chat finance.
        </p>
        <CopyBox text={format} />
      </section>
    </div>
  );
}
