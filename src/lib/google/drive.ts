import { gapi, ApiError } from './api';
import { APP_PROPERTY, SPREADSHEET_TITLE } from '../sheets/schema';

const DRIVE = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const CONFIG_NAME = 'config.json';

export interface AppConfig {
  spreadsheetId: string;
  booksSheetId?: number;
  schemaVersion?: number;
}

interface FileList {
  files: { id: string; name: string; createdTime?: string; trashed?: boolean }[];
}

/** Read config.json from the hidden app-data folder (only this app can see it). */
export async function readAppConfig(): Promise<{ fileId: string; config: AppConfig } | null> {
  const q = encodeURIComponent(`name='${CONFIG_NAME}'`);
  const list = await gapi<FileList>(`${DRIVE}/files?spaces=appDataFolder&q=${q}&fields=files(id,name)&pageSize=10`);
  const file = list.files[0];
  if (!file) return null;
  try {
    const text = await gapi<string>(`${DRIVE}/files/${file.id}?alt=media`, { text: true });
    const config = JSON.parse(text) as AppConfig;
    if (!config?.spreadsheetId) return null;
    return { fileId: file.id, config };
  } catch {
    return { fileId: file.id, config: { spreadsheetId: '' } };
  }
}

export async function writeAppConfig(config: AppConfig, existingFileId?: string): Promise<void> {
  const content = JSON.stringify(config);
  if (existingFileId) {
    await gapi(`${UPLOAD}/files/${existingFileId}?uploadType=media`, {
      method: 'PATCH',
      body: content,
      headers: { 'Content-Type': 'application/json' },
    });
    return;
  }
  const boundary = 'bl' + Math.random().toString(36).slice(2);
  const meta = { name: CONFIG_NAME, parents: ['appDataFolder'], mimeType: 'application/json' };
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n` +
    `--${boundary}\r\nContent-Type: application/json\r\n\r\n${content}\r\n--${boundary}--`;
  await gapi(`${UPLOAD}/files?uploadType=multipart&fields=id`, {
    method: 'POST',
    body,
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
  });
}

/** Spreadsheets this app created (drive.file can see them from any device). Oldest first. */
export async function findAppSpreadsheets(): Promise<FileList['files']> {
  const q = encodeURIComponent(
    `appProperties has { key='${APP_PROPERTY}' and value='1' } and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`,
  );
  const list = await gapi<FileList>(`${DRIVE}/files?q=${q}&fields=files(id,name,createdTime)&orderBy=createdTime&pageSize=20`);
  return list.files;
}

/** null if the file is gone, trashed or no longer accessible. */
export async function checkFile(id: string): Promise<{ id: string; name: string } | null> {
  try {
    const f = await gapi<{ id: string; name: string; trashed: boolean }>(`${DRIVE}/files/${id}?fields=id,name,trashed`);
    return f.trashed ? null : f;
  } catch (e) {
    if (e instanceof ApiError && (e.status === 404 || e.status === 403)) return null;
    throw e;
  }
}

/** Create the empty "Book Library" spreadsheet, tagged so we can find it again. */
export async function createSpreadsheetFile(): Promise<string> {
  const f = await gapi<{ id: string }>(`${DRIVE}/files?fields=id`, {
    method: 'POST',
    json: {
      name: SPREADSHEET_TITLE,
      mimeType: 'application/vnd.google-apps.spreadsheet',
      appProperties: { [APP_PROPERTY]: '1' },
    },
  });
  return f.id;
}

export async function getDriveUser(): Promise<{ email: string; name: string } | null> {
  try {
    const r = await gapi<{ user: { emailAddress?: string; displayName?: string } }>(`${DRIVE}/about?fields=user(emailAddress,displayName)`);
    return { email: r.user.emailAddress ?? '', name: r.user.displayName ?? '' };
  } catch {
    return null;
  }
}
