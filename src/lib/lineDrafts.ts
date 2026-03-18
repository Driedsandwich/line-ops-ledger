export const LINE_STATUS_OPTIONS = ['利用中', '解約予定'] as const;
export const LINE_TYPE_OPTIONS = ['音声SIM', 'データSIM', 'ホームルーター', '光回線', '未分類'] as const;
export const DEFAULT_LINE_TYPE = '未分類';
export const CURRENT_LINE_DRAFT_SCHEMA_VERSION = 3;
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
  last4: string;
  contractHolderNote: string;
  status: LineStatus;
  memo: string;
  nextReviewDate: string;
  createdAt: string;
};

type LineDraftEnvelope = {
  schemaVersion: number;
  updatedAt: string;
  items: LineDraft[];
};

export type LineDraftStorageInfo = {
  schemaVersion: number | null;
  itemCount: number;
  updatedAt: string | null;
  format: LineDraftStorageFormat;
};

export type ImportBackupResult = {
  importedCount: number;
};

export type LineDraftStore = {
  load: () => LineDraft[];
  save: (drafts: LineDraft[]) => void;
  ensureCurrentVersion: () => void;
  getInfo: () => LineDraftStorageInfo;
  exportBackupJson: () => string;
  buildBackupFilename: () => string;
  importBackupJson: (raw: string) => ImportBackupResult;
};

const STORAGE_KEY = 'line-ops-ledger.line-drafts';
const REVIEW_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const LAST4_PATTERN = /^\d{4}$/;

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

export function normalizeLast4(value: string): string {
  const digits = value.replace(/\D/g, '').slice(-4);
  return LAST4_PATTERN.test(digits) ? digits : '';
}

function toLineDraft(value: unknown): LineDraft | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = typeof value.id === 'string' ? value.id : null;
  const lineName = typeof value.lineName === 'string' ? value.lineName : null;
  const carrier = typeof value.carrier === 'string' ? value.carrier : null;
  const lineType = typeof value.lineType === 'string' && isLineType(value.lineType) ? value.lineType : DEFAULT_LINE_TYPE;
  const monthlyCost = normalizeMonthlyCost(
    typeof value.monthlyCost === 'number' || typeof value.monthlyCost === 'string' ? value.monthlyCost : null,
  );
  const last4 = typeof value.last4 === 'string' ? normalizeLast4(value.last4) : '';
  const contractHolderNote = typeof value.contractHolderNote === 'string' ? value.contractHolderNote : '';
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
    last4,
    contractHolderNote,
    status,
    memo,
    nextReviewDate,
    createdAt,
  };
}

function toEnvelope(value: unknown): LineDraftEnvelope | null {
  if (!isRecord(value)) {
    return null;
  }

  const schemaVersion = typeof value.schemaVersion === 'number' ? value.schemaVersion : null;
  const updatedAt = typeof value.updatedAt === 'string' ? value.updatedAt : null;
  const items = Array.isArray(value.items) ? value.items.map(toLineDraft).filter((item): item is LineDraft => item != null) : null;

  if (schemaVersion == null || !updatedAt || items == null) {
    return null;
  }

  return {
    schemaVersion,
    updatedAt,
    items,
  };
}

function createEnvelope(drafts: LineDraft[]): LineDraftEnvelope {
  return {
    schemaVersion: CURRENT_LINE_DRAFT_SCHEMA_VERSION,
    updatedAt: new Date().toISOString(),
    items: drafts,
  };
}

function readRawStorage(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  return window.localStorage.getItem(STORAGE_KEY);
}

function writeEnvelope(drafts: LineDraft[]): void {
  if (typeof window === 'undefined') {
    return;
  }

  const envelope = createEnvelope(drafts);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(envelope));
}

function parseStoredDrafts(raw: string | null): { drafts: LineDraft[]; info: LineDraftStorageInfo } {
  if (!raw) {
    return {
      drafts: [],
      info: {
        schemaVersion: CURRENT_LINE_DRAFT_SCHEMA_VERSION,
        itemCount: 0,
        updatedAt: null,
        format: 'empty',
      },
    };
  }

  try {
    const parsed: unknown = JSON.parse(raw);

    if (Array.isArray(parsed)) {
      const drafts = parsed.map(toLineDraft).filter((item): item is LineDraft => item != null);
      return {
        drafts,
        info: {
          schemaVersion: null,
          itemCount: drafts.length,
          updatedAt: null,
          format: 'legacy-array',
        },
      };
    }

    const envelope = toEnvelope(parsed);
    if (envelope) {
      return {
        drafts: envelope.items,
        info: {
          schemaVersion: envelope.schemaVersion,
          itemCount: envelope.items.length,
          updatedAt: envelope.updatedAt,
          format: 'versioned-envelope',
        },
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
    };
  } catch {
    return {
      drafts: [],
      info: {
        schemaVersion: null,
        itemCount: 0,
        updatedAt: null,
        format: 'invalid-data',
      },
    };
  }
}

class LocalStorageLineDraftStore implements LineDraftStore {
  load(): LineDraft[] {
    const { drafts } = parseStoredDrafts(readRawStorage());
    return drafts;
  }

  save(drafts: LineDraft[]): void {
    writeEnvelope(drafts);
  }

  ensureCurrentVersion(): void {
    const raw = readRawStorage();
    const parsed = parseStoredDrafts(raw);

    if (parsed.info.format !== 'versioned-envelope' || parsed.info.schemaVersion !== CURRENT_LINE_DRAFT_SCHEMA_VERSION) {
      writeEnvelope(parsed.drafts);
    }
  }

  getInfo(): LineDraftStorageInfo {
    return parseStoredDrafts(readRawStorage()).info;
  }

  exportBackupJson(): string {
    return JSON.stringify(createEnvelope(this.load()), null, 2);
  }

  buildBackupFilename(): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    return `${LINE_DRAFT_BACKUP_FILENAME_PREFIX}-${timestamp}.json`;
  }

  importBackupJson(raw: string): ImportBackupResult {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error('JSON バックアップの形式が不正です。');
    }

    let drafts: LineDraft[];
    if (Array.isArray(parsed)) {
      drafts = parsed.map(toLineDraft).filter((item): item is LineDraft => item != null);
    } else {
      const envelope = toEnvelope(parsed);
      if (!envelope) {
        throw new Error('JSON バックアップの形式が不正です。');
      }
      drafts = envelope.items;
    }

    writeEnvelope(drafts);
    return { importedCount: drafts.length };
  }
}

export const lineDraftStore: LineDraftStore = new LocalStorageLineDraftStore();

export function createLineDraft(input: {
  lineName: string;
  carrier: string;
  lineType: LineType;
  monthlyCost: number | null;
  last4: string;
  contractHolderNote: string;
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
    last4: normalizeLast4(input.last4),
    contractHolderNote: input.contractHolderNote,
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
    last4: string;
    contractHolderNote: string;
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
    last4: normalizeLast4(input.last4),
    contractHolderNote: input.contractHolderNote,
    status: input.status,
    memo: input.memo,
    nextReviewDate: normalizeReviewDate(input.nextReviewDate),
  };
}
