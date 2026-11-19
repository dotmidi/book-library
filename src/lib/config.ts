export const config = {
  clientId: (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined)?.trim() ?? '',
  booksApiKey: (import.meta.env.VITE_GOOGLE_BOOKS_API_KEY as string | undefined)?.trim() ?? '',
  version: __APP_VERSION__,
};

/** Only these two scopes: both are in Google's non-sensitive tier. */
export const SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive.appdata',
];
