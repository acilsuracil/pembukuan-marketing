export default function StatTile({
  label,
  value,
  sub,
  hero = false,
}: {
  label: string;
  value: string;
  sub?: string;
  hero?: boolean;
}) {
  return (
    // `@container` membuat ukuran angka hero mengacu ke lebar kartunya sendiri,
    // bukan ke lebar layar. Kartu yang sama dipakai di grid 1, 2, dan 4 kolom;
    // ukuran mati bikin nominal panjang seperti "Rp 20.500.000" patah dua baris
    // begitu kartunya menyempit jadi seperempat lebar.
    <div className="card @container p-4">
      <div className="text-xs text-[var(--text-secondary)]">{label}</div>
      <div
        className={`mt-1 font-semibold tracking-tight ${
          hero
            ? "text-[clamp(1.5rem,10cqi,2.625rem)] leading-[1.15]"
            : "text-xl"
        }`}
      >
        {value}
      </div>
      {sub && <div className="mt-1 text-xs text-[var(--text-muted)]">{sub}</div>}
    </div>
  );
}
