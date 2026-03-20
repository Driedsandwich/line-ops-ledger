export const LINE_TYPE_OPTIONS = ['音声SIM', 'データSIM', 'ホームルーター', '光回線'] as const;
export type LineType = (typeof LINE_TYPE_OPTIONS)[number];

export const LINE_STATUS_OPTIONS = ['利用中', '解約予定'] as const;
export type LineStatus = (typeof LINE_STATUS_OPTIONS)[number];

export const DEFAULT_LINE_TYPE: LineType = '音声SIM';

export type LineDraft = {
  id: string;
  lineName: string;
  carrier: string;
  lineType: LineType;
  monthlyCost: number | null;
  last4: string;
  contractHolderNote: string;
  contractStartDate: string;
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

type LineDraftInput = {
  lineName: string;
  carrier: string;
  lineType: LineType;
  monthlyCost: number | null;
  last4: string;
  contractHolderNote: string;
  contractStartDate?: string;
  contractHolder?: string;
  serviceUser?: string;
  paymentMethod?: string;
  planName?: string;
  deviceName?: string;
  status: LineStatus;
  memo: string;
  nextReviewDate: string;
};

const STORAGE_KEY = 'line-ops-ledger.lines';
const SCHEMA_VERSION = 2;

function createId(): string {
  return `line_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function isLineType(value: string): value is LineType {
  return (LINE_TYPE_OPTIONS as readonly string[]).includes(value);
}

function isLineStatus(value: string): value is LineStatus {
  return (LINE_STATUS_OPTIONS as readonly string[]).includes(value);
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

  return trimmed;
}

function normalizeLineDraft(input: Partial<LineDraft> & { lineName: string; carrier: string }): LineDraft | null {
  const lineName = input.lineName.trim();
  const carrier = input.carrier.trim();
  const lineType = isLineType(String(input.lineType ?? '')) ? (input.lineType as LineType) : DEFAULT_LINE_TYPE;
  const monthlyCost = normalizeMonthlyCost(input.monthlyCost ?? null);
  const last4 = normalizeLast4(input.last4);
  const contractHolderNote = (input.contractHolderNote ?? '').trim();
  const contractStartDate = normalizeReviewDate(input.contractStartDate);
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

function buildEnvelope(items: LineDraft[]): LineDraftEnvelope {
  return {
    schemaVersion: SCHEMA_VERSION,
    updatedAt: new Date().toISOString(),
    items,
  };
}

function parseDrafts(raw: string | null): LineDraft[] {
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
          return normalizeLineDraft(item as Partial<LineDraft> & { lineName: string; carrier: string });
        })
        .filter((item): item is LineDraft => Boolean(item));
    }

    if (parsed && typeof parsed === 'object' && Array.isArray((parsed as LineDraftEnvelope).items)) {
      return (parsed as LineDraftEnvelope).items
        .map((item) => normalizeLineDraft(item))
        .filter((item): item is LineDraft => Boolean(item));
    }
  } catch {
    return [];
  }

  return [];
}

function readDrafts(): LineDraft[] {
  if (typeof window === 'undefined') {
    return [];
  }
  return parseDrafts(window.localStorage.getItem(STORAGE_KEY));
}

function writeDrafts(items: LineDraft[]): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(buildEnvelope(items)));
}

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

export const lineDraftStore = {
  load(): LineDraft[] {
    return readDrafts();
  },
  save(items: LineDraft[]): void {
    writeDrafts(items);
  },
  exportJson(): string {
    return JSON.stringify(buildEnvelope(readDrafts()), null, 2);
  },
  importJson(raw: string): LineDraft[] {
    const items = parseDrafts(raw);
    writeDrafts(items);
    return items;
  },
  getMetadata(): { schemaVersion: number; itemCount: number; updatedAt: string | null; storageFormat: string } {
    if (typeof window === 'undefined') {
      return { schemaVersion: SCHEMA_VERSION, itemCount: 0, updatedAt: null, storageFormat: 'json-envelope' };
    }

    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { schemaVersion: SCHEMA_VERSION, itemCount: 0, updatedAt: null, storageFormat: 'json-envelope' };
    }

    try {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === 'object' && Array.isArray((parsed as LineDraftEnvelope).items)) {
        return {
          schemaVersion: Number((parsed as LineDraftEnvelope).schemaVersion ?? SCHEMA_VERSION),
          itemCount: (parsed as LineDraftEnvelope).items.length,
          updatedAt: typeof (parsed as LineDraftEnvelope).updatedAt === 'string' ? (parsed as LineDraftEnvelope).updatedAt : null,
          storageFormat: 'json-envelope',
        };
      }
      if (Array.isArray(parsed)) {
        return {
          schemaVersion: 0,
          itemCount: parsed.length,
          updatedAt: null,
          storageFormat: 'json-array-legacy',
        };
      }
    } catch {
      return { schemaVersion: SCHEMA_VERSION, itemCount: 0, updatedAt: null, storageFormat: 'unknown' };
    }

    return { schemaVersion: SCHEMA_VERSION, itemCount: 0, updatedAt: null, storageFormat: 'unknown' };
  },
};
