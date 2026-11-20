/**
 * Your side of sharing, using your own Google sign-in:
 * - turning "anyone with the code can view" on/off on your spreadsheet (Drive permissions),
 * - your display name (in the _meta tab, so friends can read it),
 * - your friend list (in a hidden _friends tab of your own sheet).
 * Only files this app created are touched (drive.file).
 */
import { gapi } from '../google/api';
import { batchGetValues, batchUpdate, getSheets } from '../google/sheets';
import { findTab, sheetTagRequest } from '../sheets/backend';
import { FRIENDS_TAB, quoteSheet } from '../sheets/schema';

const DRIVE = 'https://www.googleapis.com/drive/v3';

interface Permission {
  id: string;
  type: string;
  role: string;
}

async function anyonePermission(spreadsheetId: string): Promise<Permission | undefined> {
  const r = await gapi<{ permissions?: Permission[] }>(`${DRIVE}/files/${spreadsheetId}/permissions?fields=permissions(id,type,role)`);
  return r.permissions?.find((p) => p.type === 'anyone');
}

export async function isShared(spreadsheetId: string): Promise<boolean> {
  return Boolean(await anyonePermission(spreadsheetId));
}

/** Anyone with the link (= the friend code) can view. Not findable by search. */
export async function startSharing(spreadsheetId: string): Promise<void> {
  if (await anyonePermission(spreadsheetId)) return;
  await gapi(`${DRIVE}/files/${spreadsheetId}/permissions?fields=id&sendNotificationEmail=false`, {
    method: 'POST',
    json: { type: 'anyone', role: 'reader', allowFileDiscovery: false },
  });
}

export async function stopSharing(spreadsheetId: string): Promise<void> {
  const p = await anyonePermission(spreadsheetId);
  if (p) await gapi(`${DRIVE}/files/${spreadsheetId}/permissions/${p.id}`, { method: 'DELETE' });
}

// ---------- _meta values ----------

export function metaValue(rows: unknown[][], key: string): string {
  const r = rows.find((x) => String(x?.[0] ?? '').trim() === key);
  return r ? String(r[1] ?? '').trim() : '';
}

async function metaTab(spreadsheetId: string) {
  const { sheets } = await getSheets(spreadsheetId);
  const meta = findTab(sheets, 'meta');
  if (!meta) throw new Error("Your sheet's _meta tab is missing. Reload the app to repair it.");
  return { sheets, meta };
}

export async function readMeta(spreadsheetId: string): Promise<unknown[][]> {
  const { meta } = await metaTab(spreadsheetId);
  const [rows] = await batchGetValues(spreadsheetId, [`${quoteSheet(meta.properties.title)}!A1:B40`]);
  return rows ?? [];
}

export async function writeMetaValue(spreadsheetId: string, key: string, value: string): Promise<void> {
  const { meta } = await metaTab(spreadsheetId);
  const [rows = []] = await batchGetValues(spreadsheetId, [`${quoteSheet(meta.properties.title)}!A1:B40`]);
  let row = rows.findIndex((r) => String(r?.[0] ?? '').trim() === key);
  if (row < 0) row = Math.max(rows.length, 2);
  await batchUpdate(spreadsheetId, [
    {
      updateCells: {
        start: { sheetId: meta.properties.sheetId, rowIndex: row, columnIndex: 0 },
        rows: [{ values: [{ userEnteredValue: { stringValue: key } }, { userEnteredValue: { stringValue: value } }] }],
        fields: 'userEnteredValue',
      },
    },
  ]);
}

// ---------- _friends tab ----------

export interface Friend {
  code: string;
  name: string;
  added: string;
}

export function parseFriends(rows: unknown[][]): Friend[] {
  return rows
    .slice(1)
    .map((r) => ({ code: String(r?.[0] ?? '').trim(), name: String(r?.[1] ?? '').trim(), added: String(r?.[2] ?? '').trim() }))
    .filter((f) => /^[A-Za-z0-9_-]{20,}$/.test(f.code));
}

export async function readFriends(spreadsheetId: string): Promise<Friend[]> {
  const { sheets } = await getSheets(spreadsheetId);
  const tab = findTab(sheets, 'friends');
  if (!tab) return [];
  const [rows] = await batchGetValues(spreadsheetId, [`${quoteSheet(tab.properties.title)}!A1:C500`]);
  return parseFriends(rows ?? []);
}

export async function writeFriends(spreadsheetId: string, friends: Friend[]): Promise<void> {
  const { sheets } = await getSheets(spreadsheetId);
  let tab = findTab(sheets, 'friends');
  const requests: Record<string, unknown>[] = [];
  let sheetId: number;
  if (!tab) {
    const used = new Set(sheets.map((s) => s.properties.sheetId));
    sheetId = 900100;
    while (used.has(sheetId)) sheetId++;
    requests.push(
      { addSheet: { properties: { sheetId, title: FRIENDS_TAB, hidden: true, gridProperties: { rowCount: 500, columnCount: 3 } } } },
      sheetTagRequest(sheetId, 'friends'),
    );
  } else sheetId = tab.properties.sheetId;
  const str = (s: string) => ({ userEnteredValue: { stringValue: s } });
  requests.push({
    updateCells: {
      // Rewriting the whole range also clears rows of removed friends.
      range: { sheetId, startRowIndex: 0, endRowIndex: 500, startColumnIndex: 0, endColumnIndex: 3 },
      rows: [
        { values: [str('code'), str('name'), str('added')] },
        ...friends.map((f) => ({ values: [str(f.code), str(f.name), str(f.added)] })),
      ],
      fields: 'userEnteredValue',
    },
  });
  await batchUpdate(spreadsheetId, requests);
}

// ---------- codes and links ----------

/** A friend code is the spreadsheet id. Accepts a code, an app share link, or a Google Sheets link. */
export function codeFromInput(input: string): string {
  const s = input.trim();
  const fromApp = /[?&]add=([A-Za-z0-9_-]{20,})/.exec(s);
  if (fromApp) return fromApp[1];
  const fromSheets = /\/spreadsheets\/d\/([A-Za-z0-9_-]{20,})/.exec(s);
  if (fromSheets) return fromSheets[1];
  return /^[A-Za-z0-9_-]{20,}$/.test(s) ? s : '';
}

export function shareLink(code: string): string {
  return `${location.origin}${location.pathname}#/friends?add=${code}`;
}
