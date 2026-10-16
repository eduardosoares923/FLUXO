import React from 'react';
import * as RadixScrollArea from '@radix-ui/react-scroll-area';

export interface ScrollAreaProps {
  children: React.ReactNode;
  className?: string;
  maxHeight?: string;
}

export function ScrollArea({ children, className = '', maxHeight = '320px' }: ScrollAreaProps) {
  return (
    <RadixScrollArea.Root className={`relative overflow-hidden ${className}`}>
      <RadixScrollArea.Viewport style={{ maxHeight }} className="w-full h-full rounded-[inherit]">
        {children}
      </RadixScrollArea.Viewport>
      <RadixScrollArea.Scrollbar
        orientation="vertical"
        className="flex select-none touch-none p-0.5 bg-transparent transition-colors w-2.5"
      >
        <RadixScrollArea.Thumb className="flex-1 bg-track rounded-pill relative" />
      </RadixScrollArea.Scrollbar>
    </RadixScrollArea.Root>
  );
}

export default ScrollArea;
