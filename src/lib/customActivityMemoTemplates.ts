const STORAGE_KEY = 'line-ops-ledger.custom-activity-memo-templates';
const CUSTOM_ACTIVITY_MEMO_TEMPLATE_MAX = 16;
const CUSTOM_ACTIVITY_MEMO_TEMPLATE_MAX_LENGTH = 120;

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function sanitizeCustomActivityMemoTemplates(value: unknown): string[] {
  if (!isStringArray(value)) {
    return [];
  }

  return [...new Set(
    value
      .map((item) => item.trim())
      .filter((item) => item.length > 0 && item.length <= CUSTOM_ACTIVITY_MEMO_TEMPLATE_MAX_LENGTH),
  )].slice(0, CUSTOM_ACTIVITY_MEMO_TEMPLATE_MAX);
}

export function loadCustomActivityMemoTemplates(): string[] {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }
    return sanitizeCustomActivityMemoTemplates(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function saveCustomActivityMemoTemplates(templates: string[]): string[] {
  const sanitized = sanitizeCustomActivityMemoTemplates(templates);
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitized));
  }
  return sanitized;
}
