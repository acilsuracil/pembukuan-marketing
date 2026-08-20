"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef } from "react";
import {
  saveAkunIklan,
  saveBrand,
  saveDivisi,
  saveDompet,
  savePenerima,
  savePlatform,
  type ActionState,
} from "@/app/actions";
import ColorPicker from "./ColorPicker";
import MoneyField from "./MoneyField";
import { Alert, FormButton } from "./ui";

const EMPTY: ActionState = { ok: false };

/**
 * Satu formulir untuk seluruh data master.
 *
 * Bentuk kolomnya dikirim dari server sebagai daftar `Field`, bukan ditulis
 * ulang enam kali. Yang berbeda antar-master memang hanya daftar kolomnya;
 * penanganan galat, perilaku setelah simpan, dan pratinjau nominalnya sama —
 * dan enam salinan dari perilaku yang sama adalah enam tempat untuk berselisih.
 */
export type Field =
  | { kind: "text"; name: string; label: string; value?: string; required?: boolean; placeholder?: string; hint?: string; minLength?: number }
  | { kind: "money"; name: string; label: string; value?: number; hint?: string }
  | { kind: "date"; name: string; label: string; value?: string; required?: boolean; hint?: string }
  | {
      kind: "select";
      name: string;
      label: string;
      value?: string | number | null;
      required?: boolean;
      hint?: string;
      /** Teks pilihan kosong; tidak ada = kolom wajib pilih. */
      empty?: string;
      options: Array<{ value: string | number; label: string }>;
    }
  | { kind: "color"; value?: number };

const ACTIONS = {
  divisi: saveDivisi,
  platform: savePlatform,
  akun_iklan: saveAkunIklan,
  brand: saveBrand,
  penerima: savePenerima,
  dompet: saveDompet,
} as const;

export type MasterFormKind = keyof typeof ACTIONS;

export default function MasterForm({
  kind,
  fields,
  editingId,
  title,
  submitLabel,
  listHref,
}: {
  kind: MasterFormKind;
  fields: Field[];
  editingId?: number;
  title: string;
  submitLabel: string;
  listHref: string;
}) {
  const router = useRouter();
  const editing = editingId !== undefined;
  const [state, action] = useActionState(ACTIONS[kind], EMPTY);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!state.ok) return;
    // Selesai mengubah → kembali ke daftar. Selesai menambah → kosongkan form
    // supaya bisa langsung mengetik yang berikutnya.
    if (editing) router.push(listHref);
    else {
      formRef.current?.reset();
      router.refresh();
    }
  }, [state.ok, editing, listHref, router]);

  return (
    <form ref={formRef} action={action} className="space-y-3.5">
      {editing && <input type="hidden" name="id" value={editingId} />}

      <h2 className="text-sm font-semibold">{title}</h2>
      <Alert state={state} />

      {fields.map((f) => {
        if (f.kind === "color")
          return <ColorPicker key="color" value={f.value ?? 1} />;

        if (f.kind === "money")
          return (
            <MoneyField
              key={f.name}
              name={f.name}
              label={f.label}
              defaultValue={f.value ?? ""}
              hint={f.hint}
            />
          );

        const id = `f-${kind}-${f.name}`;

        if (f.kind === "select")
          return (
            <div key={f.name}>
              <label className="label" htmlFor={id}>
                {f.label}
              </label>
              <select
                id={id}
                name={f.name}
                className="field"
                required={f.required}
                defaultValue={f.value === null || f.value === undefined ? "" : String(f.value)}
              >
                {f.empty !== undefined && <option value="">{f.empty}</option>}
                {f.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              {f.hint && <p className="hint">{f.hint}</p>}
            </div>
          );

        return (
          <div key={f.name}>
            <label className="label" htmlFor={id}>
              {f.label}
            </label>
            <input
              id={id}
              name={f.name}
              type={f.kind === "date" ? "date" : "text"}
              className={f.kind === "date" ? "field tnum" : "field"}
              required={f.required}
              minLength={f.kind === "text" ? f.minLength : undefined}
              placeholder={f.kind === "text" ? f.placeholder : undefined}
              defaultValue={f.value ?? ""}
            />
            {f.hint && <p className="hint">{f.hint}</p>}
          </div>
        );
      })}

      <div className="flex gap-2 pt-1">
        <FormButton pendingLabel="Menyimpan…">{submitLabel}</FormButton>
        {editing && (
          <Link href={listHref} className="btn btn-ghost">
            Batal
          </Link>
        )}
      </div>
    </form>
  );
}
