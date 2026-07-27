"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { saveCategory, type ActionState } from "@/app/actions";
import { SLOT_HEX_LIGHT, SLOT_NAMES } from "@/lib/palette";
import type { Category } from "@/lib/types";

const EMPTY: ActionState = { ok: false };

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary" disabled={pending}>
      {pending ? "Menyimpan…" : label}
    </button>
  );
}

export default function CategoryForm({ initial }: { initial?: Category }) {
  const router = useRouter();
  const editing = Boolean(initial);
  const [state, formAction] = useActionState(saveCategory, EMPTY);
  const [kind, setKind] = useState<"in" | "out">(initial?.kind ?? "out");
  const [slot, setSlot] = useState(initial?.color_slot ?? 1);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!state.ok) return;
    // Selesai mengubah → kembali ke daftar. Selesai menambah → kosongkan form.
    if (editing) router.push("/kategori");
    else {
      formRef.current?.reset();
      router.refresh();
    }
  }, [state.ok, editing, router]);

  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      {editing && <input type="hidden" name="id" value={initial!.id} />}

      <h2 className="text-sm font-semibold">
        {editing ? `Ubah "${initial!.name}"` : "Tambah kategori"}
      </h2>

      {state.error && (
        <p
          role="alert"
          className="rounded-lg px-3 py-2 text-xs"
          style={{
            color: "var(--status-critical)",
            background:
              "color-mix(in srgb, var(--status-critical) 10%, transparent)",
          }}
        >
          {state.error}
        </p>
      )}

      <div>
        <label className="label" htmlFor="c-name">
          Nama kategori
        </label>
        <input
          id="c-name"
          name="name"
          type="text"
          required
          minLength={2}
          className="field"
          placeholder="mis. Iklan Meta"
          defaultValue={initial?.name ?? ""}
        />
      </div>

      <fieldset>
        <legend className="label">Dipakai untuk</legend>
        <div className="flex gap-2">
          {(["out", "in"] as const).map((k) => (
            <label
              key={k}
              className="flex flex-1 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition"
              style={{
                borderColor:
                  kind === k
                    ? k === "in"
                      ? "var(--flow-in)"
                      : "var(--flow-out)"
                    : "var(--hairline)",
              }}
            >
              <input
                type="radio"
                name="kind"
                value={k}
                checked={kind === k}
                onChange={() => setKind(k)}
                className="sr-only"
              />
              <span aria-hidden>{k === "in" ? "↓" : "↑"}</span>
              {k === "in" ? "Uang masuk" : "Pengeluaran"}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="label">Warna penanda</legend>
        <input type="hidden" name="color_slot" value={slot} />
        <div className="flex flex-wrap gap-1.5">
          {SLOT_HEX_LIGHT.map((hex, i) => {
            const n = i + 1;
            return (
              <button
                key={n}
                type="button"
                onClick={() => setSlot(n)}
                aria-label={SLOT_NAMES[i]}
                aria-pressed={slot === n}
                title={SLOT_NAMES[i]}
                className="h-7 w-7 rounded-md transition"
                style={{
                  background: `var(--series-${n})`,
                  outline: slot === n ? "2px solid var(--text-primary)" : "none",
                  outlineOffset: 2,
                }}
              />
            );
          })}
        </div>
        <p className="hint">
          Warna ini dipakai di grafik dan daftar transaksi sebagai penanda —
          nama kategori selalu ikut ditulis, jadi warna tidak berdiri sendiri.
        </p>
      </fieldset>

      {kind === "out" && (
        <div>
          <label className="label" htmlFor="c-budget">
            Budget per bulan (USDT){" "}
            <span className="font-normal text-[var(--text-muted)]">
              — 0 = tanpa budget
            </span>
          </label>
          <input
            id="c-budget"
            name="budget_usdt"
            type="number"
            step="0.01"
            min="0"
            className="field tnum"
            placeholder="0"
            defaultValue={initial?.budget_usdt ? String(initial.budget_usdt) : ""}
          />
          <p className="hint">
            Realisasi bulan berjalan dibandingkan ke angka ini di dashboard.
          </p>
        </div>
      )}

      <div>
        <label className="label" htmlFor="c-note">
          Catatan{" "}
          <span className="font-normal text-[var(--text-muted)]">— opsional</span>
        </label>
        <input
          id="c-note"
          name="note"
          type="text"
          className="field"
          defaultValue={initial?.note ?? ""}
        />
      </div>

      <div className="flex gap-2">
        <Submit label={editing ? "Simpan perubahan" : "Tambah kategori"} />
        {editing && (
          <Link href="/kategori" className="btn btn-ghost">
            Batal
          </Link>
        )}
      </div>
    </form>
  );
}
