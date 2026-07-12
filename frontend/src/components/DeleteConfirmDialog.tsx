import { useState } from 'react';

interface DeleteConfirmDialogProps {
  message: string;
  dontShowLabel: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: (dontShowAgain: boolean) => void;
  onCancel: () => void;
}

const DeleteConfirmDialog = ({
  message,
  dontShowLabel,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}: DeleteConfirmDialogProps) => {
  const [dontShowAgain, setDontShowAgain] = useState(false);

  return (
    <div className="delete-confirm-backdrop" onClick={onCancel}>
      <div className="delete-confirm-modal glass-card" onClick={(e) => e.stopPropagation()}>
        <p className="delete-confirm-message">{message}</p>
        <label className="delete-confirm-checkbox-row">
          <input
            type="checkbox"
            checked={dontShowAgain}
            onChange={(e) => setDontShowAgain(e.target.checked)}
          />
          <span>{dontShowLabel}</span>
        </label>
        <div className="delete-confirm-actions">
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button type="button" className="btn btn-primary" onClick={() => onConfirm(dontShowAgain)}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default DeleteConfirmDialog;
