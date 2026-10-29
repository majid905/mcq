'use client';

import { cn } from '@mcq/ui';
import { Plus } from 'lucide-react';
import { useId, useState } from 'react';

/** Single-open accordion (#faq). The first item starts open, as in the design. */
export function Faq({ title, items }: { title: string; items: { q: string; a: string }[] }) {
  const [open, setOpen] = useState(0);
  const base = useId();
  return (
    <section
      id="faq"
      className="mx-auto max-w-230 scroll-mt-20 px-4 pt-14 md:px-8 md:pt-20 lg:pt-28 xl:px-14"
    >
      <h2 className="mb-5 font-display text-section-title-sm font-semibold text-text md:mb-8 md:text-section-title">
        {title}
      </h2>
      <div className="border-t border-border">
        {items.map((item, i) => {
          const isOpen = open === i;
          const panel = `${base}-panel-${i}`;
          return (
            <div key={item.q} className="border-b border-border">
              <h3>
                <button
                  type="button"
                  aria-expanded={isOpen}
                  aria-controls={panel}
                  onClick={() => setOpen(isOpen ? -1 : i)}
                  className="flex min-h-16 w-full items-center gap-4 py-3.5 text-left text-h3 font-semibold text-text"
                >
                  <span className="flex-1">{item.q}</span>
                  <span
                    aria-hidden
                    className={cn(
                      'grid size-8 flex-none place-items-center rounded-pill bg-surface-muted transition-transform duration-(--mcq-duration-base) ease-standard',
                      isOpen && 'rotate-45',
                    )}
                  >
                    <Plus size={18} strokeWidth={2.2} />
                  </span>
                </button>
              </h3>
              <div
                id={panel}
                role="region"
                className={cn(
                  'grid transition-[grid-template-rows] duration-(--mcq-duration-slow) ease-standard',
                  isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
                )}
              >
                <div className="min-h-0 overflow-hidden" inert={!isOpen}>
                  <p className="pr-12 pb-5 text-body text-pretty text-text-muted">{item.a}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
