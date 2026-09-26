import React, { useState, useRef, useEffect } from 'react';

interface OptionItem { value: string; label: React.ReactNode; disabled?: boolean; groupLabel?: string; }

function parseOptions(children: React.ReactNode): OptionItem[] {
  const items: OptionItem[] = [];
  React.Children.forEach(children, (child: any) => {
    if (!child) return;
    if (child.type === 'option') {
      items.push({ value: child.props.value, label: child.props.children, disabled: child.props.disabled });
    } else if (child.type === 'optgroup') {
      React.Children.forEach(child.props.children, (opt: any) => {
        if (opt) items.push({ value: opt.props.value, label: opt.props.children, disabled: opt.props.disabled, groupLabel: child.props.label });
      });
    }
  });
  return items;
}

interface CustomSelectProps {
  value: string;
  onChange: (e: { target: { value: string } }) => void;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
  size?: 'sm' | 'md';
  title?: string;
}

/**
 * Dropdown feito do zero (nada de <select> nativo do navegador/SO), pra nunca abrir
 * o menu branco/cinza do sistema sobre o tema escuro do app. A API imita <select>
 * (value/onChange/<option>/<optgroup> como filhos) só pra facilitar a troca direta.
 */
export function CustomSelect({ value, onChange, children, className, disabled, size = 'md', title }: CustomSelectProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const options = parseOptions(children);
  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const btnPad = size === 'sm' ? 'px-2 py-1 text-xs' : 'px-4 py-3 text-sm';
  let lastGroup: string | undefined;

  return (
    <div ref={ref} className={`relative ${className || ''}`}>
      <button
        type="button"
        title={title}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={`w-full flex items-center justify-between gap-2 ${btnPad} rounded-xl border border-white/10 bg-black/20 text-[#f2f0ea] text-left transition-colors hover:border-white/20 disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        <span className="truncate">{selected?.label ?? ''}</span>
        <i className={`fa-solid fa-chevron-down text-[10px] text-[#8fa39a] transition-transform shrink-0 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full max-h-64 overflow-y-auto rounded-xl border border-white/10 bg-[#1a2422] shadow-2xl py-1">
          {options.map((opt, i) => {
            const showGroupLabel = opt.groupLabel && opt.groupLabel !== lastGroup;
            lastGroup = opt.groupLabel;
            return (
              <React.Fragment key={String(opt.value) + i}>
                {showGroupLabel && (
                  <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-[#5c6b66] font-bold">{opt.groupLabel}</div>
                )}
                <button
                  type="button"
                  disabled={opt.disabled}
                  onClick={() => { if (!opt.disabled) { onChange({ target: { value: opt.value } }); setOpen(false); } }}
                  className={`w-full text-left px-4 py-2 text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${opt.value === value ? 'bg-[#e3b04b]/15 text-[#e3b04b] font-semibold' : 'text-[#f2f0ea] hover:bg-white/5'}`}
                >
                  {opt.label}
                </button>
              </React.Fragment>
            );
          })}
        </div>
      )}
    </div>
  );
}
