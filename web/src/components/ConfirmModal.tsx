import { useEffect, useRef } from "preact/hooks";

interface Props {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/** A small yes/no popup. Escape or a click outside cancels; focus starts on Cancel. */
export function ConfirmModal({ title, message, confirmLabel, onConfirm, onCancel }: Props) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div class="overlay" onClick={(e) => e.target === e.currentTarget && onCancel()}>
      <div class="modal confirm" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title">
        <h2 id="confirm-title">{title}</h2>
        <p>{message}</p>
        <div class="actions">
          <button ref={cancelRef} class="btn" onClick={onCancel}>
            Cancel
          </button>
          <button class="btn primary" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
