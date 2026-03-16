export const LINE_STATUS_OPTIONS = ['利用中', '解約予定'] as const;

export type LineStatus = (typeof LINE_STATUS_OPTIONS)[number];

export type LineDraft = {
  id: string;
  lineName: string;
  carrier: string;
  status: LineStatus;
  memo: string;
  createdAt: string;
};

const STORAGE_KEY = 'line-ops-ledger.line-drafts';

function isLineStatus(value: string): value is LineStatus {
  return LINE_STATUS_OPTIONS.includes(value as LineStatus);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
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
    createdAt,
  };
}

export function loadLineDrafts(): LineDraft[] {
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

export function saveLineDrafts(drafts: LineDraft[]): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts));
}

export function createLineDraft(input: {
  lineName: string;
  carrier: string;
  status: LineStatus;
  memo: string;
}): LineDraft {
  return {
    id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}`,
    lineName: input.lineName,
    carrier: input.carrier,
    status: input.status,
    memo: input.memo,
    createdAt: new Date().toISOString(),
  };
}
