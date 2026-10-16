import React, { useState, useEffect, useMemo } from 'react';
import * as Popover from '@radix-ui/react-popover';

const WEEKDAYS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const MONTHS_PT = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

function getTodayYMD(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parseYMD(val?: string): { year: number; month: number; day: number } {
  if (val && /^\d{4}-\d{2}-\d{2}$/.test(val)) {
    const [y, m, d] = val.split('-').map(Number);
    return { year: y, month: m - 1, day: d };
  }
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth(), day: now.getDate() };
}

function formatYMD(year: number, month0: number, day: number): string {
  return `${year}-${String(month0 + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function formatDisplayBR(val?: string): string {
  if (!val || !/^\d{4}-\d{2}-\d{2}$/.test(val)) return 'Selecionar data';
  const [y, m, d] = val.split('-');
  return `${d}/${m}/${y}`;
}

export interface DatePickerProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  disabled?: boolean;
  ariaLabel?: string;
}

export function DatePicker({
  value,
  onChange,
  className = '',
  disabled = false,
  ariaLabel = 'Selecionar data',
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const parsed = useMemo(() => parseYMD(value), [value]);
  const [viewYear, setViewYear] = useState(parsed.year);
  const [viewMonth, setViewMonth] = useState(parsed.month);
  const [focusedDate, setFocusedDate] = useState(value || getTodayYMD());

  useEffect(() => {
    if (open) {
      const p = parseYMD(value);
      setViewYear(p.year);
      setViewMonth(p.month);
      setFocusedDate(value || getTodayYMD());
    }
  }, [open, value]);

  const todayYMD = getTodayYMD();

  const daysGrid = useMemo(() => {
    const firstDayWeek = new Date(viewYear, viewMonth, 1).getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const cells: ({ day: number; ymd: string } | null)[] = [];
    for (let i = 0; i < firstDayWeek; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({ day: d, ymd: formatYMD(viewYear, viewMonth, d) });
    }
    return cells;
  }, [viewYear, viewMonth]);

  function shiftMonth(delta: number) {
    const d = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    const cur = parseYMD(focusedDate);
    let delta = 0;
    if (e.key === 'ArrowLeft') delta = -1;
    else if (e.key === 'ArrowRight') delta = 1;
    else if (e.key === 'ArrowUp') delta = -7;
    else if (e.key === 'ArrowDown') delta = 7;
    else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onChange(focusedDate);
      setOpen(false);
      return;
    } else if (e.key === 'Escape') {
      setOpen(false);
      return;
    }

    if (delta !== 0) {
      e.preventDefault();
      const next = new Date(cur.year, cur.month, cur.day + delta);
      const nextYMD = formatYMD(next.getFullYear(), next.getMonth(), next.getDate());
      setFocusedDate(nextYMD);
      setViewYear(next.getFullYear());
      setViewMonth(next.getMonth());
    }
  }

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label={ariaLabel}
          className={`w-full min-h-[44px] px-4 py-2.5 rounded-[18px] border border-border bg-card text-ink text-sm font-medium flex items-center justify-between gap-2 hover:border-pri/40 transition-colors disabled:opacity-50 ${className}`}
        >
          <span>{formatDisplayBR(value)}</span>
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-muted shrink-0"
          >
            <rect x="3" y="4" width="18" height="18" rx="3" />
            <path d="M16 2v4" />
            <path d="M8 2v4" />
            <path d="M3 10h18" />
          </svg>
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          onKeyDown={handleKeyDown}
          className="z-[9999] w-[296px] rounded-[24px] border border-border bg-card p-4 text-ink shadow-2xl focus:outline-none"
        >
          <div className="flex items-center justify-between mb-3">
            <button
              type="button"
              aria-label="Mês anterior"
              onContextMenu={(e) => e.preventDefault()}
              onClick={() => shiftMonth(-1)}
              className="w-9 h-9 rounded-full flex items-center justify-center text-muted hover:text-ink hover:bg-neutral transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                <path d="m15 18-6-6 6-6" />
              </svg>
            </button>
            <div className="font-display font-bold text-sm text-ink">
              {MONTHS_PT[viewMonth]} {viewYear}
            </div>
            <button
              type="button"
              aria-label="Próximo mês"
              onContextMenu={(e) => e.preventDefault()}
              onClick={() => shiftMonth(1)}
              className="w-9 h-9 rounded-full flex items-center justify-center text-muted hover:text-ink hover:bg-neutral transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                <path d="m9 18 6-6-6-6" />
              </svg>
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 mb-1 text-center">
            {WEEKDAYS.map((w, idx) => (
              <div key={idx} className="text-[11px] font-bold text-muted py-1">
                {w}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1" role="grid">
            {daysGrid.map((cell, idx) => {
              if (!cell) return <div key={`empty-${idx}`} className="h-9" />;
              const isSelected = cell.ymd === value;
              const isToday = cell.ymd === todayYMD;
              const isFocused = cell.ymd === focusedDate;
              return (
                <button
                  key={cell.ymd}
                  type="button"
                  role="gridcell"
                  aria-selected={isSelected}
                  onClick={() => {
                    onChange(cell.ymd);
                    setOpen(false);
                  }}
                  className={`h-9 w-9 mx-auto rounded-full text-xs font-semibold flex items-center justify-center transition-colors ${
                    isSelected
                      ? 'bg-fab text-fabIcon font-bold shadow-sm'
                      : isToday
                        ? 'border border-pri text-pri font-bold'
                        : 'text-ink hover:bg-neutral'
                  } ${isFocused && !isSelected ? 'ring-2 ring-pri/50' : ''}`}
                >
                  {cell.day}
                </button>
              );
            })}
          </div>

          <div className="mt-3 pt-2.5 border-t border-border flex items-center justify-between">
            <button
              type="button"
              onClick={() => {
                onChange(todayYMD);
                setOpen(false);
              }}
              className="text-xs font-bold text-pri hover:underline px-2 py-1"
            >
              Hoje
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-xs font-semibold text-muted hover:text-ink px-2 py-1"
            >
              Fechar
            </button>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

export default DatePicker;
