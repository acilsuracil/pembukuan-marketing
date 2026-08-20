"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  BUKTI_ACCEPT,
  buktiMimeProblem,
  buktiProblem,
  buktiTotalProblem,
  EXT_BY_MIME,
  MAX_BUKTI_PER_TX,
} from "@/lib/bukti";
import { shrinkBukti } from "@/lib/shrink";

/**
 * Nama bawaan yang diberikan browser untuk gambar dari papan klip — tidak
 * membawa informasi apa pun, jadi diganti dengan cap waktu supaya bukti bisa
 * dibedakan di daftar lampiran.
 */
const GENERIC = /^(image|screenshot|untitled)?(\.\w+)?$/i;

function namedForPaste(f: File, i: number): File {
  if (f.name && !GENERIC.test(f.name)) return f;
  const t = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${pad(t.getHours())}.${pad(t.getMinutes())}.${pad(t.getSeconds())}`;
  const ext = EXT_BY_MIME[f.type] ?? ".png";
  // Urutan ikut ditulis: menempel beberapa gambar sekaligus jatuh pada detik
  // yang sama, dan nama kembar akan dianggap berkas rangkap lalu dibuang.
  const seq = i > 0 ? `-${i + 1}` : "";
  return new File([f], `tempel-${stamp}${seq}${ext}`, { type: f.type });
}

interface Picked {
  /** Yang benar-benar dikirim — sudah dikecilkan bila memungkinkan. */
  file: File;
  /**
   * Identitas berkas **aslinya**. Penyaring rangkap harus memakai ini, bukan
   * berkas hasil kompresi: mengecilkan mengubah nama dan ukurannya, jadi
   * membandingkan hasil kompresi dengan pilihan baru akan meloloskan gambar yang
   * sama untuk kedua kalinya.
   */
  srcKey: string;
}

const srcKeyOf = (f: File) => `${f.name}:${f.size}`;

/**
 * Pemilih bukti transfer: bisa dipilih dari berkas, diseret ke area, atau
 * ditempel langsung dari papan klip (Ctrl/Cmd+V) — jalur terakhir itu yang
 * dipakai orang setelah memotret layar, tanpa harus menyimpannya dulu.
 *
 * Berkas hasil tempel/seret disuntikkan ke `<input type="file">` sungguhan
 * lewat DataTransfer, jadi Server Action tetap menerima FormData yang sama
 * seperti kalau berkas dipilih lewat dialog biasa. Gambarnya dikecilkan lebih
 * dulu di sini (lihat `lib/shrink`) supaya body POST-nya tetap kecil.
 */
export default function BuktiInput({
  id,
  name = "bukti",
  taken = 0,
  onChange,
  onBusy,
}: {
  id: string;
  name?: string;
  /** Bukti yang sudah tersimpan di transaksi ini — memotong sisa kuota. */
  taken?: number;
  onChange?: (n: number) => void;
  /**
   * Sedang mengecilkan gambar. Pemanggil wajib mematikan tombol kirimnya selagi
   * ini benar: berkasnya belum masuk ke `<input>`, jadi formulir yang terkirim
   * di sela itu akan diam-diam berangkat tanpa bukti.
   */
  onBusy?: (busy: boolean) => void;
}) {
  const [picked, setPicked] = useState<Picked[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const room = MAX_BUKTI_PER_TX - taken;

  /**
   * Input berkas sungguhan tetap jadi satu-satunya sumber bagi FormData — state
   * React hanya mengemudikannya. Penyalinan dilakukan langsung, bukan lewat
   * efek yang mengintip perubahan `picked`: dialog berkas mengosongkan input
   * setiap kali dibuka, jadi daftar wajib ditulis ulang bahkan ketika state
   * tidak berubah (mis. pilihan ditolak) — kalau tidak, formulir diam-diam
   * terkirim tanpa berkas.
   */
  function syncInput(next: Picked[]) {
    const el = inputRef.current;
    if (!el) return;
    const dt = new DataTransfer();
    for (const p of next) dt.items.add(p.file);
    el.files = dt.files;
  }

  const previews = useMemo(
    () => picked.map((p) => ({ f: p.file, url: URL.createObjectURL(p.file) })),
    [picked],
  );
  useEffect(
    () => () => previews.forEach((p) => URL.revokeObjectURL(p.url)),
    [previews],
  );

  function mark(next: boolean) {
    setBusy(next);
    onBusy?.(next);
  }

  async function add(incoming: File[]) {
    if (incoming.length === 0) return reject(null);
    // Dua pilihan yang tumpang tindih akan sama-sama menulis ulang daftar dari
    // state yang sudah basi, dan yang belakangan menghapus yang duluan.
    if (busy)
      return reject("Masih mengecilkan gambar sebelumnya — coba lagi sebentar.");

    // Jenis berkas diperiksa lebih dulu, sebelum pekerjaan berat: mengecilkan
    // berkas yang jenisnya memang ditolak hanya membuat orang menunggu sia-sia.
    for (const f of incoming) {
      const problem = buktiMimeProblem(f);
      if (problem) return reject(problem);
      // Server membuang berkas kosong tanpa bersuara, jadi kalau lolos ke sana
      // unggahan akan dilaporkan berhasil padahal tidak ada yang tersimpan.
      if (f.size === 0) return reject(`"${f.name}" kosong (0 byte).`);
    }

    // Berkas yang sama persis (nama + ukuran) tidak digandakan — menempel dua
    // kali karena ragu tidak boleh berubah jadi dua lampiran identik.
    const seen = new Set(picked.map((p) => p.srcKey));
    const fresh = incoming.filter((f) => !seen.has(srcKeyOf(f)));
    if (fresh.length === 0) return reject(null);

    if (picked.length + fresh.length > room)
      return reject(
        `Maksimal ${MAX_BUKTI_PER_TX} bukti per transaksi` +
          (taken > 0 ? ` (sekarang sudah ${taken}).` : "."),
      );

    mark(true);
    let added: Picked[];
    try {
      added = await Promise.all(
        fresh.map(async (f) => ({
          file: await shrinkBukti(f),
          srcKey: srcKeyOf(f),
        })),
      );
    } finally {
      mark(false);
    }

    // Batas per berkas diuji pada hasil kompresinya — itu yang benar-benar
    // dikirim, dan itu juga yang nanti diperiksa server.
    for (const p of added) {
      const problem = buktiProblem(p.file);
      if (problem) return reject(problem);
    }

    const next = [...picked, ...added];
    const total = buktiTotalProblem(next.map((p) => p.file));
    if (total) return reject(total);

    commit(next);
  }

  function remove(i: number) {
    commit(picked.filter((_, n) => n !== i));
  }

  function commit(next: Picked[]) {
    setError(null);
    setPicked(next);
    syncInput(next);
    onChange?.(next.length);
  }

  /** Pilihan ditolak: state tidak berubah, tapi input tetap harus ditulis ulang. */
  function reject(message: string | null) {
    setError(message);
    syncInput(picked);
  }

  // Tempel ditangkap di tingkat dokumen supaya tidak menuntut orang mengklik
  // area unggah lebih dulu. Papan klip tanpa gambar dibiarkan lewat, jadi
  // menempel teks ke kolom lain tetap berjalan normal.
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const imgs = Array.from(e.clipboardData?.files ?? []).filter((f) =>
        f.type.startsWith("image/"),
      );
      if (imgs.length === 0) return;
      e.preventDefault();
      void add(imgs.map(namedForPaste));
    }
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  });

  const full = picked.length >= room;

  return (
    <div>
      <input
        ref={inputRef}
        id={id}
        name={name}
        type="file"
        accept={BUKTI_ACCEPT}
        multiple
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => void add(Array.from(e.target.files ?? []))}
      />

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          void add(Array.from(e.dataTransfer.files));
        }}
        className="rounded-lg border border-dashed px-3 py-3 text-center transition"
        style={{
          borderColor: over ? "var(--series-1)" : "var(--hairline)",
          background: over ? "var(--wash)" : "transparent",
        }}
      >
        <button
          type="button"
          disabled={full || busy}
          onClick={() => inputRef.current?.click()}
          className="btn btn-ghost text-xs"
        >
          {busy ? "Mengecilkan…" : "Pilih berkas"}
        </button>
        <p className="hint mt-1.5">
          {busy ? (
            <>Gambar sedang dikecilkan supaya unggahannya tidak gagal di tengah.</>
          ) : full ? (
            <>Kuota bukti transaksi ini sudah penuh.</>
          ) : (
            <>
              Atau tempel tangkapan layar dengan{" "}
              <kbd className="rounded border border-[var(--hairline)] px-1 py-px text-[10px]">
                Ctrl/⌘ + V
              </kbd>
              , atau seret berkas ke kotak ini.
            </>
          )}
        </p>
      </div>

      {previews.length > 0 && (
        <ul className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
          {previews.map((p, i) => (
            <li key={`${p.f.name}:${p.f.size}:${i}`} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.url}
                alt={p.f.name}
                className="aspect-[4/3] w-full rounded-md border border-[var(--hairline)] bg-[var(--wash)] object-cover"
              />
              <button
                type="button"
                onClick={() => remove(i)}
                aria-label={`Buang ${p.f.name}`}
                title={`Buang ${p.f.name}`}
                className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full border border-[var(--hairline)] bg-[var(--surface-1)] text-[11px] leading-none text-[var(--text-secondary)]"
              >
                ×
              </button>
              <span
                className="mt-0.5 block truncate text-[10px] text-[var(--text-muted)]"
                title={p.f.name}
              >
                {p.f.name}
              </span>
            </li>
          ))}
        </ul>
      )}

      {error && (
        <p role="alert" className="mt-1.5 text-[11px] text-[var(--status-critical)]">
          {error}
        </p>
      )}
    </div>
  );
}
