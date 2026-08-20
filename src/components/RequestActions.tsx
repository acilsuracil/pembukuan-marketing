"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import { cancelRequest, decideRequest, type ActionState } from "@/app/actions";
import { Alert, FormButton } from "./ui";

const EMPTY: ActionState = { ok: false };

/**
 * Setujui / tolak dikirim lewat name+value tombolnya sendiri, jadi tidak perlu
 * state tambahan dan catatan keputusan tetap satu field untuk keduanya.
 */
function DecideButton({
  decision,
  label,
  className,
  confirm,
}: {
  decision: "approve" | "reject";
  label: string;
  className: string;
  confirm: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      name="decision"
      value={decision}
      disabled={pending}
      className={className}
      onClick={(e) => {
        if (!window.confirm(confirm)) e.preventDefault();
      }}
    >
      {pending ? "Memproses…" : label}
    </button>
  );
}

export function DecideRequest({ id }: { id: number }) {
  const router = useRouter();
  const [state, action] = useActionState(decideRequest, EMPTY);

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state.ok, router]);

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="id" value={id} />
      <Alert state={state} />
      <input
        name="note"
        type="text"
        className="field py-1.5 text-xs"
        placeholder="Catatan keputusan (opsional)"
      />
      <div className="flex gap-2">
        <DecideButton
          decision="approve"
          label="Setujui"
          className="btn btn-primary text-xs"
          confirm="Setujui pengajuan ini? Perubahannya langsung diterapkan ke data."
        />
        <DecideButton
          decision="reject"
          label="Tolak"
          className="btn btn-danger text-xs"
          confirm="Tolak pengajuan ini?"
        />
      </div>
    </form>
  );
}

export function CancelRequest({ id }: { id: number }) {
  const router = useRouter();
  const [state, action] = useActionState(cancelRequest, EMPTY);

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state.ok, router]);

  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <FormButton className="btn btn-ghost text-xs" confirm="Batalkan pengajuan ini?">
        Batalkan
      </FormButton>
      {state.error && <Alert state={state} className="mt-2" />}
    </form>
  );
}
