const STORAGE_KEY = 'line-ops-ledger.collapsed-activity-memo-sections';

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function sanitizeCollapsedActivityMemoSections(value: unknown): string[] {
  if (!isStringArray(value)) {
    return [];
  }

  return [...new Set(value.map((item) => item.trim()).filter(Boolean))];
}

export function loadCollapsedActivityMemoSections(): string[] {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }
    return sanitizeCollapsedActivityMemoSections(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function saveCollapsedActivityMemoSections(sectionKeys: string[]): string[] {
  const sanitized = sanitizeCollapsedActivityMemoSections(sectionKeys);
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitized));
  }
  return sanitized;
}
