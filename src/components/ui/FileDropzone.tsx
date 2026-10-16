import React, { useRef, useState } from 'react';

export interface FileDropzoneProps {
  accept?: string;
  onFileSelect: (file: File) => void;
  label?: string;
  hint?: string;
  buttonLabel?: string;
  selectedFileName?: string;
  disabled?: boolean;
  className?: string;
}

export function FileDropzone({
  accept = '.csv,.txt,.ofx',
  onFileSelect,
  label = 'Solte o extrato aqui',
  hint,
  buttonLabel = 'Escolher arquivo',
  selectedFileName,
  disabled = false,
  className = '',
}: FileDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    if (!disabled) setDragging(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    if (disabled) return;
    const file = e.dataTransfer.files?.[0];
    if (file) onFileSelect(file);
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      onFileSelect(file);
      e.target.value = '';
    }
  }

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => !disabled && inputRef.current?.click()}
      role="button"
      tabIndex={disabled ? -1 : 0}
      onKeyDown={(e) => {
        if (!disabled && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          inputRef.current?.click();
        }
      }}
      className={`border-2 border-dashed rounded-[24px] p-6 text-center transition-colors cursor-pointer flex flex-col items-center justify-center gap-3 ${
        dragging
          ? 'border-pri bg-priSoft/40'
          : 'border-border bg-card hover:border-pri/50'
      } ${disabled ? 'opacity-50 pointer-events-none' : ''} ${className}`}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={handleChange}
        className="sr-only hidden"
        tabIndex={-1}
      />

      <div className="w-12 h-12 rounded-full bg-priSoft text-priInk flex items-center justify-center">
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" x2="12" y1="3" y2="15" />
        </svg>
      </div>

      <div>
        <div className="font-bold text-sm text-ink">
          {selectedFileName ? selectedFileName : label}
        </div>
        {hint && <div className="text-xs text-muted mt-0.5">{hint}</div>}
      </div>

      <button
        type="button"
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          inputRef.current?.click();
        }}
        className="px-4 min-h-[44px] rounded-[18px] bg-priSoft text-priInk font-bold text-xs hover:opacity-90 transition-opacity"
      >
        {buttonLabel}
      </button>
    </div>
  );
}

export default FileDropzone;
