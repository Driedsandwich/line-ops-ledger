export const LINE_STATUS_OPTIONS = ['利用中', '解約予定'] as const;
export const LINE_TYPE_OPTIONS = ['音声SIM', 'データSIM', 'ホームルーター', '光回線', '未分類'] as const;
export const DEFAULT_LINE_TYPE = '未分類';
export const CURRENT_LINE_DRAFT_SCHEMA_VERSION = 2;
export const LINE_DRAFT_BACKUP_FILENAME_PREFIX = 'line-ops-ledger-backup';

export type LineStatus = (typeof LINE_STATUS_OPTIONS)[number];
export type LineType = (typeof LINE_TYPE_OPTIONS)[number];
export type LineDraftStorageFormat = 'empty' | 'legacy-array' | 'versioned-envelope' | 'invalid-data';

export type LineDraft = {
  id: string;
  lineName: string;
  carrier: string;
  lineType: LineType;
  monthlyCost: number | null;
  status: LineStatus;
  memo: string;
  nextReviewDate: string;
  createdAt: string;
};

export type LineDraftStorageInfo = {
  schemaVersion: number | null;
  itemCount: number;
  updatedAt: string | null;
  format: LineDraftStorageFormat;
};

type LineDraftStorageEnvelope = {
  schemaVersion: number;
  updatedAt: string;
  items: LineDraft[];
};

type StorageSnapshot = {
  drafts: LineDraft[];
  info: LineDraftStorageInfo;
  needsMigration: boolean;
};

const STORAGE_KEY = 'line-ops-ledger.line-drafts';
const REVIEW_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isLineStatus(value: string): value is LineStatus {
  return LINE_STATUS_OPTIONS.includes(value as LineStatus);
}

function isLineType(value: string): value is LineType {
  return LINE_TYPE_OPTIONS.includes(value as LineType);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function normalizeReviewDate(value: string): string {
  if (!REVIEW_DATE_PATTERN.test(value)) {
    return '';
  }

  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const [year, month, day] = value.split('-').map((part) => Number(part));
  const isSameDate =
    date.getFullYear() === year && date.getMonth() + 1 === month && date.getDate() === day;

  return isSameDate ? value : '';
}

export function normalizeMonthlyCost(value: string | number | null | undefined): number | null {
  if (value == null || value === '') {
    return null;
  }

  const numberValue = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numberValue) || numberValue < 0 || !Number.isInteger(numberValue)) {
    return null;
  }

  return numberValue;
}

function toLineDraft(value: unknown): LineDraft | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = typeof value.id === 'string' ? value.id : null;
  const lineName = typeof value.lineName === 'string' ? value.lineName : null;
  const carrier = typeof value.carrier === 'string' ? value.carrier : null;
  const lineType = typeof value.lineType === 'string' && isLineType(value.lineType) ? value.lineType : DEFAULT_LINE_TYPE;
  const monthlyCost = normalizeMonthlyCost(typeof value.monthlyCost === 'number' || typeof value.monthlyCost === 'string' ? value.monthlyCost : null);
  const status = typeof value.status === 'string' && isLineStatus(value.status) ? value.status : null;
  const memo = typeof value.memo === 'string' ? value.memo : '';
  const nextReviewDate = typeof value.nextReviewDate === 'string' ? normalizeReviewDate(value.nextReviewDate) : '';
  const createdAt = typeof value.createdAt === 'string' ? value.createdAt : null;

  if (!id || !lineName || !carrier || !status || !createdAt) {
    return null;
  }

  return {
    id,
    lineName,
    carrier,
    lineType,
    monthlyCost,
    status,
    memo,
    nextReviewDate,
    createdAt,
  };
}

function createEmptySnapshot(): StorageSnapshot {
  return {
    drafts: [],
    info: {
      schemaVersion: CURRENT_LINE_DRAFT_SCHEMA_VERSION,
      itemCount: 0,
      updatedAt: null,
      format: 'empty',
    },
    needsMigration: false,
  };
}

function toEnvelope(value: unknown): LineDraftStorageEnvelope | null {
  if (Array.isArray(value)) {
    const drafts = value
      .map(toLineDraft)
      .filter((draft): draft is LineDraft => draft !== null)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    return {
      schemaVersion: 1,
      updatedAt: '',
      items: drafts,
    };
  }

  if (!isRecord(value) || !Array.isArray(value.items)) {
    return null;
  }

  const items = value.items as unknown[];
  const drafts = items
    .map(toLineDraft)
    .filter((draft): draft is LineDraft => draft !== null)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const schemaVersion = typeof value.schemaVersion === 'number' ? value.schemaVersion : CURRENT_LINE_DRAFT_SCHEMA_VERSION;
  const updatedAt = typeof value.updatedAt === 'string' ? value.updatedAt : '';

  return {
    schemaVersion,
    updatedAt,
    items: drafts,
  };
}

function readStorageSnapshot(): StorageSnapshot {
  if (typeof window === 'undefined') {
    return createEmptySnapshot();
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);

  if (!raw) {
    return createEmptySnapshot();
  }

  try {
    const parsed: unknown = JSON.parse(raw);

    if (Array.isArray(parsed)) {
      const envelope = toEnvelope(parsed);
      const drafts = envelope?.items ?? [];
      return {
        drafts,
        info: {
          schemaVersion: 1,
          itemCount: drafts.length,
          updatedAt: null,
          format: 'legacy-array',
        },
        needsMigration: true,
      };
    }

    if (isRecord(parsed) && Array.isArray(parsed.items)) {
      const envelope = toEnvelope(parsed);
      const drafts = envelope?.items ?? [];
      const schemaVersion = envelope?.schemaVersion ?? CURRENT_LINE_DRAFT_SCHEMA_VERSION;
      const updatedAt = envelope?.updatedAt || null;

      return {
        drafts,
        info: {
          schemaVersion,
          itemCount: drafts.length,
          updatedAt,
          format: 'versioned-envelope',
        },
        needsMigration: schemaVersion !== CURRENT_LINE_DRAFT_SCHEMA_VERSION || !updatedAt,
      };
    }

    return {
      drafts: [],
      info: {
        schemaVersion: null,
        itemCount: 0,
        updatedAt: null,
        format: 'invalid-data',
      },
      needsMigration: false,
    };
  } catch (error) {
    console.error('failed to read line draft storage', error);
    return {
      drafts: [],
      info: {
        schemaVersion: null,
        itemCount: 0,
        updatedAt: null,
        format: 'invalid-data',
      },
      needsMigration: false,
    };
  }
}

function createEnvelope(drafts: LineDraft[]): LineDraftStorageEnvelope {
  return {
    schemaVersion: CURRENT_LINE_DRAFT_SCHEMA_VERSION,
    updatedAt: new Date().toISOString(),
    items: drafts,
  };
}

export interface LineDraftStore {
  load(): LineDraft[];
  save(drafts: LineDraft[]): void;
  getInfo(): LineDraftStorageInfo;
  ensureCurrentVersion(): void;
  exportBackupJson(): string;
  importBackupJson(raw: string): { importedCount: number };
  buildBackupFilename(): string;
}

class LocalStorageLineDraftStore implements LineDraftStore {
  load(): LineDraft[] {
    return readStorageSnapshot().drafts;
  }

  save(drafts: LineDraft[]): void {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(createEnvelope(drafts)));
  }

  getInfo(): LineDraftStorageInfo {
    return readStorageSnapshot().info;
  }

  ensureCurrentVersion(): void {
    const snapshot = readStorageSnapshot();

    if (snapshot.needsMigration) {
      this.save(snapshot.drafts);
    }
  }

  exportBackupJson(): string {
    const snapshot = readStorageSnapshot();
    return JSON.stringify(createEnvelope(snapshot.drafts), null, 2);
  }

  importBackupJson(raw: string): { importedCount: number } {
    let parsed: unknown;

    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error('JSON の読み取りに失敗しました。');
    }

    const envelope = toEnvelope(parsed);
    if (!envelope) {
      throw new Error('バックアップ形式が不正です。');
    }

    this.save(envelope.items);
    return { importedCount: envelope.items.length };
  }

  buildBackupFilename(): string {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    return `${LINE_DRAFT_BACKUP_FILENAME_PREFIX}-${stamp}.json`;
  }
}

export const lineDraftStore: LineDraftStore = new LocalStorageLineDraftStore();

export function createLineDraft(input: {
  lineName: string;
  carrier: string;
  lineType: LineType;
  monthlyCost: number | null;
  status: LineStatus;
  memo: string;
  nextReviewDate: string;
}): LineDraft {
  return {
    id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}`,
    lineName: input.lineName,
    carrier: input.carrier,
    lineType: input.lineType,
    monthlyCost: input.monthlyCost,
    status: input.status,
    memo: input.memo,
    nextReviewDate: normalizeReviewDate(input.nextReviewDate),
    createdAt: new Date().toISOString(),
  };
}

export function updateLineDraft(
  draft: LineDraft,
  input: {
    lineName: string;
    carrier: string;
    lineType: LineType;
    monthlyCost: number | null;
    status: LineStatus;
    memo: string;
    nextReviewDate: string;
  },
): LineDraft {
  return {
    ...draft,
    lineName: input.lineName,
    carrier: input.carrier,
    lineType: input.lineType,
    monthlyCost: input.monthlyCost,
    status: input.status,
    memo: input.memo,
    nextReviewDate: normalizeReviewDate(input.nextReviewDate),
  };
}
