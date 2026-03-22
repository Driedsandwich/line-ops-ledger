export const LINE_HISTORY_STATUS_OPTIONS = ['利用中', '解約予定', '解約済み', 'MNP転出済み'] as const;
export const CURRENT_LINE_HISTORY_SCHEMA_VERSION = 2;

export type LineHistoryStatus = (typeof LINE_HISTORY_STATUS_OPTIONS)[number];

export type LineHistoryEntry = {
  id: string;
  phoneNumber: string;
  carrier: string;
  status: LineHistoryStatus;
  contractStartDate: string;
  contractEndDate: string;
  activityDate: string;
  activityType: string;
  activityMemo: string;
  memo: string;
  createdAt: string;
};

type LineHistoryEnvelope = {
  schemaVersion: number;
  updatedAt: string;
  items: LineHistoryEntry[];
};

type LineHistoryInput = {
  phoneNumber: string;
  carrier: string;
  status: LineHistoryStatus;
  contractStartDate: string;
  contractEndDate?: string;
  activityDate?: string;
  activityType?: string;
  activityMemo?: string;
  memo?: string;
};

export type LineHistoryStore = {
  load: () => LineHistoryEntry[];
  save: (entries: LineHistoryEntry[]) => void;
  exportJson: () => string;
  importJson: (raw: string) => LineHistoryEntry[];
};

const STORAGE_KEY = 'line-ops-ledger.line-history';

function createId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `line_history_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function isLineHistoryStatus(value: string): value is LineHistoryStatus {
  return LINE_HISTORY_STATUS_OPTIONS.includes(value as LineHistoryStatus);
}

function normalizeDate(value: string | null | undefined): string {
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

function normalizePhoneNumber(value: string | null | undefined): string {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits.length >= 10 && digits.length <= 11 ? digits : '';
}

function normalizeLineHistoryEntry(input: Partial<LineHistoryEntry>): LineHistoryEntry | null {
  const phoneNumber = normalizePhoneNumber(input.phoneNumber);
  const carrier = String(input.carrier ?? '').trim();
  const status = isLineHistoryStatus(String(input.status ?? '')) ? (input.status as LineHistoryStatus) : null;
  const contractStartDate = normalizeDate(input.contractStartDate);
  const contractEndDate = normalizeDate(input.contractEndDate);
  const activityDate = normalizeDate(input.activityDate);
  const activityType = String(input.activityType ?? '').trim();
  const activityMemo = String(input.activityMemo ?? '').trim();
  const memo = String(input.memo ?? '').trim();
  const createdAt = String(input.createdAt ?? '').trim() || new Date().toISOString();
  const id = String(input.id ?? '').trim() || createId();

  if (!phoneNumber || !carrier || !status || !contractStartDate) {
    return null;
  }

  return {
    id,
    phoneNumber,
    carrier,
    status,
    contractStartDate,
    contractEndDate,
    activityDate,
    activityType,
    activityMemo,
    memo,
    createdAt,
  };
}

function parseStoredEntries(raw: string | null): LineHistoryEntry[] {
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;

    if (Array.isArray(parsed)) {
      return parsed
        .map((item) => normalizeLineHistoryEntry(item as Partial<LineHistoryEntry>))
        .filter((item): item is LineHistoryEntry => item != null);
    }

    if (parsed && typeof parsed === 'object' && Array.isArray((parsed as LineHistoryEnvelope).items)) {
      return (parsed as LineHistoryEnvelope).items
        .map((item) => normalizeLineHistoryEntry(item as Partial<LineHistoryEntry>))
        .filter((item): item is LineHistoryEntry => item != null);
    }

    return [];
  } catch {
    return [];
  }
}

function saveEntries(entries: LineHistoryEntry[]): void {
  if (typeof window === 'undefined') {
    return;
  }

  const envelope: LineHistoryEnvelope = {
    schemaVersion: CURRENT_LINE_HISTORY_SCHEMA_VERSION,
    updatedAt: new Date().toISOString(),
    items: entries,
  };

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(envelope));
}

export function createLineHistoryEntry(input: LineHistoryInput): LineHistoryEntry {
  const next = normalizeLineHistoryEntry({
    id: createId(),
    phoneNumber: input.phoneNumber,
    carrier: input.carrier,
    status: input.status,
    contractStartDate: input.contractStartDate,
    contractEndDate: input.contractEndDate,
    activityDate: input.activityDate,
    activityType: input.activityType,
    activityMemo: input.activityMemo,
    memo: input.memo,
    createdAt: new Date().toISOString(),
  });

  if (!next) {
    throw new Error('INVALID_LINE_HISTORY_ENTRY');
  }

  return next;
}

export const lineHistoryStore: LineHistoryStore = {
  load(): LineHistoryEntry[] {
    if (typeof window === 'undefined') {
      return [];
    }

    return parseStoredEntries(window.localStorage.getItem(STORAGE_KEY));
  },

  save(entries: LineHistoryEntry[]): void {
    saveEntries(entries);
  },

  exportJson(): string {
    return JSON.stringify(this.load(), null, 2);
  },

  importJson(raw: string): LineHistoryEntry[] {
    const entries = parseStoredEntries(raw);
    saveEntries(entries);
    return entries;
  },
};
