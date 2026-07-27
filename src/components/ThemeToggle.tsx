"use client";

/**
 * Label mana yang tampil ditentukan CSS (lihat globals.css), bukan state React —
 * jadi tidak ada setState di effect dan tidak ada mismatch saat hydration.
 */
export default function ThemeToggle() {
  function toggle() {
    const root = document.documentElement;
    const current =
      root.dataset.theme ??
      (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    const next = current === "dark" ? "light" : "dark";
    root.dataset.theme = next;
    try {
      localStorage.setItem("ledger-theme", next);
    } catch {
      // mode privat / storage diblokir — tema tetap berganti untuk sesi ini
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="btn btn-ghost w-full justify-start text-xs"
      aria-label="Ganti tema terang/gelap"
    >
      <span className="theme-light-only">☾ Mode gelap</span>
      <span className="theme-dark-only">☀ Mode terang</span>
    </button>
  );
}
