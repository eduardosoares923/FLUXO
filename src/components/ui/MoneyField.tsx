import React from 'react';

function formatCentsToBRL(cents: number): string {
  const abs = Math.max(0, Math.round(cents));
  const reais = (abs / 100).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `R$ ${reais}`;
}

function parseToCents(val: string | number | undefined | null): number {
  if (val === undefined || val === null || val === '') return 0;
  if (typeof val === 'number') {
    return Number.isFinite(val) ? Math.round(val * 100) : 0;
  }
  const str = String(val).trim();
  if (/^-?\d+(\.\d+)?$/.test(str)) {
    return Math.round( parseFloat(str) * 100 );
  }
  const digits = str.replace(/\D/g, '');
  return digits ? parseInt(digits, 10) : 0;
}

export interface MoneyFieldProps {
  value?: string | number;
  onChange?: (e: { target: { value: string; valueAsNumber: number } }) => void;
  onValueChange?: (num: number) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
}

export function MoneyField({
  value,
  onChange,
  onValueChange,
  placeholder = 'R$ 0,00',
  disabled = false,
  className = '',
  ariaLabel,
}: MoneyFieldProps) {
  const cents = parseToCents(value);
  const displayValue = value === '' || value === undefined || value === null ? '' : formatCentsToBRL(cents);

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const rawDigits = e.target.value.replace(/\D/g, '');
    if (!rawDigits) {
      onChange?.({ target: { value: '', valueAsNumber: 0 } });
      onValueChange?.(0);
      return;
    }
    const nextCents = parseInt(rawDigits, 10);
    const numValue = nextCents / 100;
    const strValue = numValue.toFixed(2);
    onChange?.({ target: { value: strValue, valueAsNumber: numValue } });
    onValueChange?.(numValue);
  }

  return (
    <input
      type="text"
      inputMode="decimal"
      disabled={disabled}
      placeholder={placeholder}
      aria-label={ariaLabel || placeholder}
      value={displayValue}
      onChange={handleInputChange}
      className={`w-full min-h-[44px] px-4 py-2.5 rounded-[18px] border border-border bg-card text-ink font-medium outline-none focus:border-pri transition-colors disabled:opacity-50 ${className}`}
    />
  );
}

export default MoneyField;
