import { useEffect, useId, useRef, type ReactNode } from "react";
import { CloseIcon } from "./icons";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

/**
 * Native <dialog> as a modal: the browser traps focus, makes the page inert, closes on Escape
 * and returns focus to whatever opened it.
 */
export function Dialog({ open, onClose, title, children }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      // React's autoFocus runs before showModal, so the dialog would pick its close button; start in the form instead.
      dialog.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault(); // let React state close it, so open and the DOM never disagree
        onClose();
      }}
    >
      {open && (
        <>
          <header className="dialog__header">
            <h2 id={titleId} className="dialog__title">
              {title}
            </h2>
            <button type="button" className="icon-button" aria-label="Close" onClick={onClose}>
              <CloseIcon />
            </button>
          </header>
          {children}
        </>
      )}
    </dialog>
  );
}
