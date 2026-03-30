const STORAGE_KEY = 'line-ops-ledger.pinned-activity-memo-templates';
const PINNED_ACTIVITY_MEMO_TEMPLATE_MAX = 8;
const PINNED_ACTIVITY_MEMO_TEMPLATE_MAX_LENGTH = 120;

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function sanitizePinnedActivityMemoTemplates(value: unknown): string[] {
  if (!isStringArray(value)) {
    return [];
  }

  return [...new Set(
    value
      .map((item) => item.trim())
      .filter((item) => item.length > 0 && item.length <= PINNED_ACTIVITY_MEMO_TEMPLATE_MAX_LENGTH),
  )].slice(0, PINNED_ACTIVITY_MEMO_TEMPLATE_MAX);
}

export function loadPinnedActivityMemoTemplates(): string[] {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }
    return sanitizePinnedActivityMemoTemplates(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function savePinnedActivityMemoTemplates(templates: string[]): string[] {
  const sanitized = sanitizePinnedActivityMemoTemplates(templates);
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitized));
  }
  return sanitized;
}
