'use client';

import { AppButton } from '@mcq/ui';
import { useEffect, useRef } from 'react';

/** Native <dialog> (focus trap, Esc, backdrop for free). */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel,
  danger,
  loading,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby="confirm-title"
      className="m-auto w-[min(92vw,420px)] rounded-xl border border-border bg-surface p-6 text-text shadow-lg backdrop:bg-overlay"
    >
      <h2 id="confirm-title" className="text-h3 font-semibold">
        {title}
      </h2>
      <p className="mt-2 text-body text-text-muted">{body}</p>
      <div className="mt-6 flex gap-3">
        <AppButton variant="secondary" fullWidth onClick={onClose}>
          {cancelLabel}
        </AppButton>
        <AppButton
          variant={danger ? 'danger' : 'primary'}
          fullWidth
          loading={loading}
          onClick={onConfirm}
        >
          {confirmLabel}
        </AppButton>
      </div>
    </dialog>
  );
}
