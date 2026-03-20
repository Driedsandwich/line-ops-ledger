export const LINE_STATUS_OPTIONS = ['利用中', '解約予定', '解約済み', 'MNP転出済み'] as const;
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
  contractStartDate: string;
  contractEndDate: string;
  contractHolder: string;
  serviceUser: string;
  paymentMethod: string;
  planName: string;
  deviceName: string;
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
  exportJson: () => string;
  importJson: (raw: string) => LineDraft[];
  getMetadata: () => { schemaVersion: number; itemCount: number; updatedAt: string | null; storageFormat: string };
};

type LineDraftInput = {
  lineName: string;
  carrier: string;
  lineType: LineType;
  monthlyCost: number | null;
  last4: string;
  contractHolderNote: string;
  contractStartDate?: string;
  contractEndDate?: string;
  contractHolder?: string;
  serviceUser?: string;
  paymentMethod?: string;
  planName?: string;
  deviceName?: string;
  status: LineStatus;
  memo: string;
  nextReviewDate: string;
};

const STORAGE_KEY = 'line-ops-ledger.line-drafts';

function isLineStatus(value: string): value is LineStatus {
  return LINE_STATUS_OPTIONS.includes(value as LineStatus);
}

function isLineType(value: string): value is LineType {
  return LINE_TYPE_OPTIONS.includes(value as LineType);
}

function createId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `line_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function normalizeReviewDate(value: string | null | undefined): string {
  if (!value) {
    return '';
  }

  const trimmed = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return '';
  }

  const date = new Date(`${trimmed}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const [year, month, day] = trimmed.split('-').map((part) => Number(part));
  const isSameDate =
    date.getFullYear() === year && date.getMonth() + 1 === month && date.getDate() === day;

  return isSameDate ? trimmed : '';
}

export function normalizeMonthlyCost(value: string | number | null | undefined): number | null {
  if (value == null || value === '') {
    return null;
  }

  const normalized = typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isInteger(normalized) || normalized < 0) {
    return null;
  }

  return normalized;
}

export function normalizeLast4(value: string | null | undefined): string {
  if (!value) {
    return '';
  }

  const digits = String(value).replace(/\D/g, '');
  return digits.length === 4 ? digits : '';
}

function normalizeLineDraft(input: Partial<LineDraft> & { lineName: string; carrier: string }): LineDraft | null {
  const lineName = input.lineName.trim();
  const carrier = input.carrier.trim();
  const lineType = isLineType(String(input.lineType ?? '')) ? (input.lineType as LineType) : DEFAULT_LINE_TYPE;
  const monthlyCost = normalizeMonthlyCost(input.monthlyCost ?? null);
  const last4 = normalizeLast4(input.last4);
  const contractHolderNote = (input.contractHolderNote ?? '').trim();
  const contractStartDate = normalizeReviewDate(input.contractStartDate);
  const contractEndDate = normalizeReviewDate(input.contractEndDate);
  const contractHolder = (input.contractHolder ?? '').trim();
  const serviceUser = (input.serviceUser ?? '').trim();
  const paymentMethod = (input.paymentMethod ?? '').trim();
  const planName = (input.planName ?? '').trim();
  const deviceName = (input.deviceName ?? '').trim();
  const status = isLineStatus(String(input.status ?? '')) ? (input.status as LineStatus) : '利用中';
  const memo = (input.memo ?? '').trim();
  const nextReviewDate = normalizeReviewDate(input.nextReviewDate);
  const createdAt = input.createdAt && !Number.isNaN(new Date(input.createdAt).getTime()) ? input.createdAt : new Date().toISOString();

  if (!lineName || !carrier) {
    return null;
  }

  return {
    id: input.id ?? createId(),
    lineName,
    carrier,
    lineType,
    monthlyCost,
    last4,
    contractHolderNote,
    contractStartDate,
    contractEndDate,
    contractHolder,
    serviceUser,
    paymentMethod,
    planName,
    deviceName,
    status,
    memo,
    nextReviewDate,
    createdAt,
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

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(createEnvelope(drafts)));
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
    const parsed = JSON.parse(raw) as unknown;

    if (Array.isArray(parsed)) {
      const drafts = parsed
        .map((item) => {
          if (!item || typeof item !== 'object') {
            return null;
          }
          return normalizeLineDraft(item as Partial<LineDraft> & { lineName: string; carrier: string });
        })
        .filter((item): item is LineDraft => Boolean(item));

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

    if (parsed && typeof parsed === 'object' && Array.isArray((parsed as LineDraftEnvelope).items)) {
      const envelope = parsed as LineDraftEnvelope;
      const drafts = envelope.items
        .map((item) => normalizeLineDraft(item))
        .filter((item): item is LineDraft => Boolean(item));

      return {
        drafts,
        info: {
          schemaVersion: typeof envelope.schemaVersion === 'number' ? envelope.schemaVersion : null,
          itemCount: drafts.length,
          updatedAt: typeof envelope.updatedAt === 'string' ? envelope.updatedAt : null,
          format: 'versioned-envelope',
        },
      };
    }
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

class LocalStorageLineDraftStore implements LineDraftStore {
  load(): LineDraft[] {
    return parseStoredDrafts(readRawStorage()).drafts;
  }

  save(drafts: LineDraft[]): void {
    writeEnvelope(drafts);
  }

  ensureCurrentVersion(): void {
    const parsed = parseStoredDrafts(readRawStorage());
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

    let drafts: LineDraft[] = [];
    if (Array.isArray(parsed)) {
      drafts = parsed
        .map((item) => {
          if (!item || typeof item !== 'object') {
            return null;
          }
          return normalizeLineDraft(item as Partial<LineDraft> & { lineName: string; carrier: string });
        })
        .filter((item): item is LineDraft => Boolean(item));
    } else if (parsed && typeof parsed === 'object' && Array.isArray((parsed as LineDraftEnvelope).items)) {
      drafts = (parsed as LineDraftEnvelope).items
        .map((item) => normalizeLineDraft(item))
        .filter((item): item is LineDraft => Boolean(item));
    } else {
      throw new Error('JSON バックアップの形式が不正です。');
    }

    writeEnvelope(drafts);
    return { importedCount: drafts.length };
  }

  exportJson(): string {
    return this.exportBackupJson();
  }

  importJson(raw: string): LineDraft[] {
    this.importBackupJson(raw);
    return this.load();
  }

  getMetadata(): { schemaVersion: number; itemCount: number; updatedAt: string | null; storageFormat: string } {
    const info = this.getInfo();
    return {
      schemaVersion: info.schemaVersion ?? CURRENT_LINE_DRAFT_SCHEMA_VERSION,
      itemCount: info.itemCount,
      updatedAt: info.updatedAt,
      storageFormat: info.format,
    };
  }
}

export const lineDraftStore: LineDraftStore = new LocalStorageLineDraftStore();

export function createLineDraft(input: LineDraftInput): LineDraft {
  const normalized = normalizeLineDraft(input);
  if (!normalized) {
    throw new Error('invalid line draft');
  }
  return normalized;
}

export function updateLineDraft(draft: LineDraft, input: LineDraftInput): LineDraft {
  const normalized = normalizeLineDraft({
    ...draft,
    ...input,
    id: draft.id,
    createdAt: draft.createdAt,
  });

  if (!normalized) {
    throw new Error('invalid line draft');
  }

  return normalized;
}
