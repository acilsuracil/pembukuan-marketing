import ThemeToggle from "@/components/ThemeToggle";

export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <div className="mb-6 flex items-center gap-2">
        <span
          aria-hidden
          className="grid h-9 w-9 place-items-center rounded-lg bg-[var(--series-1)] text-[13px] font-bold text-white"
        >
          Rp
        </span>
        <span className="text-base font-semibold tracking-tight">
          Pembukuan Marketing
        </span>
      </div>

      <div className="card w-full max-w-sm p-6">{children}</div>

      <div className="mt-6 w-40">
        <ThemeToggle />
      </div>
    </div>
  );
}
