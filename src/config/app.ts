export const APP_DOWNLOAD_URL = 'COLE_AQUI_O_LINK_DO_APK';

export function isAppDownloadAvailable(): boolean {
  return Boolean(
    APP_DOWNLOAD_URL &&
      APP_DOWNLOAD_URL.trim() !== '' &&
      APP_DOWNLOAD_URL !== 'COLE_AQUI_O_LINK_DO_APK'
  );
}
