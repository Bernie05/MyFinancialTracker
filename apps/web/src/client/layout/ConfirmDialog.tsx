import { Button } from "@mft/ui";
import { useState, type ReactNode } from "react";
import { Dialog } from "./Dialog";

interface ConfirmDialogProps {
  open: boolean;
  /** Names the thing: "Delete “Dining out”?" */
  title: string;
  /** One short line on what happens. */
  message: ReactNode;
  /** Extra controls (e.g. where to move transactions). */
  children?: ReactNode;
  confirmLabel?: string;
  /** Disable the confirm button (e.g. nothing to move to yet). */
  confirmDisabled?: boolean;
  /** Throw to keep the dialog open and show the error inside it. */
  onConfirm: () => Promise<void>;
  onClose: () => void;
}

/**
 * Every delete goes through this. Cancel has focus first, so Enter never deletes by accident;
 * Escape cancels; the native dialog returns focus to the button that opened it.
 */
export function ConfirmDialog({ open, title, message, children, confirmLabel = "Delete", confirmDisabled, onConfirm, onClose }: ConfirmDialogProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function close() {
    if (busy) return;
    setError(null);
    onClose();
  }

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
      setBusy(false);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't do that. Try again.");
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onClose={close} title={title}>
      <div className="confirm">
        <p className="confirm__message">{message}</p>
        {children}
        {error && (
          <p className="cat-editor__error" role="alert">
            {error}
          </p>
        )}
        <div className="dialog__actions">
          <Button type="button" variant="secondary" onClick={close} disabled={busy} data-autofocus>
            Cancel
          </Button>
          <Button type="button" variant="danger" onClick={confirm} loading={busy} disabled={confirmDisabled}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
