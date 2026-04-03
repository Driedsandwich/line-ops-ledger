import { normalizePhoneNumber, normalizeReviewDate, type LineDraft } from './lineDrafts';
import type { LineHistoryEntry } from './lineHistory';

export function startOfDay(input: Date): Date {
  const date = new Date(input);
  date.setHours(0, 0, 0, 0);
  return date;
}

export function diffInDays(from: Date, to: Date): number {
  const ms = startOfDay(to).getTime() - startOfDay(from).getTime();
  return Math.round(ms / 86400000);
}

export function parseReviewDate(value: string | null | undefined): Date | null {
  const normalized = normalizeReviewDate(value);
  if (!normalized) {
    return null;
  }

  const parsed = new Date(`${normalized}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function calculateElapsedMonths(contractStartDate: string, today: Date = new Date()): number | null {
  const startDate = parseReviewDate(contractStartDate);
  if (!startDate) {
    return null;
  }

  const todayNormalized = startOfDay(today);
  const startNormalized = startOfDay(startDate);

  if (todayNormalized < startNormalized) {
    return 0;
  }

  let months = (todayNormalized.getFullYear() - startNormalized.getFullYear()) * 12
    + (todayNormalized.getMonth() - startNormalized.getMonth());
  if (todayNormalized.getDate() < startNormalized.getDate()) {
    months -= 1;
  }

  return Math.max(months, 0);
}

function getPhoneLast4(phoneNumber: string): string {
  const digits = phoneNumber.replace(/\D/g, '');
  return digits.length >= 4 ? digits.slice(-4) : '';
}

export function findRelatedHistoryEntriesForDraft(
  draft: Pick<LineDraft, 'phoneNumber' | 'last4'>,
  entries: LineHistoryEntry[],
): LineHistoryEntry[] {
  if (draft.phoneNumber) {
    const exactMatches = entries.filter((entry) => normalizePhoneNumber(entry.phoneNumber) === draft.phoneNumber);
    if (exactMatches.length > 0) {
      return exactMatches;
    }
  }

  if (!draft.last4) {
    return [];
  }

  return entries.filter((entry) => getPhoneLast4(entry.phoneNumber) === draft.last4);
}

export function getLatestActivityDateFromEntries(entries: LineHistoryEntry[]): string | null {
  let latest: string | null = null;

  for (const entry of entries) {
    for (const log of entry.activityLogs) {
      if (log.activityDate && (!latest || log.activityDate > latest)) {
        latest = log.activityDate;
      }
    }
  }

  return latest;
}
