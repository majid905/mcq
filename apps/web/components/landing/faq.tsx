'use client';

import { cn } from '@mcq/ui';
import { Plus } from 'lucide-react';
import { useId, useState } from 'react';
import { PAD_Y } from './layout';

/** Single-open accordion (#faq). The first item starts open, as in the design. */
export function Faq({ title, items }: { title: string; items: { q: string; a: string }[] }) {
  const [open, setOpen] = useState(0);
  const base = useId();
  return (
    <section
      id="faq"
      className={cn(PAD_Y, 'mx-auto max-w-[920px] scroll-mt-20 px-[clamp(16px,4vw,56px)]')}
    >
      <h2 className="mb-[clamp(20px,3vw,32px)] font-display text-[length:clamp(30px,3.6vw,50px)] leading-[1.3] font-semibold">
        {title}
      </h2>
      <div className="border-t border-border">
        {items.map((item, i) => {
          const isOpen = open === i;
          const panel = `${base}-panel-${i}`;
          const button = `${base}-button-${i}`;
          return (
            <div key={item.q} className="border-b border-border">
              <h3>
                <button
                  id={button}
                  type="button"
                  aria-expanded={isOpen}
                  aria-controls={panel}
                  onClick={() => setOpen(isOpen ? -1 : i)}
                  className="flex min-h-16 w-full items-center gap-4 border-0 bg-transparent py-3.5 text-left text-[18px] leading-[1.5] font-semibold"
                >
                  <span className="flex-1">{item.q}</span>
                  <span
                    aria-hidden
                    className={cn(
                      'grid size-8 flex-none place-items-center rounded-pill bg-surface-muted transition-transform duration-[250ms] ease-in-out',
                      isOpen ? 'rotate-45' : 'rotate-0',
                    )}
                  >
                    <Plus size={18} strokeWidth={2.2} />
                  </span>
                </button>
              </h3>
              <div
                id={panel}
                role="region"
                aria-labelledby={button}
                className={cn(
                  'grid transition-[grid-template-rows] duration-300 ease-in-out',
                  isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
                )}
              >
                <div className="min-h-0 overflow-hidden" inert={!isOpen}>
                  <p className="pr-12 pb-5 text-pretty text-text-muted">{item.a}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
