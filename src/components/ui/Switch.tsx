import React from 'react';
import * as RadixSwitch from '@radix-ui/react-switch';

export interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
}

export function Switch({
  checked,
  onCheckedChange,
  disabled = false,
  ariaLabel,
  className = '',
}: SwitchProps) {
  return (
    <RadixSwitch.Root
      checked={checked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
      aria-label={ariaLabel}
      className={`group relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-pill border border-border bg-track transition-colors data-[state=checked]:bg-pri data-[state=checked]:border-pri disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    >
      <RadixSwitch.Thumb className="pointer-events-none block h-5 w-5 translate-x-1 rounded-full bg-card shadow-md transition-transform data-[state=checked]:translate-x-6" />
    </RadixSwitch.Root>
  );
}

export default Switch;
