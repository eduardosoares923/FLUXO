export const APP_DOWNLOAD_URL = (import.meta.env.VITE_APP_DOWNLOAD_URL || '').trim();
export const SUPPORT_EMAIL = 'suportewynd@gmail.com';
export const APP_VERSION = '2.0';

export function isAppDownloadAvailable(): boolean {
  return Boolean(
    APP_DOWNLOAD_URL &&
      APP_DOWNLOAD_URL.trim() !== '' &&
      APP_DOWNLOAD_URL !== 'COLE_AQUI_O_LINK_DO_APK'
  );
}

