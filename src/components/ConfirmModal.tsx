import React from 'react';

interface ConfirmModalProps {
  isOpen: boolean;
  title?: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isDestructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({
  isOpen,
  title = 'Confirmar ação',
  message = 'Tem certeza que deseja continuar?',
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  isDestructive = true,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onCancel}>
      <div
        className="bg-[#141d1a] border border-white/10 rounded-2xl w-full max-w-[420px] p-7 text-center shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className={`w-12 h-12 rounded-full mx-auto mb-4 flex items-center justify-center text-xl ${
            isDestructive ? 'bg-red-500/15 text-red-500' : 'bg-blue-500/15 text-blue-500'
          }`}
        >
          <i className={`fa-solid ${isDestructive ? 'fa-triangle-exclamation' : 'fa-circle-question'}`} />
        </div>

        <h3 className="text-xl font-bold text-white mb-2">{title}</h3>
        <p className="text-[#94a3b8] text-sm mb-6 leading-relaxed">
          {message}
        </p>

        <div className="flex justify-center gap-3">
          <button
            type="button"
            className="px-5 py-2 rounded-xl text-[#94a3b8] border border-white/10 hover:text-white hover:border-white/30 transition-colors"
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`px-5 py-2 rounded-xl font-semibold text-white transition-all hover:scale-105 ${
              isDestructive ? 'bg-red-600 hover:bg-red-500 shadow-lg shadow-red-600/20' : 'bg-blue-600 hover:bg-blue-500 shadow-lg shadow-blue-600/20'
            }`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmModal;
