import React, { useState, useEffect } from 'react';
import * as RadixSelect from '@radix-ui/react-select';
import * as Dialog from '@radix-ui/react-dialog';

interface OptionItem {
  value: string;
  label: React.ReactNode;
  textLabel: string;
  disabled?: boolean;
  groupLabel?: string;
}

const EMPTY_TOKEN = '__WYND_EMPTY_OPTION__';

function toRadixVal(v: string): string {
  return v === '' ? EMPTY_TOKEN : String(v ?? '');
}

function fromRadixVal(v: string): string {
  return v === EMPTY_TOKEN ? '' : v;
}

function extractText(node: React.ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(extractText).join('');
  if (React.isValidElement(node)) return extractText((node.props as any).children);
  return '';
}

function parseOptions(children: React.ReactNode): OptionItem[] {
  const items: OptionItem[] = [];
  React.Children.forEach(children, (child: any) => {
    if (!child) return;
    if (child.type === 'option') {
      const val = child.props.value !== undefined ? String(child.props.value) : extractText(child.props.children);
      items.push({
        value: val,
        label: child.props.children,
        textLabel: extractText(child.props.children),
        disabled: child.props.disabled,
      });
    } else if (child.type === 'optgroup') {
      React.Children.forEach(child.props.children, (opt: any) => {
        if (opt && opt.type === 'option') {
          const val = opt.props.value !== undefined ? String(opt.props.value) : extractText(opt.props.children);
          items.push({
            value: val,
            label: opt.props.children,
            textLabel: extractText(opt.props.children),
            disabled: opt.props.disabled,
            groupLabel: child.props.label,
          });
        }
      });
    }
  });
  return items;
}

export interface SelectProps {
  value: string;
  onChange: (e: { target: { value: string } }) => void;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
  size?: 'sm' | 'md';
  ariaLabel?: string;
  placeholder?: string;
}

export function Select({
  value,
  onChange,
  children,
  className = '',
  disabled = false,
  size = 'md',
  ariaLabel,
  placeholder = 'Selecionar',
}: SelectProps) {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < 768 : false
  );
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const options = parseOptions(children);
  const selected = options.find((o) => o.value === String(value ?? ''));
  const btnPad = size === 'sm' ? 'px-3 min-h-[38px] text-xs' : 'px-4 min-h-[44px] text-sm';

  if (isMobile) {
    let lastGroup: string | undefined;
    return (
      <div className={`relative ${className}`}>
        <Dialog.Root open={sheetOpen} onOpenChange={setSheetOpen}>
          <Dialog.Trigger asChild>
            <button
              type="button"
              disabled={disabled}
              aria-label={ariaLabel || selected?.textLabel || placeholder}
              className={`w-full flex items-center justify-between gap-2 ${btnPad} rounded-[18px] border border-border bg-card text-ink text-left font-medium transition-colors hover:border-pri/40 disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              <span className="truncate">{selected?.label ?? placeholder}</span>
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-muted shrink-0"
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>
          </Dialog.Trigger>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-[9998] bg-black/50 backdrop-blur-xs" />
            <Dialog.Content className="fixed inset-x-0 bottom-0 z-[9999] rounded-t-[28px] bg-card border-t border-border p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] max-h-[75vh] flex flex-col shadow-2xl focus:outline-none">
              <div className="w-10 h-1.5 rounded-full bg-track mx-auto mb-3 shrink-0" />
              <Dialog.Title className="sr-only">
                {ariaLabel || placeholder}
              </Dialog.Title>
              <Dialog.Description className="sr-only">
                Escolha uma opção da lista abaixo
              </Dialog.Description>
              <div className="overflow-y-auto flex flex-col gap-1 pr-1">
                {options.map((opt, i) => {
                  const showGroup = opt.groupLabel && opt.groupLabel !== lastGroup;
                  lastGroup = opt.groupLabel;
                  const isSel = opt.value === String(value ?? '');
                  return (
                    <React.Fragment key={String(opt.value) + i}>
                      {showGroup && (
                        <div className="px-3 pt-2 pb-1 text-[11px] uppercase tracking-wider text-muted font-bold">
                          {opt.groupLabel}
                        </div>
                      )}
                      <button
                        type="button"
                        disabled={opt.disabled}
                        onClick={() => {
                          if (!opt.disabled) {
                            onChange({ target: { value: opt.value } });
                            setSheetOpen(false);
                          }
                        }}
                        className={`w-full min-h-[44px] px-4 py-2.5 rounded-[16px] text-sm flex items-center justify-between gap-2 text-left transition-colors disabled:opacity-40 ${
                          isSel
                            ? 'bg-priSoft text-priInk font-bold'
                            : 'text-ink hover:bg-neutral'
                        }`}
                      >
                        <span className="truncate">{opt.label}</span>
                        {isSel && (
                          <svg
                            width="18"
                            height="18"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={2}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="text-priInk shrink-0"
                          >
                            <path d="M20 6 9 17l-5-5" />
                          </svg>
                        )}
                      </button>
                    </React.Fragment>
                  );
                })}
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      </div>
    );
  }

  let lastGroup: string | undefined;

  return (
    <div className={`relative ${className}`}>
      <RadixSelect.Root
        value={toRadixVal(String(value ?? ''))}
        onValueChange={(val) => onChange({ target: { value: fromRadixVal(val) } })}
        disabled={disabled}
      >
        <RadixSelect.Trigger
          aria-label={ariaLabel || selected?.textLabel || placeholder}
          className={`w-full flex items-center justify-between gap-2 ${btnPad} rounded-[18px] border border-border bg-card text-ink text-left font-medium transition-colors hover:border-pri/40 disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          <span className="truncate">
            <RadixSelect.Value placeholder={placeholder}>
              {selected?.label ?? placeholder}
            </RadixSelect.Value>
          </span>
          <RadixSelect.Icon className="text-muted shrink-0">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </RadixSelect.Icon>
        </RadixSelect.Trigger>

        <RadixSelect.Portal>
          <RadixSelect.Content
            position="popper"
            sideOffset={6}
            className="z-[9999] min-w-[var(--radix-select-trigger-width)] max-h-72 overflow-hidden rounded-[20px] border border-border bg-card text-ink shadow-2xl p-1.5"
          >
            <RadixSelect.Viewport className="p-0.5 max-h-64 overflow-y-auto">
              {options.map((opt, i) => {
                const showGroup = opt.groupLabel && opt.groupLabel !== lastGroup;
                lastGroup = opt.groupLabel;
                return (
                  <React.Fragment key={String(opt.value) + i}>
                    {showGroup && (
                      <div className="px-3 pt-2 pb-1 text-[11px] uppercase tracking-wider text-muted font-bold">
                        {opt.groupLabel}
                      </div>
                    )}
                    <RadixSelect.Item
                      value={toRadixVal(opt.value)}
                      disabled={opt.disabled}
                      className="relative flex items-center justify-between gap-2 px-3.5 py-2.5 min-h-[40px] rounded-[14px] text-sm cursor-pointer select-none outline-none transition-colors text-ink data-[highlighted]:bg-neutral data-[state=checked]:bg-priSoft data-[state=checked]:text-priInk data-[state=checked]:font-bold data-[disabled]:opacity-40 data-[disabled]:pointer-events-none"
                    >
                      <RadixSelect.ItemText>{opt.label}</RadixSelect.ItemText>
                      <RadixSelect.ItemIndicator className="text-priInk shrink-0">
                        <svg
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={2}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M20 6 9 17l-5-5" />
                        </svg>
                      </RadixSelect.ItemIndicator>
                    </RadixSelect.Item>
                  </React.Fragment>
                );
              })}
            </RadixSelect.Viewport>
          </RadixSelect.Content>
        </RadixSelect.Portal>
      </RadixSelect.Root>
    </div>
  );
}

export default Select;
