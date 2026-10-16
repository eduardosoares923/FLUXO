import React from 'react';
import * as Tabs from '@radix-ui/react-tabs';

export interface SegTabOption {
  value: string;
  label: React.ReactNode;
}

export interface SegTabsProps {
  value: string;
  onValueChange: (val: string) => void;
  options: SegTabOption[];
  className?: string;
  ariaLabel?: string;
}

export function SegTabs({
  value,
  onValueChange,
  options,
  className = '',
  ariaLabel = 'Abas',
}: SegTabsProps) {
  return (
    <Tabs.Root value={value} onValueChange={onValueChange} className={className}>
      <Tabs.List
        aria-label={ariaLabel}
        className="inline-flex w-full items-center gap-1 rounded-pill bg-seg p-1"
      >
        {options.map((opt) => (
          <Tabs.Trigger
            key={opt.value}
            value={opt.value}
            className="flex-1 min-h-[40px] px-3.5 py-1.5 rounded-pill text-xs font-bold text-muted transition-all data-[state=active]:bg-segOn data-[state=active]:text-ink data-[state=active]:shadow-xs"
          >
            {opt.label}
          </Tabs.Trigger>
        ))}
      </Tabs.List>
    </Tabs.Root>
  );
}

export default SegTabs;
