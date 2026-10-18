import React from 'react';

export type IconName =
  | 'utensils'
  | 'cart-shopping'
  | 'house'
  | 'car'
  | 'heart-pulse'
  | 'graduation-cap'
  | 'champagne-glasses'
  | 'sack-dollar'
  | 'chart-line'
  | 'rotate'
  | 'shirt'
  | 'wifi'
  | 'kit-medical'
  | 'briefcase'
  | 'bag-shopping'
  | 'arrow-down'
  | 'right-left'
  | 'file-invoice-dollar'
  | 'triangle-exclamation'
  | 'rotate-right'
  | 'rotate-left'
  | 'circle-notch'
  | 'spinner'
  | 'cloud-bolt'
  | 'inbox'
  | 'plus'
  | 'eye'
  | 'eye-slash'
  | 'pen'
  | 'trash'
  | 'chevron-left'
  | 'chevron-right'
  | 'check'
  | 'sparkles'
  | 'magnifying-glass'
  | 'sliders'
  | 'list'
  | 'calendar-days'
  | 'calendar-day'
  | 'xmark'
  | 'receipt'
  | 'layer-group'
  | 'copy'
  | 'lightbulb'
  | 'calculator'
  | 'chart-pie'
  | 'users'
  | 'arrow-trend-up';

export interface IconProps extends React.SVGProps<SVGSVGElement> {
  name: IconName | string;
  size?: number | string;
  spin?: boolean;
}

function normalizeIconName(raw: string): string {
  const token = (raw || '').trim().split(/\s+/).pop() || '';
  return token.replace(/^f[a]\x2d/i, '');
}

export function Icon({ name, size = '1em', spin = false, className = '', style, ...rest }: IconProps) {
  const key = normalizeIconName(name);
  const isSpin = spin || key === 'spinner' || key === 'circle-notch';

  const renderPaths = () => {
    switch (key) {
      case 'utensils':
        return (
          <>
            <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2" />
            <path d="M7 2v20" />
            <path d="M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7" />
          </>
        );
      case 'cart-shopping':
        return (
          <>
            <circle cx="8" cy="21" r="1.5" />
            <circle cx="19" cy="21" r="1.5" />
            <path d="M2.5 3h2l2.6 12.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L22.5 7H6" />
          </>
        );
      case 'house':
        return (
          <>
            <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5.5v-6h-5v6H4a1 1 0 0 1-1-1v-9.5Z" />
          </>
        );
      case 'car':
        return (
          <>
            <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9L18 10l-2.3-4.4A2 2 0 0 0 13.9 4.5H10a2 2 0 0 0-1.8 1.1L6 10l-2.5 1.1C2.7 11.3 2 12.1 2 13v3c0 .6.4 1 1 1h2" />
            <circle cx="7" cy="17" r="2" />
            <path d="M9 17h6" />
            <circle cx="17" cy="17" r="2" />
          </>
        );
      case 'heart-pulse':
        return (
          <>
            <path d="M19.5 12.6 12 20l-7.5-7.4A5 5 0 0 1 12 6a5 5 0 0 1 7.5 6.6Z" />
            <path d="M3.5 12h4l2-3 3 6 2-3h6" />
          </>
        );
      case 'graduation-cap':
        return (
          <>
            <path d="M22 10 12 5 2 10l10 5 10-5Z" />
            <path d="M6 12v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5" />
            <path d="M22 10v6" />
          </>
        );
      case 'champagne-glasses':
        return (
          <>
            <path d="M8 22h8" />
            <path d="M12 15v7" />
            <path d="M17 3H7l-1 6a6 6 0 0 0 12 0l-1-6Z" />
            <path d="M6.2 8h11.6" />
          </>
        );
      case 'sack-dollar':
        return (
          <>
            <path d="M9 3h6l-1.5 3.5a6.5 6.5 0 0 1 4.5 6.2V17a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4v-4.3a6.5 6.5 0 0 1 4.5-6.2L9 3Z" />
            <path d="M12 10v7" />
            <path d="M14 11.5c0-.8-.9-1.5-2-1.5s-2 .7-2 1.5.9 1.5 2 1.5 2 .7 2 1.5-.9 1.5-2 1.5-2-.7-2-1.5" />
          </>
        );
      case 'chart-line':
        return (
          <>
            <path d="M3 3v18h18" />
            <path d="m7 15 4-4 3 3 5-6" />
          </>
        );
      case 'arrow-trend-up':
        return (
          <>
            <path d="m22 7-8.5 8.5-5-5L2 17" />
            <path d="M16 7h6v6" />
          </>
        );
      case 'rotate':
      case 'rotate-right':
        return (
          <>
            <path d="M21 12a9 9 0 1 1-2.64-6.36L21 8" />
            <path d="M21 3v5h-5" />
          </>
        );
      case 'rotate-left':
        return (
          <>
            <path d="M3 12a9 9 0 1 0 2.64-6.36L3 8" />
            <path d="M3 3v5h5" />
          </>
        );
      case 'shirt':
        return (
          <>
            <path d="M15 3 18 5l3 2-2 4-3-1v10H8V10l-3 1-2-4 3-2 3-2a3 3 0 0 0 6 0Z" />
          </>
        );
      case 'wifi':
        return (
          <>
            <path d="M5 12.55a11 11 0 0 1 14.08 0" />
            <path d="M1.42 9a16 16 0 0 1 21.16 0" />
            <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
            <circle cx="12" cy="20" r="1" fill="currentColor" />
          </>
        );
      case 'kit-medical':
        return (
          <>
            <rect x="3" y="6" width="18" height="14" rx="2" />
            <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
            <path d="M12 10v6" />
            <path d="M9 13h6" />
          </>
        );
      case 'briefcase':
        return (
          <>
            <rect x="2" y="7" width="20" height="14" rx="2" />
            <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
            <path d="M2 12h20" />
          </>
        );
      case 'bag-shopping':
        return (
          <>
            <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
            <path d="M3 6h18" />
            <path d="M16 10a4 4 0 0 1-8 0" />
          </>
        );
      case 'arrow-down':
        return (
          <>
            <path d="M12 5v14" />
            <path d="m19 12-7 7-7-7" />
          </>
        );
      case 'right-left':
        return (
          <>
            <path d="m16 3 4 4-4 4" />
            <path d="M20 7H4" />
            <path d="m8 21-4-4 4-4" />
            <path d="M4 17h16" />
          </>
        );
      case 'file-invoice-dollar':
      case 'receipt':
        return (
          <>
            <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1-2-1Z" />
            <path d="M8 10h8" />
            <path d="M8 14h6" />
          </>
        );
      case 'triangle-exclamation':
        return (
          <>
            <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
            <path d="M12 9v4" />
            <circle cx="12" cy="17" r="0.8" fill="currentColor" />
          </>
        );
      case 'circle-notch':
      case 'spinner':
        return (
          <>
            <path d="M21 12a9 9 0 1 1-6.22-8.56" />
          </>
        );
      case 'cloud-bolt':
        return (
          <>
            <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
            <path d="m13 13-3 5h4l-2 4" />
          </>
        );
      case 'inbox':
        return (
          <>
            <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
            <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11Z" />
          </>
        );
      case 'plus':
        return (
          <>
            <path d="M12 5v14" />
            <path d="M5 12h14" />
          </>
        );
      case 'eye':
        return (
          <>
            <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
            <circle cx="12" cy="12" r="3" />
          </>
        );
      case 'eye-slash':
        return (
          <>
            <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
            <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
            <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
            <line x1="2" x2="22" y1="2" y2="22" />
          </>
        );
      case 'pen':
        return (
          <>
            <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
          </>
        );
      case 'trash':
        return (
          <>
            <path d="M3 6h18" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
            <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </>
        );
      case 'chevron-left':
        return <path d="m15 18-6-6 6-6" />;
      case 'chevron-right':
        return <path d="m9 18 6-6-6-6" />;
      case 'check':
        return <path d="M20 6 9 17l-5-5" />;
      case 'sparkles':
        return (
          <>
            <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3L12 3Z" />
            <path d="M5 3v4" />
            <path d="M3 5h4" />
          </>
        );
      case 'magnifying-glass':
        return (
          <>
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </>
        );
      case 'sliders':
        return (
          <>
            <line x1="4" x2="20" y1="6" y2="6" />
            <line x1="4" x2="20" y1="12" y2="12" />
            <line x1="4" x2="20" y1="18" y2="18" />
            <circle cx="9" cy="6" r="2" />
            <circle cx="15" cy="12" r="2" />
            <circle cx="10" cy="18" r="2" />
          </>
        );
      case 'list':
        return (
          <>
            <line x1="8" x2="21" y1="6" y2="6" />
            <line x1="8" x2="21" y1="12" y2="12" />
            <line x1="8" x2="21" y1="18" y2="18" />
            <line x1="3" x2="3.01" y1="6" y2="6" />
            <line x1="3" x2="3.01" y1="12" y2="12" />
            <line x1="3" x2="3.01" y1="18" y2="18" />
          </>
        );
      case 'calendar-days':
      case 'calendar-day':
        return (
          <>
            <rect width="18" height="18" x="3" y="4" rx="2" />
            <line x1="16" x2="16" y1="2" y2="6" />
            <line x1="8" x2="8" y1="2" y2="6" />
            <line x1="3" x2="21" y1="10" y2="10" />
            <path d="M8 14h.01" />
            <path d="M12 14h.01" />
            <path d="M16 14h.01" />
          </>
        );
      case 'xmark':
        return (
          <>
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </>
        );
      case 'layer-group':
        return (
          <>
            <polygon points="12 2 2 7 12 12 22 7 12 2" />
            <polyline points="2 17 12 22 22 17" />
            <polyline points="2 12 12 17 22 12" />
          </>
        );
      case 'copy':
        return (
          <>
            <rect width="13" height="13" x="9" y="9" rx="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </>
        );
      case 'lightbulb':
        return (
          <>
            <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5" />
            <path d="M9 18h6" />
            <path d="M10 22h4" />
          </>
        );
      case 'calculator':
        return (
          <>
            <rect width="16" height="20" x="4" y="2" rx="2" />
            <line x1="8" x2="16" y1="6" y2="6" />
            <line x1="16" x2="16" y1="14" y2="18" />
            <path d="M16 10h.01" />
            <path d="M12 10h.01" />
            <path d="M8 10h.01" />
            <path d="M12 14h.01" />
            <path d="M8 14h.01" />
            <path d="M12 18h.01" />
            <path d="M8 18h.01" />
          </>
        );
      case 'chart-pie':
        return (
          <>
            <path d="M21.21 15.89A10 10 0 1 1 8 2.83" />
            <path d="M22 12A10 10 0 0 0 12 2v10Z" />
          </>
        );
      case 'users':
        return (
          <>
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </>
        );
      default:
        return <circle cx="12" cy="12" r="8" />;
    }
  };

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`inline-block shrink-0 ${isSpin ? 'animate-spin' : ''} ${className}`.trim()}
      style={style}
      {...rest}
    >
      {renderPaths()}
    </svg>
  );
}

export default Icon;
