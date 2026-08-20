"use client";

import { useState } from "react";
import { SLOT_HEX_LIGHT, SLOT_NAMES } from "@/lib/palette";

/**
 * Pemilih slot warna penanda. Warna tidak pernah berdiri sendiri — nama
 * divisi/platform/brand selalu ikut ditulis di grafik dan tabel, jadi ini
 * sekadar bantuan memindai, bukan satu-satunya pembeda.
 */
export default function ColorPicker({ value = 1 }: { value?: number }) {
  const [slot, setSlot] = useState(value);
  return (
    <fieldset>
      <legend className="label">Warna penanda</legend>
      <input type="hidden" name="color_slot" value={slot} />
      <div className="flex flex-wrap gap-1.5">
        {SLOT_HEX_LIGHT.map((_hex, i) => {
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
    </fieldset>
  );
}
