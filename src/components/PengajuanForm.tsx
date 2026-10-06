"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { savePengajuan, type ActionState } from "@/app/actions";
import { brandFinance, fmtIdr, linkFinance, pisahLink, todayISO } from "@/lib/format";
import { parseRupiah } from "@/lib/num";
import { bagiRata } from "@/lib/split";
import type { PengajuanBrand, PengajuanRow, Tujuan } from "@/lib/types";
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
  /** Rincian rekening penerima — untuk mengisi otomatis kolom manualnya. */
  bank?: string;
  noRek?: string;
}

/** Nomor rekening tanpa pemisah, supaya "123 456" dan "123456" dianggap sama. */
const digitRek = (s: string) => s.replace(/[ .-]/g, "");

/** Bentuknya sama dengan `rekLine` di lib/opts — itu modul server. */
function rekLine(bank: string, noRek: string, nama: string): string {
  const kiri = [bank, noRek].filter(Boolean).join(" ");
  return kiri ? `${kiri} (${nama})` : nama;
}

/** Nama bank dan e-wallet yang umum, sebagai saran ketik. */
const BANK_UMUM = [
  "BCA", "BRI", "BNI", "Mandiri", "BSI", "CIMB Niaga", "Permata", "Danamon",
  "BTN", "Bank Jago", "Jenius", "SeaBank", "blu by BCA", "DANA", "OVO",
  "GoPay", "ShopeePay", "LinkAja",
];

/** Satu baris pembagian di formulir. `key` hanya untuk React. */
interface Porsi {
  key: number;
  brandId: string;
  nominal: string;
}

export default function PengajuanForm({
  initial,
  porsiAwal = [],
  penerima,
  dompet,
  brand,
  platform,
  divisi,
}: {
  initial?: PengajuanRow;
  /** Pembagian yang sudah tersimpan, saat mengubah pengajuan. */
  porsiAwal?: PengajuanBrand[];
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
  const [rekNo, setRekNo] = useState(initial?.penerima_no_rek ?? "");
  const [rekNama, setRekNama] = useState(initial?.penerima_nama ?? "");
  const [rekBank, setRekBank] = useState(initial?.penerima_bank ?? "");
  const [dompetId, setDompetId] = useState(String(initial?.dompet_id ?? ""));
  const [brandId, setBrandId] = useState(String(initial?.brand_id ?? ""));
  const [platformId, setPlatformId] = useState(String(initial?.platform_id ?? ""));
  const [divisiId, setDivisiId] = useState(String(initial?.divisi_id ?? ""));
  // Selalu ada minimal satu kotak link, walau kosong — tombol tambah menyusul.
  const [links, setLinks] = useState<string[]>(() => {
    const ada = pisahLink(initial?.links);
    return ada.length > 0 ? ada : [""];
  });

  // Pembagian ke beberapa brand. Penomor kunci baris hidup di ref, bukan state:
  // ia tidak pernah memengaruhi tampilan, dan state yang ikut jadi dependency
  // effect pernah membuat lingkaran render di formulir lain.
  const [multi, setMulti] = useState(porsiAwal.length > 0);
  const porsiKey = useRef(porsiAwal.length);
  const [porsi, setPorsi] = useState<Porsi[]>(() =>
    porsiAwal.length > 0
      ? porsiAwal.map((p, i) => ({
          key: i,
          brandId: String(p.brand_id),
          nominal: String(p.nominal),
        }))
      : [
          { key: 0, brandId: "", nominal: "" },
          { key: 1, brandId: "", nominal: "" },
        ],
  );
  const barisBaru = () => ({
    key: (porsiKey.current += 1),
    brandId: "",
    nominal: "",
  });

  const nominalAngka = parseRupiah(nominalText) ?? 0;
  const jumlahPorsi = porsi.reduce((s, p) => s + (parseRupiah(p.nominal) ?? 0), 0);
  const selisih = jumlahPorsi - nominalAngka;
  const porsiTerisi = porsi.filter(
    (p) => p.brandId !== "" && (parseRupiah(p.nominal) ?? 0) > 0,
  ).length;

  useEffect(() => {
    if (!state.ok) return;
    if (editing) router.push(`/pengajuan/${initial!.id}`);
    else router.push("/pengajuan");
  }, [state.ok, editing, initial, router]);

  // Rekening yang cocok persis dengan isian — penanda "sudah tersimpan".
  const rekTersimpan = penerima.find(
    (p) =>
      digitRek(p.noRek ?? "") === digitRek(rekNo.trim()) &&
      (p.bank ?? "").toLowerCase() === rekBank.trim().toLowerCase() &&
      p.label.toLowerCase() === rekNama.trim().toLowerCase(),
  );
  const rekLengkap = rekNo.trim() !== "" && rekNama.trim() !== "" && rekBank.trim() !== "";
  const saranBank = useMemo(
    () =>
      [...new Set([...penerima.map((p) => p.bank ?? ""), ...BANK_UMUM])].filter(Boolean),
    [penerima],
  );

  const saranNama = useMemo(
    () => [...new Set(penerima.map((p) => p.label))],
    [penerima],
  );

  // Rekening tersimpan yang cocok dengan isian tapi lebih dari satu — misalnya
  // dua orang bernama sama di bank berbeda. Tidak ditebak: orangnya memilih.
  const [pilihan, setPilihan] = useState<Opt[]>([]);

  const pakaiRekening = (p: Opt) => {
    setRekNo(p.noRek ?? "");
    setRekNama(p.label);
    setRekBank(p.bank ?? "");
    setPilihan([]);
  };

  /** Satu kecocokan langsung terisi; lebih dari satu dibuka jadi pilihan. */
  const cocokkan = (cocok: Opt[]) => {
    if (cocok.length === 1) pakaiRekening(cocok[0]);
    else setPilihan(cocok.length > 1 ? cocok : []);
  };

  /** Nomor yang sudah pernah tersimpan mengisi nama dan bank sendiri. */
  const ubahNoRek = (value: string) => {
    setRekNo(value);
    const d = digitRek(value.trim());
    if (d.length < 4) return setPilihan([]);
    cocokkan(penerima.filter((p) => digitRek(p.noRek ?? "") === d));
  };

  /** Nama yang sudah pernah tersimpan mengisi nomor dan bank sendiri. */
  const ubahNama = (value: string) => {
    setRekNama(value);
    const n = value.trim().toLowerCase();
    if (n.length < 2) return setPilihan([]);
    cocokkan(penerima.filter((p) => p.label.toLowerCase() === n));
  };

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
        : rekNama.trim() && rekLine(rekBank.trim(), rekNo.trim(), rekNama.trim());
    // Pembagian ikut ditulis ke finance apa adanya: merekalah yang mentransfer,
    // dan porsi yang cuma hidup di panel akan jadi tebakan saat dicocokkan nanti.
    const barisBrand = brandFinance(
      label(brand, brandId),
      multi
        ? porsi
            .filter((p) => p.brandId !== "")
            .map((p) => ({ nama: label(brand, p.brandId), nominal: parseRupiah(p.nominal) }))
        : [],
    );

    return [
      `Keterangan : ${keterangan || "—"}`,
      `Nominal : ${nominal === null ? "—" : fmtIdr(nominal)}`,
      `Rekening : ${rek || "—"}`,
      barisBrand,
      `Category : ${label(platform, platformId) || "—"}`,
      `Divisi : ${label(divisi, divisiId) || "—"}`,
      ...linkFinance(links.map((l) => l.trim()).filter(Boolean)),
    ].join("\n");
  }, [
    keterangan, nominalText, tujuan, dompetId, rekNo, rekNama, rekBank, brandId, platformId,
    divisiId, brand, platform, divisi, dompet, multi, porsi, links,
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
          <legend className="label">
            Link <span className="font-normal text-[var(--text-muted)]">(opsional)</span>
          </legend>
          <div className="space-y-2">
            {links.map((l, i) => (
              // Kunci pakai urutan: isinya bisa kembar selagi diketik.
              <div key={i} className="flex gap-2">
                <input
                  name="link"
                  type="text"
                  inputMode="url"
                  autoComplete="off"
                  className="field"
                  placeholder="mis. instagram.com/namaakun"
                  aria-label={`Link ${i + 1}`}
                  value={l}
                  onChange={(e) =>
                    setLinks((ls) => ls.map((x, j) => (j === i ? e.target.value : x)))
                  }
                />
                {links.length > 1 && (
                  <button
                    type="button"
                    className="btn btn-ghost px-2.5"
                    aria-label={`Buang link ${i + 1}`}
                    onClick={() => setLinks((ls) => ls.filter((_, j) => j !== i))}
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
          <div className="mt-1.5 flex items-center justify-between gap-2">
            <p className="hint mt-0">
              Profil atau konten yang dikontrak. Ikut terkirim ke finance.
            </p>
            <button
              type="button"
              className="btn btn-ghost shrink-0 px-2.5 py-1 text-xs"
              disabled={links.length >= 20}
              onClick={() => setLinks((ls) => [...ls, ""])}
            >
              + Tambah link
            </button>
          </div>
        </fieldset>

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
          <fieldset>
            <legend className="label">Rekening penerima</legend>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="text-xs text-[var(--text-muted)]" htmlFor="p-rek-no">
                  Nomor rekening
                </label>
                <input
                  id="p-rek-no"
                  name="penerima_no_rek"
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  required
                  list="p-rek-no-list"
                  className="field tnum"
                  placeholder="mis. 1234567890"
                  value={rekNo}
                  onChange={(e) => ubahNoRek(e.target.value)}
                />
                <datalist id="p-rek-no-list">
                  {penerima
                    .filter((p) => p.noRek)
                    .map((p) => (
                      <option key={p.id} value={p.noRek}>
                        {p.rek}
                      </option>
                    ))}
                </datalist>
              </div>
              <div>
                <label className="text-xs text-[var(--text-muted)]" htmlFor="p-rek-nama">
                  Nama rekening
                </label>
                <input
                  id="p-rek-nama"
                  name="penerima_nama"
                  type="text"
                  autoComplete="off"
                  required
                  minLength={2}
                  className="field"
                  list="p-rek-nama-list"
                  placeholder="nama pemilik rekening"
                  value={rekNama}
                  onChange={(e) => ubahNama(e.target.value)}
                />
                <datalist id="p-rek-nama-list">
                  {saranNama.map((n) => (
                    <option key={n} value={n} />
                  ))}
                </datalist>
              </div>
              <div>
                <label className="text-xs text-[var(--text-muted)]" htmlFor="p-rek-bank">
                  Bank / e-wallet
                </label>
                <input
                  id="p-rek-bank"
                  name="penerima_bank"
                  type="text"
                  autoComplete="off"
                  required
                  list="p-rek-bank-list"
                  className="field"
                  placeholder="mis. BCA, DANA"
                  value={rekBank}
                  onChange={(e) => setRekBank(e.target.value)}
                />
                <datalist id="p-rek-bank-list">
                  {saranBank.map((b) => (
                    <option key={b} value={b} />
                  ))}
                </datalist>
              </div>
            </div>
            {pilihan.length > 1 && (
              <div className="mt-3">
                <label className="text-xs text-[var(--text-muted)]" htmlFor="p-rek-pilih">
                  Ada {pilihan.length} rekening yang cocok — pilih salah satu
                </label>
                {/* Tanpa `name`: ini hanya pemilih, yang terkirim tetap tiga kolom di atas. */}
                <select
                  id="p-rek-pilih"
                  className="field"
                  value=""
                  onChange={(e) => {
                    const p = pilihan.find((x) => String(x.id) === e.target.value);
                    if (p) pakaiRekening(p);
                  }}
                >
                  <option value="">— pilih rekening —</option>
                  {pilihan.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.rek ?? p.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <p className="hint">
              {pilihan.length > 1
                ? "Belum dipilih — atau lanjut ketik kalau ini rekening baru."
                : !rekLengkap
                  ? "Ketik nomor atau nama yang pernah dipakai, sisanya terisi sendiri."
                  : rekTersimpan
                    ? "✓ Rekening ini sudah ada di daftar penerima."
                    : "Rekening baru — otomatis masuk daftar penerima saat pengajuan disimpan."}
            </p>
          </fieldset>
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
              muncul saat kamu input pengeluaran hariannya.
            </p>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="label" htmlFor="p-platform">
              Category
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
              <option value="">— pilih category —</option>
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
              value={multi ? "" : brandId}
              disabled={multi}
              onChange={(e) => setBrandId(e.target.value)}
            >
              <option value="">{multi ? "— dibagi beberapa brand —" : "— tanpa brand —"}</option>
              {brand.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.label}
                </option>
              ))}
            </select>
            <label className="mt-1.5 flex cursor-pointer items-center gap-1.5 text-xs">
              <input
                type="checkbox"
                checked={multi}
                onChange={(e) => setMulti(e.target.checked)}
              />
              Bagi ke beberapa brand
            </label>
          </div>
        </div>

        {/* Mode dikirim sebagai kolom sendiri, bukan disimpulkan dari ada-tidaknya
            baris porsi: pembagian yang dimatikan harus benar-benar terhapus di
            server, bukan tertinggal karena kolomnya kebetulan tidak terkirim. */}
        <input type="hidden" name="brand_mode" value={multi ? "multi" : "tunggal"} />

        {multi && (
          <fieldset className="rounded-lg border border-[var(--hairline)] p-3">
            <legend className="label px-1">Pembagian per brand</legend>

            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-[var(--text-muted)]">
                  <th className="pb-1 font-medium">Brand</th>
                  <th className="pb-1 font-medium">Porsi</th>
                  <th className="pb-1" />
                </tr>
              </thead>
              <tbody>
                {porsi.map((p, i) => {
                  const n = p.nominal.trim() === "" ? null : parseRupiah(p.nominal);
                  return (
                    <tr key={p.key}>
                      <td className="py-1 pr-2">
                        <select
                          name="porsi_brand"
                          className="field py-1.5 text-xs"
                          value={p.brandId}
                          aria-label={`Brand baris ${i + 1}`}
                          onChange={(e) =>
                            setPorsi((rs) =>
                              rs.map((r) =>
                                r.key === p.key ? { ...r, brandId: e.target.value } : r,
                              ),
                            )
                          }
                        >
                          <option value="">— pilih brand —</option>
                          {brand.map((b) => (
                            <option key={b.id} value={b.id}>
                              {b.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-1 pr-2">
                        <input
                          name="porsi_nominal"
                          type="text"
                          inputMode="numeric"
                          autoComplete="off"
                          className="field tnum py-1.5 text-xs"
                          placeholder="0"
                          value={p.nominal}
                          aria-label={`Porsi baris ${i + 1}`}
                          onChange={(e) =>
                            setPorsi((rs) =>
                              rs.map((r) =>
                                r.key === p.key ? { ...r, nominal: e.target.value } : r,
                              ),
                            )
                          }
                        />
                        {p.nominal.trim() !== "" && (
                          <span
                            className="tnum mt-0.5 block text-[11px]"
                            style={{
                              color:
                                n === null
                                  ? "var(--status-critical)"
                                  : "var(--text-muted)",
                            }}
                          >
                            {n === null ? "tidak terbaca" : fmtIdr(n)}
                          </span>
                        )}
                      </td>
                      <td className="py-1 text-right">
                        <button
                          type="button"
                          className="btn btn-ghost px-2 py-1 text-xs"
                          aria-label={`Buang baris ${i + 1}`}
                          onClick={() =>
                            setPorsi((rs) =>
                              rs.length > 2 ? rs.filter((r) => r.key !== p.key) : rs,
                            )
                          }
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-[var(--hairline)] pt-2">
              <button
                type="button"
                className="btn btn-ghost px-2.5 py-1 text-xs"
                onClick={() => setPorsi((rs) => [...rs, barisBaru()])}
              >
                + Tambah brand
              </button>
              <button
                type="button"
                className="btn btn-ghost px-2.5 py-1 text-xs"
                disabled={nominalAngka <= 0}
                onClick={() => {
                  // Bagi rata memakai pembagi yang sama dengan server, jadi
                  // sisanya jatuh ke baris yang sama pula.
                  const rata = bagiRata(nominalAngka, porsi.length);
                  setPorsi((rs) =>
                    rs.map((r, i) => ({ ...r, nominal: String(rata[i] ?? 0) })),
                  );
                }}
              >
                Bagi rata
              </button>

              <span className="ml-auto text-xs">
                <span className="text-[var(--text-muted)]">Jumlah porsi </span>
                <span className="tnum font-medium">{fmtIdr(jumlahPorsi)}</span>
                {nominalAngka > 0 && (
                  <span
                    className="tnum ml-2"
                    style={{
                      color:
                        selisih === 0
                          ? "var(--success-text)"
                          : "var(--status-critical)",
                    }}
                  >
                    {selisih === 0
                      ? "pas"
                      : `${selisih > 0 ? "lebih" : "kurang"} ${fmtIdr(Math.abs(selisih))}`}
                  </span>
                )}
              </span>
            </div>

            <p className="hint">
              Porsinya diisi dalam rupiah, bukan persen — persen tidak pernah
              berjumlah pas, dan pecahannya muncul lagi sebagai selisih di laporan.
              Saat dana cair, tiap brand jadi satu baris buku besar sendiri.
            </p>
          </fieldset>
        )}

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
          {/* Pembagian yang belum pas ditahan di sini juga, bukan hanya di server:
              tombol yang bisa ditekan lalu ditolak membuat orang menebak-nebak
              apa yang salah. Servernya tetap memeriksa ulang. */}
          <FormButton
            pendingLabel="Menyimpan…"
            disabled={multi && (selisih !== 0 || porsiTerisi < 2)}
          >
            {multi && porsiTerisi < 2
              ? "Pilih minimal dua brand"
              : multi && selisih !== 0
                ? `Porsi ${selisih > 0 ? "lebih" : "kurang"} ${fmtIdr(Math.abs(selisih))}`
                : editing
                  ? "Simpan perubahan"
                  : "Simpan pengajuan"}
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
