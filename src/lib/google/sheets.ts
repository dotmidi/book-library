import { gapi } from './api';

const SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets';

export interface DeveloperMetadata {
  metadataId?: number;
  metadataKey: string;
  metadataValue?: string;
  location?: {
    locationType?: string;
    sheetId?: number;
    dimensionRange?: { sheetId: number; dimension: 'ROWS' | 'COLUMNS'; startIndex: number; endIndex: number };
  };
}

export interface SheetProperties {
  sheetId: number;
  title: string;
  index: number;
  hidden?: boolean;
  gridProperties?: { rowCount?: number; columnCount?: number; frozenRowCount?: number };
}

export interface SheetInfo {
  properties: SheetProperties;
  developerMetadata?: DeveloperMetadata[];
  data?: {
    startColumn?: number;
    rowData?: { values?: { formattedValue?: string }[] }[];
    columnMetadata?: { developerMetadata?: DeveloperMetadata[] }[];
  }[];
}

export type Request = Record<string, unknown>;

export function getSheets(spreadsheetId: string): Promise<{ sheets: SheetInfo[] }> {
  const fields = encodeURIComponent('sheets(properties(sheetId,title,index,hidden,gridProperties(rowCount,columnCount)),developerMetadata(metadataId,metadataKey,metadataValue))');
  return gapi(`${SHEETS}/${spreadsheetId}?fields=${fields}`);
}

/**
 * Header row + column tags + properties of one tab, addressed by sheetId
 * (so it still works if the tab was renamed). One read request.
 */
export async function getHeaderBySheetId(spreadsheetId: string, sheetId: number): Promise<SheetInfo | null> {
  const fields =
    'sheets(properties(sheetId,title,index,hidden,gridProperties(rowCount,columnCount)),developerMetadata(metadataId,metadataKey,metadataValue),' +
    'data(startColumn,rowData(values(formattedValue)),columnMetadata(developerMetadata(metadataId,metadataKey,metadataValue))))';
  const r = await gapi<{ sheets?: SheetInfo[] }>(`${SHEETS}/${spreadsheetId}:getByDataFilter?fields=${encodeURIComponent(fields)}`, {
    method: 'POST',
    json: {
      includeGridData: true,
      dataFilters: [{ gridRange: { sheetId, startRowIndex: 0, endRowIndex: 1 } }],
    },
  });
  return r.sheets?.find((s) => s.properties.sheetId === sheetId) ?? null;
}

export async function searchMetadata(spreadsheetId: string, keys: string[]): Promise<DeveloperMetadata[]> {
  const r = await gapi<{ matchedDeveloperMetadata?: { developerMetadata: DeveloperMetadata }[] }>(
    `${SHEETS}/${spreadsheetId}/developerMetadata:search`,
    { method: 'POST', json: { dataFilters: keys.map((metadataKey) => ({ developerMetadataLookup: { metadataKey } })) } },
  );
  return (r.matchedDeveloperMetadata ?? []).map((m) => m.developerMetadata);
}

export async function batchGetValues(spreadsheetId: string, ranges: string[]): Promise<unknown[][][]> {
  const params = new URLSearchParams({
    valueRenderOption: 'UNFORMATTED_VALUE',
    dateTimeRenderOption: 'SERIAL_NUMBER',
    majorDimension: 'ROWS',
  });
  for (const r of ranges) params.append('ranges', r);
  const res = await gapi<{ valueRanges?: { values?: unknown[][] }[] }>(`${SHEETS}/${spreadsheetId}/values:batchGet?${params}`);
  return (res.valueRanges ?? []).map((v) => v.values ?? []);
}

export async function batchUpdate(spreadsheetId: string, requests: Request[]): Promise<{ replies?: Record<string, unknown>[] }> {
  if (!requests.length) return {};
  return gapi(`${SHEETS}/${spreadsheetId}:batchUpdate`, { method: 'POST', json: { requests } });
}

export function sheetUrl(spreadsheetId: string): string {
  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
}

export function xlsxUrl(spreadsheetId: string): string {
  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=xlsx`;
}
