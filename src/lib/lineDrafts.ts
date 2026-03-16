export const LINE_STATUS_OPTIONS = ['利用中', '解約予定'] as const;

export type LineStatus = (typeof LINE_STATUS_OPTIONS)[number];

export type LineDraft = {
  id: string;
  lineName: string;
  carrier: string;
  status: LineStatus;
  memo: string;
  nextReviewDate: string;
  createdAt: string;
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

export interface LineDraftStore {
  load(): LineDraft[];
  save(drafts: LineDraft[]): void;
}

class LocalStorageLineDraftStore implements LineDraftStore {
  load(): LineDraft[] {
    if (typeof window === 'undefined') {
      return [];
    }

    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);

      if (!raw) {
        return [];
      }

      const parsed: unknown = JSON.parse(raw);

      if (!Array.isArray(parsed)) {
        return [];
      }

      return parsed
        .map(toLineDraft)
        .filter((draft): draft is LineDraft => draft !== null)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    } catch (error) {
      console.error('failed to load line drafts', error);
      return [];
    }
  }

  save(drafts: LineDraft[]): void {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts));
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
