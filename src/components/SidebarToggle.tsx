"use client";

/**
 * Membuka/menutup sidebar dengan menulis atribut di <html> dan localStorage.
 * Tidak memakai state React sama sekali — lebarnya diatur CSS, dan pilihan
 * tersimpan sudah dipasang oleh skrip boot sebelum halaman digambar.
 */
export default function SidebarToggle() {
  function toggle() {
    const root = document.documentElement;
    const next = root.dataset.sidebar === "collapsed" ? "expanded" : "collapsed";
    if (next === "collapsed") root.dataset.sidebar = "collapsed";
    else delete root.dataset.sidebar;
    try {
      localStorage.setItem("ledger-sidebar", next);
    } catch {
      // storage diblokir — tetap berlaku untuk sesi ini
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      title="Buka / tutup menu"
      aria-label="Buka atau tutup menu samping"
      className="flex h-7 w-7 items-center justify-center rounded-md border border-[var(--hairline)] text-[var(--text-muted)] transition hover:bg-[var(--wash)] hover:text-[var(--text-primary)]"
    >
      <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden fill="none">
        <rect
          x="1.5"
          y="2.5"
          width="13"
          height="11"
          rx="2"
          stroke="currentColor"
          strokeWidth="1.4"
        />
        <line
          x1="6.5"
          y1="2.5"
          x2="6.5"
          y2="13.5"
          stroke="currentColor"
          strokeWidth="1.4"
        />
      </svg>
    </button>
  );
}
