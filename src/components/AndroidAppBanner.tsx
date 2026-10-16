import React, { useState, useEffect } from 'react';
import { APP_DOWNLOAD_URL, isAppDownloadAvailable } from '../config/app';

const DISMISS_KEY = 'wynd_android_banner_dismissed_until';
const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

export function AndroidAppBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') return;
    if (!isAppDownloadAvailable()) return;

    const isAndroid = /android/i.test(navigator.userAgent);
    const isStandalone =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(display-mode: standalone)').matches;

    if (!isAndroid || isStandalone) return;

    try {
      const dismissedUntil = Number(localStorage.getItem(DISMISS_KEY) || '0');
      if (dismissedUntil > Date.now()) return;
    } catch {
      // Ignora erro de localStorage
    }

    setVisible(true);
  }, []);

  function handleDismiss() {
    setVisible(false);
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now() + FOURTEEN_DAYS_MS));
    } catch {
      // Ignora erro de localStorage
    }
  }

  if (!visible) return null;

  return (
    <div className="mb-5 rounded-[24px] border border-border bg-priSoft text-priInk p-4 flex items-center justify-between gap-3 shadow-sm">
      <div className="min-w-0">
        <div className="font-display font-bold text-sm text-priInk leading-tight">
          Use o Wynd no app Android
        </div>
        <div className="text-xs text-muted mt-0.5 leading-snug">
          Mais rápido, com digital e avisos
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <a
          href={APP_DOWNLOAD_URL}
          target="_blank"
          rel="noopener"
          className="px-3.5 min-h-[40px] rounded-pill bg-fab text-fabIcon text-xs font-bold flex items-center justify-center hover:opacity-95 transition-opacity"
        >
          Baixar
        </a>
        <button
          type="button"
          aria-label="Fechar aviso do aplicativo"
          onContextMenu={(e) => e.preventDefault()}
          onClick={handleDismiss}
          className="w-9 h-9 rounded-full flex items-center justify-center text-priInk hover:bg-black/5 transition-colors"
        >
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
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}

export default AndroidAppBanner;
