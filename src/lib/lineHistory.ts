export type LineHistoryStatus = '利用中' | '解約予定' | '解約済み' | 'MNP転出済み';

export type LineHistoryEntry = {
  id: string;
  phoneNumber: string;
  carrier: string;
  status: LineHistoryStatus;
  contractStartDate: string;
  contractEndDate: string;
  memo: string;
  createdAt: string;
};

type HistoryEnvelope = {
  schemaVersion: number;
  updatedAt: string;
  items: LineHistoryEntry[];
};

const STORAGE_KEY = 'line-ops-ledger.line-history';
const SCHEMA_VERSION = 1;

export const LINE_HISTORY_STATUS_OPTIONS: LineHistoryStatus[] = ['利用中', '解約予定', '解約済み', 'MNP転出済み'];

function createId(): string {
  return `history_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeDate(value: string): string {
  if (!value) {
    return '';
  }

  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return '';
  }

  const date = new Date(`${trimmed}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return trimmed;
}

function normalizePhoneNumber(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 11) {
    return '';
  }
  return digits;
}

function isHistoryStatus(value: string): value is LineHistoryStatus {
  return LINE_HISTORY_STATUS_OPTIONS.includes(value as LineHistoryStatus);
}

function normalizeEntry(input: Partial<LineHistoryEntry> & { phoneNumber: string; carrier: string }): LineHistoryEntry | null {
  const phoneNumber = normalizePhoneNumber(input.phoneNumber ?? '');
  const carrier = (input.carrier ?? '').trim();
  const status = input.status && isHistoryStatus(input.status) ? input.status : '利用中';
  const contractStartDate = normalizeDate(input.contractStartDate ?? '');
  const contractEndDate = normalizeDate(input.contractEndDate ?? '');
  const memo = (input.memo ?? '').trim();
  const createdAt = input.createdAt && !Number.isNaN(new Date(input.createdAt).getTime()) ? input.createdAt : new Date().toISOString();

  if (!phoneNumber || !carrier || !contractStartDate) {
    return null;
  }

  return {
    id: input.id ?? createId(),
    phoneNumber,
    carrier,
    status,
    contractStartDate,
    contractEndDate,
    memo,
    createdAt,
  };
}

function parseEnvelope(raw: string | null): LineHistoryEntry[] {
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;

    if (Array.isArray(parsed)) {
      return parsed
        .map((item) => {
          if (!item || typeof item !== 'object') {
            return null;
          }
          return normalizeEntry(item as Partial<LineHistoryEntry> & { phoneNumber: string; carrier: string });
        })
        .filter((item): item is LineHistoryEntry => Boolean(item));
    }

    if (parsed && typeof parsed === 'object' && Array.isArray((parsed as HistoryEnvelope).items)) {
      return (parsed as HistoryEnvelope).items
        .map((item) => normalizeEntry(item))
        .filter((item): item is LineHistoryEntry => Boolean(item));
    }

    return [];
  } catch {
    return [];
  }
}

function buildEnvelope(items: LineHistoryEntry[]): HistoryEnvelope {
  return {
    schemaVersion: SCHEMA_VERSION,
    updatedAt: new Date().toISOString(),
    items,
  };
}

function readStorage(): LineHistoryEntry[] {
  if (typeof window === 'undefined') {
    return [];
  }
  return parseEnvelope(window.localStorage.getItem(STORAGE_KEY));
}

function writeStorage(items: LineHistoryEntry[]): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(buildEnvelope(items)));
}

export function createLineHistoryEntry(input: {
  phoneNumber: string;
  carrier: string;
  status: LineHistoryStatus;
  contractStartDate: string;
  contractEndDate: string;
  memo: string;
}): LineHistoryEntry {
  const normalized = normalizeEntry(input);
  if (!normalized) {
    throw new Error('invalid line history entry');
  }
  return normalized;
}

export const lineHistoryStore = {
  load(): LineHistoryEntry[] {
    return readStorage();
  },
  save(items: LineHistoryEntry[]): void {
    writeStorage(items);
  },
  exportJson(): string {
    return JSON.stringify(buildEnvelope(readStorage()), null, 2);
  },
  importJson(raw: string): LineHistoryEntry[] {
    const items = parseEnvelope(raw);
    writeStorage(items);
    return items;
  },
};
