import React from 'react';
import * as RadixTooltip from '@radix-ui/react-tooltip';

export interface TooltipProps {
  content: string;
  children: React.ReactElement;
  side?: 'top' | 'right' | 'bottom' | 'left';
  delayDuration?: number;
}

export function Tooltip({ content, children, side = 'top', delayDuration = 200 }: TooltipProps) {
  if (!content) return children;

  const childWithAria = React.isValidElement(children)
    ? React.cloneElement(children as React.ReactElement<any>, {
        'aria-label': (children.props as any)['aria-label'] || content,
      })
    : children;

  return (
    <RadixTooltip.Provider delayDuration={delayDuration}>
      <RadixTooltip.Root>
        <RadixTooltip.Trigger asChild>{childWithAria}</RadixTooltip.Trigger>
        <RadixTooltip.Portal>
          <RadixTooltip.Content
            side={side}
            sideOffset={6}
            className="z-[99999] select-none rounded-[12px] bg-ink px-2.5 py-1.5 text-[12px] font-bold text-bg shadow-lg pointer-events-none hidden md:block"
          >
            {content}
            <RadixTooltip.Arrow className="fill-ink" />
          </RadixTooltip.Content>
        </RadixTooltip.Portal>
      </RadixTooltip.Root>
    </RadixTooltip.Provider>
  );
}

export default Tooltip;
