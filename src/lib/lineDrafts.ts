export const LINE_STATUS_OPTIONS = ['利用中', '解約予定'] as const;
export const CURRENT_LINE_DRAFT_SCHEMA_VERSION = 2;

export type LineStatus = (typeof LINE_STATUS_OPTIONS)[number];
export type LineDraftStorageFormat = 'empty' | 'legacy-array' | 'versioned-envelope' | 'invalid-data';

export type LineDraft = {
  id: string;
  lineName: string;
  carrier: string;
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

function toLineDraft(value: unknown): LineDraft | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = typeof value.id === 'string' ? value.id : null;
  const lineName = typeof value.lineName === 'string' ? value.lineName : null;
  const carrier = typeof value.carrier === 'string' ? value.carrier : null;
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
    status,
    memo,
    nextReviewDate,
    createdAt,
  };
}

function readStorageSnapshot(): StorageSnapshot {
  if (typeof window === 'undefined') {
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

  const raw = window.localStorage.getItem(STORAGE_KEY);

  if (!raw) {
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

  try {
    const parsed: unknown = JSON.parse(raw);

    if (Array.isArray(parsed)) {
      const drafts = parsed
        .map(toLineDraft)
        .filter((draft): draft is LineDraft => draft !== null)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

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
      const items = parsed.items as unknown[];
      const drafts = items
        .map(toLineDraft)
        .filter((draft): draft is LineDraft => draft !== null)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      const schemaVersion = typeof parsed.schemaVersion === 'number' ? parsed.schemaVersion : CURRENT_LINE_DRAFT_SCHEMA_VERSION;
      const updatedAt = typeof parsed.updatedAt === 'string' ? parsed.updatedAt : null;

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
}

export const lineDraftStore: LineDraftStore = new LocalStorageLineDraftStore();

export function createLineDraft(input: {
  lineName: string;
  carrier: string;
  status: LineStatus;
  memo: string;
  nextReviewDate: string;
}): LineDraft {
  return {
    id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}`,
    lineName: input.lineName,
    carrier: input.carrier,
    status: input.status,
    memo: input.memo,
    nextReviewDate: normalizeReviewDate(input.nextReviewDate),
    createdAt: new Date().toISOString(),
  };
}

export function updateLineDraft(
  draft: LineDraft,
  input: { lineName: string; carrier: string; status: LineStatus; memo: string; nextReviewDate: string },
): LineDraft {
  return {
    ...draft,
    lineName: input.lineName,
    carrier: input.carrier,
    status: input.status,
    memo: input.memo,
    nextReviewDate: normalizeReviewDate(input.nextReviewDate),
  };
}
