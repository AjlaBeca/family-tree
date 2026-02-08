import React from "react";

const ConfirmDialog = ({
  isOpen,
  title,
  message,
  confirmLabel = "Potvrdi",
  cancelLabel = "Otka\u017ei",
  onConfirm,
  onCancel,
  isDanger = true,
}) => {
  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" role="presentation" onClick={onCancel}>
      <div
        className="modal confirm-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title || "Potvrda"}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h3>{title || "Potvrda"}</h3>
        </div>
        <div className="modal-body">
          <p className="muted-text">{message || "Jeste li sigurni?"}</p>
        </div>
        <div className="modal-footer confirm-modal-footer">
          <div className="modal-actions">
            <button type="button" className="btn-ghost" onClick={onCancel}>
              {cancelLabel}
            </button>
            <button type="button" className={isDanger ? "btn-danger" : "btn-primary"} onClick={onConfirm}>
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;

