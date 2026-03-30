import { LINE_HISTORY_STATUS_OPTIONS, type LineHistoryStatus } from './lineHistory';

const STORAGE_KEY = 'line-ops-ledger.history-form-draft';

export type HistoryFormDraftActivityLog = {
  id: string;
  activityDate: string;
  activityType: string;
  activityMemo: string;
};

export type HistoryFormDraftPayload = {
  phoneNumber: string;
  carrier: string;
  status: LineHistoryStatus;
  contractStartDate: string;
  contractEndDate: string;
  activityLogs: HistoryFormDraftActivityLog[];
  memo: string;
  editingHistoryId: string | null;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isLineHistoryStatus(value: unknown): value is LineHistoryStatus {
  return typeof value === 'string' && (LINE_HISTORY_STATUS_OPTIONS as readonly string[]).includes(value);
}

function sanitizeActivityLog(value: unknown): HistoryFormDraftActivityLog | null {
  if (!isObject(value)) {
    return null;
  }

  const id = typeof value.id === 'string' && value.id.trim() ? value.id.trim() : '';
  if (!id) {
    return null;
  }

  return {
    id,
    activityDate: typeof value.activityDate === 'string' ? value.activityDate : '',
    activityType: typeof value.activityType === 'string' && value.activityType.trim() ? value.activityType.trim() : '利用実績確認',
    activityMemo: typeof value.activityMemo === 'string' ? value.activityMemo : '',
  };
}

function sanitizeHistoryFormDraft(value: unknown): HistoryFormDraftPayload | null {
  if (!isObject(value) || !isLineHistoryStatus(value.status)) {
    return null;
  }

  const activityLogsSource = Array.isArray(value.activityLogs) ? value.activityLogs : [];
  const activityLogs = activityLogsSource
    .map((item) => sanitizeActivityLog(item))
    .filter((item): item is HistoryFormDraftActivityLog => item !== null);

  return {
    phoneNumber: typeof value.phoneNumber === 'string' ? value.phoneNumber : '',
    carrier: typeof value.carrier === 'string' ? value.carrier : '',
    status: value.status,
    contractStartDate: typeof value.contractStartDate === 'string' ? value.contractStartDate : '',
    contractEndDate: typeof value.contractEndDate === 'string' ? value.contractEndDate : '',
    activityLogs,
    memo: typeof value.memo === 'string' ? value.memo : '',
    editingHistoryId: typeof value.editingHistoryId === 'string' ? value.editingHistoryId : null,
  };
}

export function loadHistoryFormDraft(): HistoryFormDraftPayload | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    return sanitizeHistoryFormDraft(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function saveHistoryFormDraft(draft: HistoryFormDraftPayload): HistoryFormDraftPayload | null {
  const sanitized = sanitizeHistoryFormDraft(draft);
  if (!sanitized) {
    return null;
  }

  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitized));
  }

  return sanitized;
}

export function clearHistoryFormDraft(): void {
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(STORAGE_KEY);
  }
}
