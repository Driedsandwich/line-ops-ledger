import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { lineDraftStore, normalizePhoneNumber, type LineDraft } from '../lib/lineDrafts';
import {
  buildHistoryLink,
  buildLineEventFeed,
  groupLineEventsByMonth,
  type LineEvent,
  type LineEventMonthGroup,
} from '../lib/lineEvents';
import {
  createLineHistoryEntry,
  lineHistoryStore,
  LINE_HISTORY_STATUS_OPTIONS,
  type LineHistoryActivityLog,
  type LineHistoryEntry,
  type LineHistoryStatus,
} from '../lib/lineHistory';
import { loadNotificationSettings } from '../lib/notificationSettings';
import { updateLineDraft } from '../lib/lineDrafts';
import { getAllActivityTypes, loadCustomActivityTypes } from '../lib/activityTypeSettings';
import { loadCollapsedActivityMemoSections, saveCollapsedActivityMemoSections } from '../lib/collapsedActivityMemoSections';
import { loadCustomActivityMemoTemplates, saveCustomActivityMemoTemplates } from '../lib/customActivityMemoTemplates';
import { loadHiddenActivityMemoTemplates, saveHiddenActivityMemoTemplates } from '../lib/hiddenActivityMemoTemplates';
import { clearHistoryFormDraft, loadHistoryFormDraft, saveHistoryFormDraft } from '../lib/historyFormDraft';
import { loadPinnedActivityMemoTemplates, savePinnedActivityMemoTemplates } from '../lib/pinnedActivityMemoTemplates';
import { importBundledSampleData } from '../lib/sampleData';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type LineHistoryActivityLogFormState = {
  id: string;
  activityDate: string;
  activityType: string;
  activityMemo: string;
};

type LineHistoryFormState = {
  phoneNumber: string;
  carrier: string;
  status: LineHistoryStatus;
  contractStartDate: string;
  contractEndDate: string;
  activityLogs: LineHistoryActivityLogFormState[];
  memo: string;
};

type TimelineWindowKey = '3m' | '6m' | '12m' | 'all';
type TimelineViewMode = 'active' | 'all';

type LineHistoryGroup = {
  phoneNumber: string;
  maskedPhoneNumber: string;
  entries: LineHistoryEntry[];
  earliestDate: string;
  latestDate: string;
};

type VisibleLineHistoryGroup = LineHistoryGroup & {
  visibleEntries: LineHistoryEntry[];
  relatedDrafts: LineDraft[];
};

type HistoryFormDraftSuggestion = {
  kind: 'draft';
  label: string;
  description: string;
  carrier: string;
  status: LineHistoryStatus;
  contractStartDate: string;
  contractEndDate: string;
};

type HistoryFormEntrySuggestion = {
  kind: 'history';
  label: string;
  description: string;
  carrier: string;
  status: LineHistoryStatus;
  contractStartDate: string;
  contractEndDate: string;
  latestActivityDate: string;
};

type ActivityDateQuickPick = {
  label: string;
  value: string;
};

type ActivityMemoQuickPickSection = {
  key: string;
  title: string;
  quickPicks: string[];
  pinAction: 'pin' | 'unpin';
};

type HistoryIntentKind = LineEvent['kind'];

type HistoryIntentView = {
  label: string;
  description: string;
  tone: 'ok' | 'warn' | 'danger' | 'info';
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_ACTIVITY_TYPE = '利用実績確認';

const TIMELINE_WINDOW_OPTIONS: Array<{ key: TimelineWindowKey; label: string }> = [
  { key: '3m', label: '3か月' },
  { key: '6m', label: '6か月' },
  { key: '12m', label: '12か月' },
  { key: 'all', label: '全期間' },
];
const TIMELINE_VIEW_OPTIONS: Array<{ key: TimelineViewMode; label: string }> = [
  { key: 'active', label: '契約中中心' },
  { key: 'all', label: '過去契約含む' },
];
const ACTIVITY_TYPE_QUICK_PICK_LIMIT = 6;
const ACTIVITY_MEMO_RECENT_LIMIT = 4;
const ACTIVITY_MEMO_TYPE_QUICK_PICK_LIMIT = 4;
const ACTIVITY_MEMO_TEMPLATE_OPTIONS = [
  '請求確認。',
  '通信テスト実施。正常。',
  '通話テスト実施。正常。',
  'SMS送信テスト実施。正常。',
  'MNP予約番号取得。',
  '月額変動なし。',
] as const;
const ACTIVITY_MEMO_FALLBACK_BY_TYPE: Record<string, string[]> = {
  利用実績確認: ['通話・通信テスト実施。正常。', '1周年確認。問題なし。'],
  通信実施: ['通信テスト実施。正常。', '通信速度テスト。正常。'],
  通話実施: ['通話テスト実施。正常。', '最終通話テスト実施。正常。'],
  SMS送信: ['SMS受送信テスト実施。正常。'],
  料金確認: ['請求確認。月額変動なし。', '月次確認。', '年次確認。月額変動なし。'],
  プラン変更: ['プラン変更を実施。', 'オプション変更内容を確認。'],
  その他: ['MNP予約番号取得。転出準備。', '解約手続き完了。'],
};

const HISTORY_INTENT_VIEW_MAP: Record<HistoryIntentKind, HistoryIntentView> = {
  safeExit: {
    label: '解約可能推奨日',
    description: '181日ルールに沿って、解約可能なタイミングを確認します。',
    tone: 'warn',
  },
  contractEnd: {
    label: '契約終了',
    description: '契約終了日が近い回線の後続作業を記録します。',
    tone: 'warn',
  },
  plannedAction: {
    label: '今後のアクション',
    description: '解約予定や MNP 転出予定の進捗を記録します。',
    tone: 'warn',
  },
  mnpDeadline: {
    label: 'MNP期限',
    description: '予約番号の期限切れを避けるため、進捗を記録します。',
    tone: 'danger',
  },
  freeOptionDeadline: {
    label: '無料オプション期限',
    description: '無料オプションの解約タイミングを記録します。',
    tone: 'danger',
  },
  benefitDeadline: {
    label: '特典期限',
    description: 'キャッシュバックや特典の受取進捗を記録します。',
    tone: 'warn',
  },
  fiberDebt: {
    label: '光回線残債',
    description: '工事費残債の解消予定や確認履歴を記録します。',
    tone: 'warn',
  },
  notificationTarget: {
    label: '次回確認日',
    description: '次回確認日を更新するための記録を残します。',
    tone: 'info',
  },
  usageShortage: {
    label: '利用実績不足',
    description: '通 / 話 / SMS の不足を記録します。',
    tone: 'warn',
  },
  inactiveLine: {
    label: '長期未活動',
    description: '活動記録が空の回線を確認し、動きを残します。',
    tone: 'info',
  },
};

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

function createActivityLogFormState(overrides?: Partial<LineHistoryActivityLogFormState>): LineHistoryActivityLogFormState {
  return {
    id: globalThis.crypto?.randomUUID?.() ?? `activity_log_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
    activityDate: '',
    activityType: DEFAULT_ACTIVITY_TYPE,
    activityMemo: '',
    ...overrides,
  };
}

function toActivityLogFormStates(activityLogs: LineHistoryActivityLog[]): LineHistoryActivityLogFormState[] {
  if (activityLogs.length === 0) {
    return [createActivityLogFormState()];
  }
  return activityLogs.map((log) =>
    createActivityLogFormState({
      id: log.id,
      activityDate: log.activityDate,
      activityType: log.activityType || DEFAULT_ACTIVITY_TYPE,
      activityMemo: log.activityMemo,
    }),
  );
}

function getActivityTypeOptions(baseOptions: string[], currentValue: string): string[] {
  const normalized = currentValue.trim();
  if (!normalized || baseOptions.includes(normalized)) {
    return baseOptions;
  }

  return [...baseOptions, normalized];
}

function getActivityTypeQuickPicks(lineHistoryEntries: LineHistoryEntry[], allActivityTypes: string[]): string[] {
  const counts = new Map<string, number>();
  for (const entry of lineHistoryEntries) {
    for (const log of entry.activityLogs) {
      const label = log.activityType.trim();
      if (!label) {
        continue;
      }
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
  }

  const frequentTypes = [...counts.entries()]
    .sort((a, b) => {
      if (b[1] !== a[1]) {
        return b[1] - a[1];
      }
      return a[0].localeCompare(b[0], 'ja-JP');
    })
    .map(([label]) => label);

  return [...new Set([...frequentTypes, ...allActivityTypes])].slice(0, ACTIVITY_TYPE_QUICK_PICK_LIMIT);
}

function getVisibleActivityTypeQuickPicks(baseQuickPicks: string[], currentValue: string): string[] {
  const normalized = currentValue.trim();
  if (!normalized || baseQuickPicks.includes(normalized)) {
    return baseQuickPicks;
  }

  return [normalized, ...baseQuickPicks].slice(0, ACTIVITY_TYPE_QUICK_PICK_LIMIT);
}

function getRecentActivityMemoQuickPicks(lineHistoryEntries: LineHistoryEntry[]): string[] {
  const memoStats = new Map<string, { count: number; latestActivityDate: string }>();

  for (const entry of lineHistoryEntries) {
    for (const log of entry.activityLogs) {
      const memo = log.activityMemo.trim();
      if (!memo || (ACTIVITY_MEMO_TEMPLATE_OPTIONS as readonly string[]).includes(memo)) {
        continue;
      }

      const existing = memoStats.get(memo);
      if (!existing) {
        memoStats.set(memo, {
          count: 1,
          latestActivityDate: log.activityDate || '',
        });
        continue;
      }

      existing.count += 1;
      if ((log.activityDate || '') > existing.latestActivityDate) {
        existing.latestActivityDate = log.activityDate || '';
      }
    }
  }

  return [...memoStats.entries()]
    .sort((a, b) => {
      if (b[1].count !== a[1].count) {
        return b[1].count - a[1].count;
      }
      if (b[1].latestActivityDate !== a[1].latestActivityDate) {
        return b[1].latestActivityDate.localeCompare(a[1].latestActivityDate);
      }
      return a[0].localeCompare(b[0], 'ja-JP');
    })
    .slice(0, ACTIVITY_MEMO_RECENT_LIMIT)
    .map(([memo]) => memo);
}

function buildActivityMemoQuickPickIndex(lineHistoryEntries: LineHistoryEntry[]): Map<string, string[]> {
  const memoStatsByType = new Map<string, Map<string, { count: number; latestActivityDate: string }>>();

  for (const entry of lineHistoryEntries) {
    for (const log of entry.activityLogs) {
      const activityType = log.activityType.trim();
      const memo = log.activityMemo.trim();

      if (!activityType || !memo) {
        continue;
      }

      const typeStats = memoStatsByType.get(activityType) ?? new Map<string, { count: number; latestActivityDate: string }>();
      const existing = typeStats.get(memo);

      if (!existing) {
        typeStats.set(memo, {
          count: 1,
          latestActivityDate: log.activityDate || '',
        });
      } else {
        existing.count += 1;
        if ((log.activityDate || '') > existing.latestActivityDate) {
          existing.latestActivityDate = log.activityDate || '';
        }
      }

      memoStatsByType.set(activityType, typeStats);
    }
  }

  return new Map(
    [...memoStatsByType.entries()].map(([activityType, memoStats]) => [
      activityType,
      [...memoStats.entries()]
        .sort((a, b) => {
          if (b[1].count !== a[1].count) {
            return b[1].count - a[1].count;
          }
          if (b[1].latestActivityDate !== a[1].latestActivityDate) {
            return b[1].latestActivityDate.localeCompare(a[1].latestActivityDate);
          }
          return a[0].localeCompare(b[0], 'ja-JP');
        })
        .map(([memo]) => memo),
    ]),
  );
}

function getTypeSpecificActivityMemoQuickPicks(
  memoQuickPickIndex: Map<string, string[]>,
  activityType: string,
): string[] {
  const normalized = activityType.trim();
  if (!normalized) {
    return [];
  }

  return [...new Set([
    ...(memoQuickPickIndex.get(normalized) ?? []),
    ...(ACTIVITY_MEMO_FALLBACK_BY_TYPE[normalized] ?? []),
  ])].slice(0, ACTIVITY_MEMO_TYPE_QUICK_PICK_LIMIT);
}

function applyActivityMemoQuickPick(currentValue: string, quickPick: string): string {
  const normalized = currentValue.trim();
  if (!normalized) {
    return quickPick;
  }
  if (normalized === quickPick) {
    return currentValue;
  }
  return `${normalized} ${quickPick}`;
}

function isPinnedActivityMemoTemplate(pinnedTemplates: string[], candidate: string): boolean {
  return pinnedTemplates.includes(candidate.trim());
}

function isHiddenActivityMemoTemplate(hiddenTemplates: string[], candidate: string): boolean {
  return hiddenTemplates.includes(candidate.trim());
}

function isCustomActivityMemoTemplate(customTemplates: string[], candidate: string): boolean {
  return customTemplates.includes(candidate.trim());
}

function moveItemInList(items: string[], target: string, direction: 'up' | 'down'): string[] {
  const currentIndex = items.indexOf(target);
  if (currentIndex === -1) {
    return items;
  }

  const nextIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
  if (nextIndex < 0 || nextIndex >= items.length) {
    return items;
  }

  const nextItems = [...items];
  const [moved] = nextItems.splice(currentIndex, 1);
  nextItems.splice(nextIndex, 0, moved);
  return nextItems;
}

function buildActivityMemoQuickPickSections(params: {
  pinnedTemplates: string[];
  hiddenTemplates: string[];
  typeSpecificQuickPicks: string[];
  customQuickPicks: string[];
  templateQuickPicks: string[];
  recentQuickPicks: string[];
}): ActivityMemoQuickPickSection[] {
  const seen = new Set<string>();
  const hiddenTemplates = new Set(params.hiddenTemplates.map((item) => item.trim()).filter(Boolean));

  const sections: ActivityMemoQuickPickSection[] = [
    { key: 'pinned', title: '固定候補', quickPicks: params.pinnedTemplates, pinAction: 'unpin' },
    { key: 'type-specific', title: 'この種別でよく使う文言', quickPicks: params.typeSpecificQuickPicks, pinAction: 'pin' },
    { key: 'custom', title: '追加した候補', quickPicks: params.customQuickPicks, pinAction: 'pin' },
    { key: 'templates', title: '定型候補', quickPicks: params.templateQuickPicks, pinAction: 'pin' },
    { key: 'recent', title: '最近使った文言', quickPicks: params.recentQuickPicks, pinAction: 'pin' },
  ];

  return sections
    .map((section) => ({
      ...section,
      quickPicks: section.quickPicks.filter((candidate) => {
        const normalized = candidate.trim();
        if (!normalized || hiddenTemplates.has(normalized) || seen.has(normalized)) {
          return false;
        }
        seen.add(normalized);
        return true;
      }),
    }))
    .filter((section) => section.quickPicks.length > 0);
}

function getLatestMatchingHistoryEntry(entries: LineHistoryEntry[], phoneNumber: string, editingHistoryId: string | null): LineHistoryEntry | null {
  if (!phoneNumber) {
    return null;
  }

  const matches = entries.filter((entry) => entry.phoneNumber === phoneNumber && entry.id !== editingHistoryId);
  if (matches.length === 0) {
    return null;
  }

  return [...matches].sort((a, b) => {
    const latestActivityA = getLatestActivityDate(a.activityLogs) || '';
    const latestActivityB = getLatestActivityDate(b.activityLogs) || '';
    const recencyA = latestActivityA || a.contractStartDate || a.createdAt;
    const recencyB = latestActivityB || b.contractStartDate || b.createdAt;
    if (recencyB !== recencyA) {
      return recencyB.localeCompare(recencyA);
    }
    return b.createdAt.localeCompare(a.createdAt);
  })[0] ?? null;
}

function buildHistoryFormDraftSuggestion(draft: LineDraft): HistoryFormDraftSuggestion {
  return {
    kind: 'draft',
    label: `主台帳候補: ${draft.lineName}`,
    description: `${draft.carrier} / ${draft.status} / 開始 ${draft.contractStartDate ? formatDate(draft.contractStartDate) : '未設定'}`,
    carrier: draft.carrier,
    status: draft.status,
    contractStartDate: draft.contractStartDate,
    contractEndDate: draft.contractEndDate,
  };
}

function buildHistoryFormEntrySuggestion(entry: LineHistoryEntry): HistoryFormEntrySuggestion {
  const latestActivityDate = getLatestActivityDate(entry.activityLogs) || '';
  return {
    kind: 'history',
    label: `直近履歴候補: ${entry.carrier}`,
    description: `${entry.status} / 開始 ${entry.contractStartDate ? formatDate(entry.contractStartDate) : '未設定'}${latestActivityDate ? ` / 最終活動 ${formatDate(latestActivityDate)}` : ''}`,
    carrier: entry.carrier,
    status: entry.status,
    contractStartDate: entry.contractStartDate,
    contractEndDate: entry.contractEndDate,
    latestActivityDate,
  };
}

function getActivityDateQuickPicks(todayDate: string, contractStartDate: string, latestActivityDate: string): ActivityDateQuickPick[] {
  const candidates: ActivityDateQuickPick[] = [{ label: '今日', value: todayDate }];

  if (contractStartDate) {
    candidates.push({ label: '契約開始日', value: contractStartDate });
  }
  if (latestActivityDate) {
    candidates.push({ label: '前回活動日', value: latestActivityDate });
  }

  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    if (!candidate.value || seen.has(candidate.value)) {
      return false;
    }
    seen.add(candidate.value);
    return true;
  });
}

function maskPhoneNumber(phoneNumber: string): string {
  if (phoneNumber.length < 4) return phoneNumber;
  return `${phoneNumber.slice(0, 3)}-****-${phoneNumber.slice(-4)}`;
}

function getPhoneLast4(phoneNumber: string): string {
  const digits = phoneNumber.replace(/\D/g, '');
  return digits.length >= 4 ? digits.slice(-4) : '';
}

function parseDate(value: string): Date | null {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function startOfDay(input: Date): Date {
  const date = new Date(input);
  date.setHours(0, 0, 0, 0);
  return date;
}

function diffInDays(from: Date, to: Date): number {
  const ms = startOfDay(to).getTime() - startOfDay(from).getTime();
  return Math.round(ms / 86400000);
}

function addMonths(date: Date, months: number): Date {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

function getTimelineWindowStart(windowKey: TimelineWindowKey, today: Date): Date | null {
  const base = startOfDay(today);
  switch (windowKey) {
    case '3m': return addMonths(base, -3);
    case '6m': return addMonths(base, -6);
    case '12m': return addMonths(base, -12);
    default: return null;
  }
}

function isCurrentHistoryStatus(status: string): boolean {
  return status === '利用中' || status === '解約予定';
}

function isEntryVisibleInTimeline(
  entry: LineHistoryEntry,
  windowKey: TimelineWindowKey,
  viewMode: TimelineViewMode,
  today: Date,
): boolean {
  if (viewMode === 'active' && !isCurrentHistoryStatus(entry.status)) return false;
  const entryStart = parseDate(entry.contractStartDate);
  const entryEnd = parseDate(entry.contractEndDate || today.toISOString().slice(0, 10));
  if (!entryStart || !entryEnd) return viewMode === 'all';
  const windowStart = getTimelineWindowStart(windowKey, today);
  const windowEnd = startOfDay(today);
  if (!windowStart) return true;
  return entryEnd >= windowStart && entryStart <= windowEnd;
}

function calculateTimelineStyleForWindow(
  entry: LineHistoryEntry,
  windowKey: TimelineWindowKey,
  today: Date,
  fallbackStart: string,
  fallbackEnd: string,
): { left: string; width: string } {
  const entryStart = parseDate(entry.contractStartDate) ?? parseDate(fallbackStart);
  const entryEnd = parseDate(entry.contractEndDate || today.toISOString().slice(0, 10)) ?? parseDate(fallbackEnd);
  if (!entryStart || !entryEnd) return { left: '0%', width: '100%' };
  const explicitWindowStart = getTimelineWindowStart(windowKey, today);
  const windowStart = explicitWindowStart ?? parseDate(fallbackStart) ?? entryStart;
  const windowEnd = explicitWindowStart ? startOfDay(today) : parseDate(fallbackEnd) ?? entryEnd;
  const clampedStart = entryStart < windowStart ? windowStart : entryStart;
  const clampedEnd = entryEnd > windowEnd ? windowEnd : entryEnd;
  const totalDays = Math.max(diffInDays(windowStart, windowEnd) + 1, 1);
  const offsetDays = Math.max(diffInDays(windowStart, clampedStart), 0);
  const durationDays = Math.max(diffInDays(clampedStart, clampedEnd) + 1, 1);
  return {
    left: `${(offsetDays / totalDays) * 100}%`,
    width: `${Math.max((durationDays / totalDays) * 100, 6)}%`,
  };
}

function getTimelineRangeLabel(windowKey: TimelineWindowKey): string {
  switch (windowKey) {
    case '3m': return '直近3か月';
    case '6m': return '直近6か月';
    case '12m': return '直近12か月';
    default: return '全期間';
  }
}

function formatDate(value: string): string {
  if (!value) return '未設定';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

function formatDaysUntilLabel(daysUntil: number): string {
  if (daysUntil < 0) {
    return `${Math.abs(daysUntil)}日超過`;
  }
  if (daysUntil === 0) {
    return '今日';
  }
  return `あと${daysUntil}日`;
}

function getUniqueEventMetaItems(items: string[]): string[] {
  return Array.from(new Set(items.filter(Boolean)));
}

function getHistoryEventOriginLabel(origin: LineEvent['origin']): string {
  return origin === 'history' ? '履歴由来' : '回線由来';
}

function getHistoryEventSeverityLabel(severity: LineEvent['severity']): string {
  switch (severity) {
    case 'critical':
      return 'Critical';
    case 'warning':
      return 'Warning';
    case 'watch':
      return 'Watch';
  }
}

function calculateContractDurationDays(contractStartDate: string, contractEndDate: string): number | null {
  const start = parseDate(contractStartDate);
  const end = parseDate(contractEndDate);
  if (!start || !end) return null;
  return Math.max(diffInDays(start, end), 0);
}

function getLatestActivityDate(activityLogs: LineHistoryActivityLog[]): string | null {
  const dated = activityLogs.filter((log) => log.activityDate);
  if (dated.length === 0) return null;
  return dated.reduce((latest, log) =>
    log.activityDate > latest ? log.activityDate : latest,
    dated[0].activityDate,
  );
}

function downloadJson(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function findRelatedDrafts(entry: LineHistoryEntry, drafts: LineDraft[]): LineDraft[] {
  const phoneNumber = normalizePhoneNumber(entry.phoneNumber);
  if (phoneNumber) {
    const exactDrafts = drafts.filter((draft) => draft.phoneNumber === phoneNumber);
    if (exactDrafts.length > 0) {
      return exactDrafts;
    }
  }

  const last4 = getPhoneLast4(entry.phoneNumber);
  if (!last4) {
    return [];
  }

  return drafts.filter((draft) => draft.last4 === last4 || getPhoneLast4(draft.phoneNumber) === last4);
}

function calculateContractDurationDaysFromEntry(entry: LineHistoryEntry): number | null {
  return calculateContractDurationDays(entry.contractStartDate, entry.contractEndDate || '');
}

function buildHistoryIntentForEvent(event: LineEvent): HistoryIntentKind {
  return event.kind;
}

function sortEventsByRecency(events: LineEvent[]): LineEvent[] {
  return [...events].sort((a, b) => {
    const dateA = a.date || '';
    const dateB = b.date || '';
    if (dateB !== dateA) {
      return dateB.localeCompare(dateA);
    }
    if (b.severity !== a.severity) {
      return getHistoryEventSeverityLabel(b.severity).localeCompare(getHistoryEventSeverityLabel(a.severity));
    }
    return a.title.localeCompare(b.title, 'ja-JP');
  });
}

function groupEventsByMonth(events: LineEvent[]): LineEventMonthGroup[] {
  return groupLineEventsByMonth(events);
}

function buildHistoryLinkForEvent(event: LineEvent): string {
  return buildHistoryLink(event.phoneNumber, event.kind);
}

function getTimelinePhoneFilterLabel(phoneNumbers: string[]): string {
  return `${phoneNumbers.length}番号`;
}

function calculateVisibleTimelineEntries(groups: VisibleLineHistoryGroup[]): number {
  return groups.reduce((sum, group) => sum + group.visibleEntries.length, 0);
}

function canLinkToHistory(event: LineEvent): boolean {
  return Boolean(event.phoneNumber);
}

function getEventMetaItems(event: LineEvent): string[] {
  const items = [
    event.origin === 'history' ? '履歴由来' : '回線由来',
    getHistoryEventSeverityLabel(event.severity),
  ];
  return getUniqueEventMetaItems(items);
}

function getEventSeverityTone(severity: LineEvent['severity']): 'ok' | 'warn' | 'danger' | 'info' {
  switch (severity) {
    case 'critical': return 'danger';
    case 'warning': return 'warn';
    case 'watch': return 'info';
  }
}

function getEventMonthSummaryLabel(group: LineEventMonthGroup): string {
  return `${group.monthLabel} / ${group.events.length}件`;
}

function formatEventMonthRange(group: LineEventMonthGroup): string {
  return `${group.monthLabel} のイベント`;
}

function renderHistoryEventMeta(event: LineEvent): string[] {
  return getEventMetaItems(event);
}

function getEventSortKey(event: LineEvent): string {
  return `${event.date || ''}::${event.title}`;
}

function buildHistoryActionLink(phoneNumber: string, kind: LineEvent['kind']): string {
  return buildHistoryLink(phoneNumber, kind);
}

function getVisiblePhoneNumbers(groups: VisibleLineHistoryGroup[]): string[] {
  return groups.map((group) => group.phoneNumber);
}

function getLineHistoryGroupsByPhoneNumber(entries: LineHistoryEntry[]): LineHistoryGroup[] {
  const groups = new Map<string, LineHistoryEntry[]>();
  for (const entry of entries) {
    const list = groups.get(entry.phoneNumber) ?? [];
    list.push(entry);
    groups.set(entry.phoneNumber, list);
  }

  return [...groups.entries()].map(([phoneNumber, groupEntries]) => {
    const sortedEntries = [...groupEntries].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const dates = sortedEntries.flatMap((entry) => [entry.contractStartDate, entry.contractEndDate || ''].filter(Boolean));
    return {
      phoneNumber,
      maskedPhoneNumber: maskPhoneNumber(phoneNumber),
      entries: sortedEntries,
      earliestDate: dates.sort()[0] ?? '',
      latestDate: dates.sort().at(-1) ?? '',
    };
  });
}

function getVisibleLineHistoryGroups(groups: LineHistoryGroup[], windowKey: TimelineWindowKey, viewMode: TimelineViewMode, today: Date): VisibleLineHistoryGroup[] {
  return groups
    .filter((group) => group.entries.some((entry) => isEntryVisibleInTimeline(entry, windowKey, viewMode, today)))
    .map((group) => ({
      ...group,
      visibleEntries: group.entries.filter((entry) => isEntryVisibleInTimeline(entry, windowKey, viewMode, today)),
      relatedDrafts: [],
    }));
}

function getTimelinePhoneNumbersForGroup(group: VisibleLineHistoryGroup): string[] {
  return [group.phoneNumber];
}

function getEventToneLabel(severity: LineEvent['severity']): string {
  return getHistoryEventSeverityLabel(severity);
}

function getLineHistoryMonthGroups(entries: LineEvent[]): LineEventMonthGroup[] {
  return groupLineEventsByMonth(entries);
}

function getLineHistoryEventRowLink(event: LineEvent): string | null {
  return canLinkToHistory(event) ? buildHistoryLink(event.phoneNumber, event.kind) : null;
}

function getLineHistoryEventRowLabel(event: LineEvent): string {
  return `${event.title} / ${getHistoryEventSeverityLabel(event.severity)}`;
}

function getLineHistoryEventRowMeta(event: LineEvent): string[] {
  return renderHistoryEventMeta(event);
}

function getLineHistoryEventRowDate(event: LineEvent): string {
  return formatDate(event.date);
}

function getLineHistoryEventRowOrigin(event: LineEvent): string {
  return getHistoryEventOriginLabel(event.origin);
}

function getLineHistoryEventRowDrilldown(event: LineEvent): string | null {
  return getLineHistoryEventRowLink(event);
}

function getLineHistoryEventRowCanDrill(event: LineEvent): boolean {
  return canLinkToHistory(event);
}

function getLineHistoryEventRowTone(event: LineEvent): 'ok' | 'warn' | 'danger' | 'info' {
  return getEventSeverityTone(event.severity);
}

function getLineHistoryEventRowLabelAndMeta(event: LineEvent): { label: string; meta: string[] } {
  return { label: getLineHistoryEventRowLabel(event), meta: getLineHistoryEventRowMeta(event) };
}

function getHistoryIntentLabel(kind: HistoryIntentKind): string {
  return HISTORY_INTENT_VIEW_MAP[kind].label;
}

function getHistoryIntentDescription(kind: HistoryIntentKind): string {
  return HISTORY_INTENT_VIEW_MAP[kind].description;
}

function getHistoryIntentTone(kind: HistoryIntentKind): HistoryIntentView['tone'] {
  return HISTORY_INTENT_VIEW_MAP[kind].tone;
}

function getHistoryIntentView(kind: HistoryIntentKind): HistoryIntentView {
  return HISTORY_INTENT_VIEW_MAP[kind];
}

function getHistoryIntentTitle(kind: HistoryIntentKind): string {
  return getHistoryIntentView(kind).label;
}

function getHistoryIntentBody(kind: HistoryIntentKind): string {
  return getHistoryIntentView(kind).description;
}

function buildHistoryLinkFromEvent(event: LineEvent): string {
  return buildHistoryLink(event.phoneNumber, event.kind);
}

function buildHistoryEntryActions(event: LineEvent): string | null {
  return canLinkToHistory(event) ? buildHistoryLinkFromEvent(event) : null;
}

function getHistoryEventMetaForRender(event: LineEvent): string[] {
  return getEventMetaItems(event);
}

function getHistoryEventSeverityForRender(event: LineEvent): 'ok' | 'warn' | 'danger' | 'info' {
  return getEventSeverityTone(event.severity);
}

function getHistoryEventOriginForRender(event: LineEvent): string {
  return getHistoryEventOriginLabel(event.origin);
}

function getHistoryEventRowLinkForRender(event: LineEvent): string | null {
  return buildHistoryLink(event.phoneNumber, event.kind);
}

function getHistoryEventRowButtonLabel(event: LineEvent): string {
  return '履歴で記録';
}

function getHistoryEventRowLinkLabel(event: LineEvent): string {
  return getHistoryEventRowButtonLabel(event);
}

function getHistoryEventRowLinkForPhone(phoneNumber: string, kind: LineEvent['kind']): string {
  return buildHistoryLink(phoneNumber, kind);
}

function getHistoryEventRowLinkForAction(event: LineEvent): string | null {
  return event.phoneNumber ? buildHistoryLink(event.phoneNumber, event.kind) : null;
}

function getHistoryEventRowLinkText(event: LineEvent): string {
  return '履歴で記録';
}

function getHistoryEventRowLinkMaybe(event: LineEvent): string | null {
  return event.phoneNumber ? buildHistoryLink(event.phoneNumber, event.kind) : null;
}

function getHistoryEventRowLinkMaybeLabel(event: LineEvent): string | null {
  return event.phoneNumber ? '履歴で記録' : null;
}

function getHistoryEventRowLinkAndLabel(event: LineEvent): { link: string | null; label: string | null } {
  return {
    link: event.phoneNumber ? buildHistoryLink(event.phoneNumber, event.kind) : null,
    label: event.phoneNumber ? '履歴で記録' : null,
  };
}

function getHistoryEventRowLinkWithAction(event: LineEvent): { link: string | null; label: string | null } {
  return getHistoryEventRowLinkAndLabel(event);
}

function getHistoryEventRowLinkForEvent(event: LineEvent): string | null {
  return event.phoneNumber ? buildHistoryLink(event.phoneNumber, event.kind) : null;
}

function getHistoryEventRowActionLink(event: LineEvent): string | null {
  return getHistoryEventRowLinkForEvent(event);
}

function getHistoryEventRowActionLabel(event: LineEvent): string | null {
  return event.phoneNumber ? '履歴で記録' : null;
}

function getHistoryEventRowAction(event: LineEvent): { link: string | null; label: string | null } {
  return { link: getHistoryEventRowActionLink(event), label: getHistoryEventRowActionLabel(event) };
}

function getHistoryEventRowActionForEvent(event: LineEvent): { link: string | null; label: string | null } {
  return getHistoryEventRowAction(event);
}

function getHistoryEventRowActionMaybe(event: LineEvent): { link: string | null; label: string | null } {
  return getHistoryEventRowAction(event);
}

function getHistoryEventRowActionEntry(event: LineEvent): { link: string | null; label: string | null } {
  return getHistoryEventRowAction(event);
}

function getHistoryEventRowActionTuple(event: LineEvent): [string | null, string | null] {
  const action = getHistoryEventRowAction(event);
  return [action.link, action.label];
}

function getHistoryEventRowActionPair(event: LineEvent): { link: string | null; label: string | null } {
  return getHistoryEventRowAction(event);
}

function getHistoryEventRowLinkPair(event: LineEvent): { link: string | null; label: string | null } {
  return getHistoryEventRowAction(event);
}

function getHistoryEventRowLinkForRender(event: LineEvent): string | null {
  return event.phoneNumber ? buildHistoryLink(event.phoneNumber, event.kind) : null;
}

function getHistoryEventRowButtonForRender(event: LineEvent): string | null {
  return event.phoneNumber ? '履歴で記録' : null;
}

function getHistoryEventRowActionForRender(event: LineEvent): { link: string | null; label: string | null } {
  return { link: getHistoryEventRowLinkForRender(event), label: getHistoryEventRowButtonForRender(event) };
}

function getHistoryEventRowActionRender(event: LineEvent): { link: string | null; label: string | null } {
  return getHistoryEventRowActionForRender(event);
}

function getHistoryEventRowRender(event: LineEvent): { link: string | null; label: string | null } {
  return getHistoryEventRowActionForRender(event);
}

function getHistoryEventRowDisplay(event: LineEvent): { link: string | null; label: string | null } {
  return getHistoryEventRowActionForRender(event);
}

function getHistoryEventRowCTA(event: LineEvent): { link: string | null; label: string | null } {
  return getHistoryEventRowActionForRender(event);
}

function getHistoryEventRowCTALink(event: LineEvent): string | null {
  return getHistoryEventRowLinkForRender(event);
}

function getHistoryEventRowCTALabel(event: LineEvent): string | null {
  return getHistoryEventRowButtonForRender(event);
}

function getHistoryEventRowActionProps(event: LineEvent): { to: string | null; children: string | null } {
  return { to: getHistoryEventRowCTALink(event), children: getHistoryEventRowCTALabel(event) };
}

function getHistoryEventRowActionPropsMaybe(event: LineEvent): { to: string | null; children: string | null } {
  return getHistoryEventRowActionProps(event);
}

function getHistoryEventRowActionPropsForEvent(event: LineEvent): { to: string | null; children: string | null } {
  return getHistoryEventRowActionProps(event);
}

function getHistoryEventRowActionPropsForRender(event: LineEvent): { to: string | null; children: string | null } {
  return getHistoryEventRowActionProps(event);
}

function getHistoryEventRowActionPropsRender(event: LineEvent): { to: string | null; children: string | null } {
  return getHistoryEventRowActionProps(event);
}

function getHistoryEventRowActionPropsDisplay(event: LineEvent): { to: string | null; children: string | null } {
  return getHistoryEventRowActionProps(event);
}

function getHistoryEventRowActionPropsCTA(event: LineEvent): { to: string | null; children: string | null } {
  return getHistoryEventRowActionProps(event);
}

function getHistoryEventRowActionPropsButton(event: LineEvent): { to: string | null; children: string | null } {
  return getHistoryEventRowActionProps(event);
}

function getHistoryEventRowActionPropsLink(event: LineEvent): { to: string | null; children: string | null } {
  return getHistoryEventRowActionProps(event);
}

function getHistoryEventRowActionPropsResult(event: LineEvent): { to: string | null; children: string | null } {
  return getHistoryEventRowActionProps(event);
}

function getHistoryEventRowActionPropsValue(event: LineEvent): { to: string | null; children: string | null } {
  return getHistoryEventRowActionProps(event);
}

function getHistoryEventRowActionPropsFinal(event: LineEvent): { to: string | null; children: string | null } {
  return getHistoryEventRowActionProps(event);
}

function getHistoryEventRowActionPropsOutput(event: LineEvent): { to: string | null; children: string | null } {
  return getHistoryEventRowActionProps(event);
}

function getHistoryEventRowActionPropsReturn(event: LineEvent): { to: string | null; children: string | null } {
  return getHistoryEventRowActionProps(event);
}

function getHistoryEventRowActionPropsRenderResult(event: LineEvent): { to: string | null; children: string | null } {
  return getHistoryEventRowActionProps(event);
}

function getHistoryEventRowActionPropsRenderValue(event: LineEvent): { to: string | null; children: string | null } {
  return getHistoryEventRowActionProps(event);
}

function getHistoryEventRowActionPropsRenderFinal(event: LineEvent): { to: string | null; children: string | null } {
  return getHistoryEventRowActionProps(event);
}

function getHistoryEventRowActionPropsRenderOutput(event: LineEvent): { to: string | null; children: string | null } {
  return getHistoryEventRowActionProps(event);
}

function getHistoryEventRowActionPropsRenderReturn(event: LineEvent): { to: string | null; children: string | null } {
  return getHistoryEventRowActionProps(event);
}
