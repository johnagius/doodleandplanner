import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * Accessible modal dialog: focus-traps, closes on Escape / backdrop click, and
 * restores focus to the previously focused element on unmount. Renders nothing
 * when `open` is false.
 */
export function Modal({
  open,
  onClose,
  title,
  children,
  labelledBy = 'modal-title',
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  labelledBy?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    restoreRef.current = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    panel?.focus();

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !panel) return;
      const focusable = panel.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      restoreRef.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  // Portal to <body> so the overlay escapes any ancestor stacking context
  // (e.g. the room header), rather than being trapped behind sibling content.
  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div
        ref={panelRef}
        className="modal-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? labelledBy : undefined}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <div className="modal-head">
            <h2 id={labelledBy} className="modal-title">
              {title}
            </h2>
            <button
              type="button"
              className="btn btn-sm btn-ghost modal-close"
              onClick={onClose}
              aria-label="Close"
            >
              ✕
            </button>
          </div>
        )}
        {children}
      </div>
    </div>,
    document.body,
  );
}
