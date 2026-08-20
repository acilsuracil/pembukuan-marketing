"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
import { saveBrand, type ActionState } from "@/app/actions";
import { SLOT_HEX_LIGHT, SLOT_NAMES } from "@/lib/palette";
import type { Brand } from "@/lib/types";
import { Alert, blurOnWheel, FormButton } from "./ui";

const EMPTY: ActionState = { ok: false };

export default function BrandForm({ initial }: { initial?: Brand }) {
  const router = useRouter();
  const editing = Boolean(initial);
  const [state, action] = useActionState(saveBrand, EMPTY);
  const [slot, setSlot] = useState(initial?.color_slot ?? 1);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!state.ok) return;
    // Selesai mengubah → kembali ke daftar. Selesai menambah → kosongkan form
    // supaya brand berikutnya bisa langsung diketik, bukan menabrak nama lama.
    if (editing) router.push("/brand");
    else {
      formRef.current?.reset();
      router.refresh();
    }
  }, [state.ok, editing, router]);

  return (
    <form ref={formRef} action={action} className="space-y-4">
      {editing && <input type="hidden" name="id" value={initial!.id} />}

      <h2 className="text-sm font-semibold">
        {editing ? `Ubah "${initial!.name}"` : "Tambah brand"}
      </h2>

      <Alert state={state} />

      <div>
        <label className="label" htmlFor="b-name">
          Nama brand
        </label>
        <input
          id="b-name"
          name="name"
          type="text"
          required
          minLength={2}
          className="field"
          placeholder="mis. Kopi Kenangan"
          defaultValue={initial?.name ?? ""}
        />
      </div>

      <div>
        <label className="label" htmlFor="b-pic">
          PIC / penanggung jawab{" "}
          <span className="font-normal text-[var(--text-muted)]">— opsional</span>
        </label>
        <input
          id="b-pic"
          name="pic"
          type="text"
          className="field"
          defaultValue={initial?.pic ?? ""}
        />
      </div>

      <fieldset>
        <legend className="label">Warna penanda</legend>
        <input type="hidden" name="color_slot" value={slot} />
        <div className="flex flex-wrap gap-1.5">
          {SLOT_HEX_LIGHT.map((_, i) => {
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
          Dipakai sebagai penanda di grafik dan tabel — nama brand selalu ikut
          ditulis, jadi warna tidak berdiri sendiri.
        </p>
      </fieldset>

      <div>
        <label className="label" htmlFor="b-budget">
          Budget per bulan (USDT){" "}
          <span className="font-normal text-[var(--text-muted)]">
            — 0 = tanpa budget
          </span>
        </label>
        <input
          id="b-budget"
          name="budget_usdt"
          type="number"
          onWheel={blurOnWheel}
          step="0.01"
          min="0"
          className="field tnum"
          placeholder="0"
          defaultValue={initial?.budget_usdt ? String(initial.budget_usdt) : ""}
        />
        <p className="hint">Batas pemakaian USDT brand ini per bulan.</p>
      </div>

      <div>
        <label className="label" htmlFor="b-note">
          Catatan{" "}
          <span className="font-normal text-[var(--text-muted)]">— opsional</span>
        </label>
        <input
          id="b-note"
          name="note"
          type="text"
          className="field"
          defaultValue={initial?.note ?? ""}
        />
      </div>

      <div className="flex gap-2">
        <FormButton pendingLabel="Menyimpan…">
          {editing ? "Simpan perubahan" : "Tambah brand"}
        </FormButton>
        {editing && (
          <Link href="/brand" className="btn btn-ghost">
            Batal
          </Link>
        )}
      </div>
    </form>
  );
}
