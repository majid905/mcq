'use client';

import { Menu, X } from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';

/** Below 1024 px the header nav collapses into this drop-down panel. */
export function MobileMenu({
  openLabel,
  closeLabel,
  navLabel,
  children,
}: {
  openLabel: string;
  closeLabel: string;
  navLabel: string;
  /** Links and controls; any click inside closes the panel. */
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const Icon = open ? X : Menu;
  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        aria-controls="mobile-menu"
        aria-label={open ? closeLabel : openLabel}
        onClick={() => setOpen((v) => !v)}
        className="grid size-11 place-items-center rounded-md border border-border-strong bg-surface text-text lg:hidden"
      >
        <Icon aria-hidden size={22} strokeWidth={1.75} />
      </button>
      {open && (
        <nav
          id="mobile-menu"
          aria-label={navLabel}
          onClick={(e) => {
            if ((e.target as HTMLElement).closest('a')) setOpen(false);
          }}
          className="absolute inset-x-0 top-full border-t border-border bg-surface px-4 pt-2 pb-4 shadow-lg lg:hidden"
        >
          {children}
        </nav>
      )}
    </>
  );
}
