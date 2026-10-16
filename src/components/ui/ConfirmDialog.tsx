import React from 'react';
import * as Dialog from '@radix-ui/react-dialog';

export interface ConfirmDialogProps {
  isOpen: boolean;
  title?: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isDestructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  isOpen,
  title = 'Confirmar ação',
  message = 'Tem certeza que deseja continuar?',
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  isDestructive = true,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Dialog.Root
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[9998] bg-black/60 backdrop-blur-sm animate-in fade-in duration-150" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[9999] w-[calc(100vw-32px)] max-w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-[26px] bg-card border border-border p-6 text-center shadow-2xl focus:outline-none">
          <div
            className={`w-12 h-12 rounded-full mx-auto mb-4 flex items-center justify-center ${
              isDestructive ? 'bg-spendSoft text-spend' : 'bg-priSoft text-priInk'
            }`}
          >
            {isDestructive ? (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
                <path d="M12 9v4" />
                <path d="M12 17h.01" />
              </svg>
            ) : (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                <path d="M12 17h.01" />
              </svg>
            )}
          </div>

          <Dialog.Title className="font-display text-xl font-bold text-ink mb-2">
            {title}
          </Dialog.Title>
          <Dialog.Description className="text-muted text-sm mb-6 leading-relaxed">
            {message}
          </Dialog.Description>

          <div className="flex justify-center gap-3">
            <button
              type="button"
              onClick={onCancel}
              className="px-5 min-h-[44px] rounded-[18px] bg-neutral text-ink border border-border font-bold text-sm hover:opacity-90 transition-opacity"
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              onClick={onConfirm}
              className={`px-5 min-h-[44px] rounded-[18px] font-bold text-sm transition-opacity hover:opacity-95 ${
                isDestructive ? 'bg-spend text-white' : 'bg-fab text-fabIcon'
              }`}
            >
              {confirmLabel}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export default ConfirmDialog;
