import React, { useState, useEffect } from 'react';
import * as Popover from '@radix-ui/react-popover';

const MONTHS_SHORT = [
  'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
  'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez',
];

const MONTHS_FULL = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

function getNowYM(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function parseYM(val?: string): { year: number; month: number } {
  if (val && /^\d{4}-\d{2}$/.test(val)) {
    const [y, m] = val.split('-').map(Number);
    return { year: y, month: m - 1 };
  }
  const d = new Date();
  return { year: d.getFullYear(), month: d.getMonth() };
}

export interface MonthPickerProps {
  value: string;
  onChange: (ym: string) => void;
  className?: string;
}

export function MonthPicker({ value, onChange, className = '' }: MonthPickerProps) {
  const [open, setOpen] = useState(false);
  const parsed = parseYM(value);
  const [viewYear, setViewYear] = useState(parsed.year);
  const nowYM = getNowYM();

  useEffect(() => {
    if (open) {
      setViewYear(parseYM(value).year);
    }
  }, [open, value]);

  function stepMonth(delta: number) {
    const d = new Date(parsed.year, parsed.month + delta, 1);
    onChange(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }

  return (
    <div
      className={`inline-flex items-center gap-1 px-1.5 min-h-[44px] rounded-pill border border-border bg-card text-ink ${className}`}
    >
      <button
        type="button"
        aria-label="Mês anterior"
        onContextMenu={(e) => e.preventDefault()}
        onClick={() => stepMonth(-1)}
        className="w-9 h-9 rounded-full flex items-center justify-center text-muted hover:text-ink hover:bg-neutral transition-colors"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <path d="m15 18-6-6 6-6" />
        </svg>
      </button>

      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger asChild>
          <button
            type="button"
            aria-label="Escolher mês e ano"
            className="px-2.5 py-1.5 rounded-pill text-sm font-bold text-ink hover:bg-neutral transition-colors flex items-center gap-1.5"
          >
            <span>
              {MONTHS_FULL[parsed.month]} {parsed.year}
            </span>
          </button>
        </Popover.Trigger>

        <Popover.Portal>
          <Popover.Content
            align="center"
            sideOffset={6}
            className="z-[9999] w-[264px] rounded-[24px] border border-border bg-card p-4 text-ink shadow-2xl focus:outline-none"
          >
            <div className="flex items-center justify-between mb-3">
              <button
                type="button"
                aria-label="Ano anterior"
                onContextMenu={(e) => e.preventDefault()}
                onClick={() => setViewYear((y) => y - 1)}
                className="w-9 h-9 rounded-full flex items-center justify-center text-muted hover:text-ink hover:bg-neutral transition-colors"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                  <path d="m15 18-6-6 6-6" />
                </svg>
              </button>
              <div className="font-display font-bold text-sm text-ink">{viewYear}</div>
              <button
                type="button"
                aria-label="Próximo ano"
                onContextMenu={(e) => e.preventDefault()}
                onClick={() => setViewYear((y) => y + 1)}
                className="w-9 h-9 rounded-full flex items-center justify-center text-muted hover:text-ink hover:bg-neutral transition-colors"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                  <path d="m9 18 6-6-6-6" />
                </svg>
              </button>
            </div>

            <div className="grid grid-cols-3 gap-1.5">
              {MONTHS_SHORT.map((mName, idx) => {
                const ym = `${viewYear}-${String(idx + 1).padStart(2, '0')}`;
                const isSelected = ym === value;
                const isCurrent = ym === nowYM;
                return (
                  <button
                    key={ym}
                    type="button"
                    onClick={() => {
                      onChange(ym);
                      setOpen(false);
                    }}
                    className={`min-h-[40px] rounded-[14px] text-xs font-bold transition-colors ${
                      isSelected
                        ? 'bg-fab text-fabIcon shadow-sm'
                        : isCurrent
                          ? 'border border-pri text-pri'
                          : 'text-ink hover:bg-neutral'
                    }`}
                  >
                    {mName}
                  </button>
                );
              })}
            </div>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>

      <button
        type="button"
        aria-label="Próximo mês"
        onContextMenu={(e) => e.preventDefault()}
        onClick={() => stepMonth(1)}
        className="w-9 h-9 rounded-full flex items-center justify-center text-muted hover:text-ink hover:bg-neutral transition-colors"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <path d="m9 18 6-6-6-6" />
        </svg>
      </button>
    </div>
  );
}

export default MonthPicker;
