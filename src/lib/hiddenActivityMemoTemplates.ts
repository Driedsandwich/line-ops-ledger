const STORAGE_KEY = 'line-ops-ledger.hidden-activity-memo-templates';
const HIDDEN_ACTIVITY_MEMO_TEMPLATE_MAX = 24;
const HIDDEN_ACTIVITY_MEMO_TEMPLATE_MAX_LENGTH = 120;

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function sanitizeHiddenActivityMemoTemplates(value: unknown): string[] {
  if (!isStringArray(value)) {
    return [];
  }

  return [...new Set(
    value
      .map((item) => item.trim())
      .filter((item) => item.length > 0 && item.length <= HIDDEN_ACTIVITY_MEMO_TEMPLATE_MAX_LENGTH),
  )].slice(0, HIDDEN_ACTIVITY_MEMO_TEMPLATE_MAX);
}

export function loadHiddenActivityMemoTemplates(): string[] {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }
    return sanitizeHiddenActivityMemoTemplates(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function saveHiddenActivityMemoTemplates(templates: string[]): string[] {
  const sanitized = sanitizeHiddenActivityMemoTemplates(templates);
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitized));
  }
  return sanitized;
}
