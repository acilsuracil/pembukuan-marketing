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
    <div className="card p-4">
      <div className="text-xs text-[var(--text-secondary)]">{label}</div>
      <div
        className={`mt-1 font-semibold tracking-tight ${
          hero ? "text-[34px] leading-[1.1] sm:text-[42px]" : "text-xl"
        }`}
      >
        {value}
      </div>
      {sub && <div className="mt-1 text-xs text-[var(--text-muted)]">{sub}</div>}
    </div>
  );
}
