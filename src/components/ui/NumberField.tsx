import React from 'react';

export interface NumberFieldProps {
  value?: string | number;
  onChange?: (e: { target: { value: string; valueAsNumber: number } }) => void;
  onValueChange?: (num: number) => void;
  min?: number;
  max?: number;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
}

export function NumberField({
  value,
  onChange,
  onValueChange,
  min,
  max,
  placeholder = '0',
  disabled = false,
  className = '',
  ariaLabel,
}: NumberFieldProps) {
  const strVal = value === undefined || value === null ? '' : String(value);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const digits = e.target.value.replace(/\D/g, '');
    if (!digits) {
      onChange?.({ target: { value: '', valueAsNumber: 0 } });
      onValueChange?.(0);
      return;
    }
    let num = parseInt(digits, 10);
    if (typeof max === 'number' && num > max) num = max;
    const nextStr = String(num);
    onChange?.({ target: { value: nextStr, valueAsNumber: num } });
    onValueChange?.(num);
  }

  function handleBlur() {
    if (!strVal) return;
    const num = parseInt(strVal, 10);
    if (Number.isNaN(num)) return;
    if (typeof min === 'number' && num < min) {
      onChange?.({ target: { value: String(min), valueAsNumber: min } });
      onValueChange?.(min);
    }
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      disabled={disabled}
      placeholder={placeholder}
      aria-label={ariaLabel || placeholder}
      value={strVal}
      onChange={handleChange}
      onBlur={handleBlur}
      className={`w-full min-h-[44px] px-4 py-2.5 rounded-[18px] border border-border bg-card text-ink font-medium outline-none focus:border-pri transition-colors disabled:opacity-50 ${className}`}
    />
  );
}

export default NumberField;
