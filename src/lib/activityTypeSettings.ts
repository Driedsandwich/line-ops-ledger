export const BUILT_IN_ACTIVITY_TYPES = ['利用実績確認', '通信実施', '通話実施', 'SMS送信', '料金確認', 'プラン変更', 'その他'] as const;
export const ACTIVITY_TYPE_MAX_CUSTOM = 20;
export const ACTIVITY_TYPE_LABEL_MAX_LENGTH = 30;

const STORAGE_KEY = 'line-ops-ledger.activity-types';

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

export function loadCustomActivityTypes(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!isStringArray(parsed)) return [];
    return parsed
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && s.length <= ACTIVITY_TYPE_LABEL_MAX_LENGTH)
      .slice(0, ACTIVITY_TYPE_MAX_CUSTOM);
  } catch {
    return [];
  }
}

export function saveCustomActivityTypes(types: string[]): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(types));
}

export function getAllActivityTypes(customTypes: string[]): string[] {
  const extra = customTypes.filter((t) => !(BUILT_IN_ACTIVITY_TYPES as readonly string[]).includes(t));
  return [...BUILT_IN_ACTIVITY_TYPES, ...extra];
}
