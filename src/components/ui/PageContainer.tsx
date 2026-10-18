import React from 'react';

export interface PageContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
}

export function PageContainer({ children, className = '', ...rest }: PageContainerProps) {
  return (
    <div
      className={`w-full max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 pb-24 pt-4 sm:pt-6 animate-in fade-in duration-500 ${className}`.trim()}
      {...rest}
    >
      {children}
    </div>
  );
}

export default PageContainer;
