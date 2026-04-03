import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { lineDraftStore, normalizePhoneNumber, type LineDraft } from '../lib/lineDrafts';
import { buildLineEventFeed, type LineEvent } from '../lib/lineEvents';
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
  SMS送信: ['SMS送受信テスト実施。正常。'],
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
    if (exactDrafts.length > 0) return exactDrafts;
  }
  const last4 = getPhoneLast4(entry.phoneNumber);
  if (!last4) return [];
  return drafts.filter((draft) => !draft.phoneNumber && draft.last4 === last4);
}

function buildLineHistoryGroups(entries: LineHistoryEntry[]): LineHistoryGroup[] {
  const groups = new Map<string, LineHistoryEntry[]>();
  for (const entry of entries) {
    const current = groups.get(entry.phoneNumber) ?? [];
    current.push(entry);
    groups.set(entry.phoneNumber, current);
  }
  return [...groups.entries()]
    .map(([phoneNumber, groupedEntries]) => {
      const entriesSorted = [...groupedEntries].sort((a, b) => a.contractStartDate.localeCompare(b.contractStartDate));
      const earliestDate = entriesSorted[0]?.contractStartDate ?? '';
      const latestDate = entriesSorted.reduce((latest, entry) => {
        const candidate = entry.contractEndDate || entry.contractStartDate;
        return candidate > latest ? candidate : latest;
      }, earliestDate);
      return {
        phoneNumber,
        maskedPhoneNumber: maskPhoneNumber(phoneNumber),
        entries: entriesSorted,
        earliestDate,
        latestDate,
      } satisfies LineHistoryGroup;
    })
    .sort((a, b) => a.phoneNumber.localeCompare(b.phoneNumber));
}

function toLineHistoryFormState(entry: LineHistoryEntry): LineHistoryFormState {
  return {
    phoneNumber: entry.phoneNumber,
    carrier: entry.carrier,
    status: entry.status,
    contractStartDate: entry.contractStartDate,
    contractEndDate: entry.contractEndDate,
    activityLogs: toActivityLogFormStates(entry.activityLogs),
    memo: entry.memo,
  };
}

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

const initialLineHistoryFormState: LineHistoryFormState = {
  phoneNumber: '',
  carrier: '',
  status: '利用中',
  contractStartDate: '',
  contractEndDate: '',
  activityLogs: [createActivityLogFormState()],
  memo: '',
};

function isLineHistoryFormEmpty(form: LineHistoryFormState): boolean {
  return (
    !form.phoneNumber.trim() &&
    !form.carrier.trim() &&
    form.status === '利用中' &&
    !form.contractStartDate &&
    !form.contractEndDate &&
    !form.memo.trim() &&
    form.activityLogs.every(
      (log) => !log.activityDate && (!log.activityType || log.activityType === DEFAULT_ACTIVITY_TYPE) && !log.activityMemo.trim(),
    )
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function HistoryPage(): JSX.Element {
  const restoredHistoryFormDraft = useMemo(() => loadHistoryFormDraft(), []);
  const [searchParams] = useSearchParams();
  const [drafts, setDrafts] = useState<LineDraft[]>(() => lineDraftStore.load());
  const [lineHistoryEntries, setLineHistoryEntries] = useState<LineHistoryEntry[]>(() => lineHistoryStore.load());
  const [lineHistoryForm, setLineHistoryForm] = useState<LineHistoryFormState>(() =>
    restoredHistoryFormDraft
      ? {
          phoneNumber: restoredHistoryFormDraft.phoneNumber,
          carrier: restoredHistoryFormDraft.carrier,
          status: restoredHistoryFormDraft.status,
          contractStartDate: restoredHistoryFormDraft.contractStartDate,
          contractEndDate: restoredHistoryFormDraft.contractEndDate,
          activityLogs:
            restoredHistoryFormDraft.activityLogs.length > 0
              ? restoredHistoryFormDraft.activityLogs.map((log) => createActivityLogFormState(log))
              : [createActivityLogFormState()],
          memo: restoredHistoryFormDraft.memo,
        }
      : initialLineHistoryFormState,
  );
  const [editingHistoryId, setEditingHistoryId] = useState<string | null>(() => restoredHistoryFormDraft?.editingHistoryId ?? null);
  const [showRestoredDraftActions, setShowRestoredDraftActions] = useState(false);
  const [timelineWindow, setTimelineWindow] = useState<TimelineWindowKey>('6m');
  const [timelineViewMode, setTimelineViewMode] = useState<TimelineViewMode>('all');
  const [timelinePhoneFilter, setTimelinePhoneFilter] = useState<string[] | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [reviewSuggest, setReviewSuggest] = useState<{ draftId: string; draftName: string; suggestedDate: string } | null>(null);
  const [customActivityMemoTemplates, setCustomActivityMemoTemplates] = useState<string[]>(() => loadCustomActivityMemoTemplates());
  const [hiddenActivityMemoTemplates, setHiddenActivityMemoTemplates] = useState<string[]>(() => loadHiddenActivityMemoTemplates());
  const [pinnedActivityMemoTemplates, setPinnedActivityMemoTemplates] = useState<string[]>(() => loadPinnedActivityMemoTemplates());
  const [collapsedActivityMemoSections, setCollapsedActivityMemoSections] = useState<string[]>(() => loadCollapsedActivityMemoSections());
  const historyImportInputRef = useRef<HTMLInputElement | null>(null);

  const notificationSettings = loadNotificationSettings();
  const today = useMemo(() => new Date(), []);
  const allActivityTypes = useMemo(() => getAllActivityTypes(loadCustomActivityTypes()), []);
  const activityTypeQuickPicks = useMemo(
    () => getActivityTypeQuickPicks(lineHistoryEntries, allActivityTypes),
    [allActivityTypes, lineHistoryEntries],
  );
  const recentActivityMemoQuickPicks = useMemo(
    () => getRecentActivityMemoQuickPicks(lineHistoryEntries),
    [lineHistoryEntries],
  );
  const activityMemoQuickPickIndex = useMemo(
    () => buildActivityMemoQuickPickIndex(lineHistoryEntries),
    [lineHistoryEntries],
  );
  const normalizedPhoneNumber = useMemo(() => normalizePhoneNumber(lineHistoryForm.phoneNumber), [lineHistoryForm.phoneNumber]);
  const matchingDraftSuggestion = useMemo(() => {
    if (!normalizedPhoneNumber) {
      return null;
    }
    const matchingDraft = drafts.find((draft) => draft.phoneNumber === normalizedPhoneNumber);
    return matchingDraft ? buildHistoryFormDraftSuggestion(matchingDraft) : null;
  }, [drafts, normalizedPhoneNumber]);
  const matchingHistorySuggestion = useMemo(() => {
    const latestHistoryEntry = getLatestMatchingHistoryEntry(lineHistoryEntries, normalizedPhoneNumber, editingHistoryId);
    return latestHistoryEntry ? buildHistoryFormEntrySuggestion(latestHistoryEntry) : null;
  }, [editingHistoryId, lineHistoryEntries, normalizedPhoneNumber]);
  const todayDateString = useMemo(() => today.toISOString().slice(0, 10), [today]);
  const quickActivityParam = searchParams.get('quickActivity');
  const isFirstRun = drafts.length === 0 && lineHistoryEntries.length === 0;
  const lineEvents = useMemo(() => buildLineEventFeed(drafts, lineHistoryEntries, today), [drafts, lineHistoryEntries, today]);
  const historyIntentParam = searchParams.get('historyIntent');
  const historyIntent = historyIntentParam && historyIntentParam in HISTORY_INTENT_VIEW_MAP
    ? (historyIntentParam as HistoryIntentKind)
    : null;
  const historyIntentView = historyIntent ? HISTORY_INTENT_VIEW_MAP[historyIntent] : null;
  const quickActivityDraft = useMemo(
    () => (quickActivityParam ? drafts.find((draft) => draft.phoneNumber === quickActivityParam) ?? null : null),
    [drafts, quickActivityParam],
  );
  const contextualHistoryEvents = useMemo(() => {
    if (!quickActivityDraft) {
      return [];
    }

    return lineEvents.filter((event) => event.draftId === quickActivityDraft.id).slice(0, 3);
  }, [lineEvents, quickActivityDraft]);
  const activityDateQuickPicks = useMemo(
    () => getActivityDateQuickPicks(todayDateString, lineHistoryForm.contractStartDate, matchingHistorySuggestion?.latestActivityDate ?? ''),
    [lineHistoryForm.contractStartDate, matchingHistorySuggestion?.latestActivityDate, todayDateString],
  );

  function renderActivityMemoQuickPickSection(
    activityLog: LineHistoryActivityLogFormState,
    title: string,
    quickPicks: string[],
    pinAction: 'pin' | 'unpin',
    sectionKey: string,
  ): JSX.Element | null {
    if (quickPicks.length === 0) {
      return null;
    }

    const isCollapsed = collapsedActivityMemoSections.includes(sectionKey);

    return (
      <Fragment key={sectionKey}>
        <div className="button-row button-row--tight" style={{ marginTop: sectionKey === 'pinned' ? 0 : '0.75rem', marginBottom: '0.5rem' }}>
          <p className="muted" style={{ margin: 0 }}>{title}（{quickPicks.length}件）</p>
          <button type="button" className="button" onClick={() => toggleActivityMemoSection(sectionKey)}>
            {isCollapsed ? '展開' : '折りたたむ'}
          </button>
        </div>
        {isCollapsed ? null : (
          <div className="stack" style={{ gap: '0.5rem' }}>
          {quickPicks.map((option) => (
            (() => {
              const isCustom = isCustomActivityMemoTemplate(customActivityMemoTemplates, option);
              const customIndex = isCustom ? customActivityMemoTemplates.indexOf(option) : -1;
              const canMoveUp = isCustom && customIndex > 0;
              const canMoveDown = isCustom && customIndex >= 0 && customIndex < customActivityMemoTemplates.length - 1;

              return (
                <div key={`${activityLog.id}-${sectionKey}-${option}`} className="button-row button-row--tight">
                  <button
                    type="button"
                    className={activityLog.activityMemo.trim() === option ? 'button button--primary' : 'button'}
                    onClick={() => updateActivityLogField(activityLog.id, 'activityMemo', applyActivityMemoQuickPick(activityLog.activityMemo, option))}
                  >
                    {option}
                  </button>
                  <button
                    type="button"
                    className="button"
                    onClick={() => (pinAction === 'pin' ? pinActivityMemoTemplate(option) : unpinActivityMemoTemplate(option))}
                  >
                    {pinAction === 'pin' ? '固定' : '固定解除'}
                  </button>
                  <button
                    type="button"
                    className="button"
                    onClick={() => hideActivityMemoTemplate(option)}
                  >
                    非表示
                  </button>
                  {isCustom ? (
                    <>
                      <button
                        type="button"
                        className="button"
                        onClick={() => reorderCustomActivityMemoTemplate(option, 'up')}
                        disabled={!canMoveUp}
                      >
                        上へ
                      </button>
                      <button
                        type="button"
                        className="button"
                        onClick={() => reorderCustomActivityMemoTemplate(option, 'down')}
                        disabled={!canMoveDown}
                      >
                        下へ
                      </button>
                      <button
                        type="button"
                        className="button"
                        disabled={!activityLog.activityMemo.trim() || activityLog.activityMemo.trim() === option}
                        onClick={() => replaceCustomActivityMemoTemplate(option, activityLog.activityMemo)}
                      >
                        現在の文言で更新
                      </button>
                      <button
                        type="button"
                        className="button button--danger"
                        onClick={() => removeCustomActivityMemoTemplate(option)}
                      >
                        削除
                      </button>
                    </>
                  ) : null}
                </div>
              );
            })()
          ))}
          </div>
        )}
      </Fragment>
    );
  }

  function renderHiddenActivityMemoQuickPickSection(quickPicks: string[]): JSX.Element | null {
    if (quickPicks.length === 0) {
      return null;
    }

    const sectionKey = 'hidden';
    const isCollapsed = collapsedActivityMemoSections.includes(sectionKey);

    return (
      <Fragment key={sectionKey}>
        <div className="button-row button-row--tight" style={{ marginTop: '0.75rem', marginBottom: '0.5rem' }}>
          <p className="muted" style={{ margin: 0 }}>非表示候補（{quickPicks.length}件）</p>
          <button type="button" className="button" onClick={() => toggleActivityMemoSection(sectionKey)}>
            {isCollapsed ? '展開' : '折りたたむ'}
          </button>
        </div>
        {isCollapsed ? null : (
          <div className="stack" style={{ gap: '0.5rem' }}>
          {quickPicks.map((option) => (
            <div key={`hidden-${option}`} className="button-row button-row--tight">
              <span className="badge">{option}</span>
              <button type="button" className="button" onClick={() => unhideActivityMemoTemplate(option)}>
                戻す
              </button>
              {isCustomActivityMemoTemplate(customActivityMemoTemplates, option) ? (
                <button type="button" className="button button--danger" onClick={() => removeCustomActivityMemoTemplate(option)}>
                  削除
                </button>
              ) : null}
            </div>
          ))}
          </div>
        )}
      </Fragment>
    );
  }

  function handleImportSampleData(): void {
    try {
      const result = importBundledSampleData();
      setDrafts(result.drafts);
      setLineHistoryEntries(result.historyEntries);
      setCustomActivityMemoTemplates(loadCustomActivityMemoTemplates());
      setHiddenActivityMemoTemplates(loadHiddenActivityMemoTemplates());
      setPinnedActivityMemoTemplates(loadPinnedActivityMemoTemplates());
      setErrorMessage(null);
      setSuccessMessage(`確認用サンプルデータを読み込みました（主台帳 ${result.draftCount} 件 / 履歴 ${result.historyCount} 件）。`);
    } catch {
      setSuccessMessage(null);
      setErrorMessage('確認用サンプルデータの読み込みに失敗しました。');
    }
  }

  // quickActivity パラメータで電話番号が渡された場合フォームにセット
  useEffect(() => {
    if (!quickActivityParam) return;
    const target = drafts.find((d) => d.phoneNumber === quickActivityParam);
    if (!target) return;
    setShowRestoredDraftActions(false);
    setEditingHistoryId(null);
    setLineHistoryForm({
      phoneNumber: target.phoneNumber,
      carrier: target.carrier,
      status: target.status === '利用中' || target.status === '解約予定' || target.status === '解約済み' || target.status === 'MNP転出済み' ? target.status : '利用中',
      contractStartDate: target.contractStartDate,
      contractEndDate: target.contractEndDate,
      activityLogs: [createActivityLogFormState({ activityDate: today.toISOString().slice(0, 10) })],
      memo: '',
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quickActivityParam]);

  useEffect(() => {
    if (!restoredHistoryFormDraft || quickActivityParam) {
      return;
    }

    setShowRestoredDraftActions(true);
    setSuccessMessage('前回の履歴入力下書きを復元しました。');
  }, [quickActivityParam, restoredHistoryFormDraft]);

  useEffect(() => {
    if (!editingHistoryId && isLineHistoryFormEmpty(lineHistoryForm)) {
      clearHistoryFormDraft();
      return;
    }

    saveHistoryFormDraft({
      ...lineHistoryForm,
      editingHistoryId,
      activityLogs: lineHistoryForm.activityLogs.map((log) => ({
        id: log.id,
        activityDate: log.activityDate,
        activityType: log.activityType,
        activityMemo: log.activityMemo,
      })),
    });
  }, [editingHistoryId, lineHistoryForm, quickActivityParam]);

  function resetMessages(): void {
    setErrorMessage(null);
    setSuccessMessage(null);
    setReviewSuggest(null);
  }

  function toggleActivityMemoSection(sectionKey: string): void {
    const nextCollapsed = collapsedActivityMemoSections.includes(sectionKey)
      ? collapsedActivityMemoSections.filter((item) => item !== sectionKey)
      : [...collapsedActivityMemoSections, sectionKey];
    setCollapsedActivityMemoSections(saveCollapsedActivityMemoSections(nextCollapsed));
  }

  function pinActivityMemoTemplate(template: string): void {
    const normalized = template.trim();
    if (!normalized) {
      return;
    }

    const nextPinned = savePinnedActivityMemoTemplates([
      normalized,
      ...pinnedActivityMemoTemplates.filter((item) => item !== normalized),
    ]);

    setPinnedActivityMemoTemplates(nextPinned);
    setErrorMessage(null);
    setSuccessMessage(`活動メモ候補「${normalized}」を固定しました。`);
  }

  function addCustomActivityMemoTemplate(template: string): void {
    const normalized = template.trim();
    if (!normalized) {
      setErrorMessage('候補に追加する活動メモを入力してください。');
      setSuccessMessage(null);
      return;
    }

    if (isCustomActivityMemoTemplate(customActivityMemoTemplates, normalized)) {
      setErrorMessage(null);
      setSuccessMessage(`活動メモ候補「${normalized}」は追加済みです。`);
      return;
    }

    const nextCustom = saveCustomActivityMemoTemplates([
      normalized,
      ...customActivityMemoTemplates.filter((item) => item !== normalized),
    ]);
    setCustomActivityMemoTemplates(nextCustom);
    setErrorMessage(null);
    setSuccessMessage(`活動メモ候補「${normalized}」を追加しました。`);
  }

  function removeCustomActivityMemoTemplate(template: string): void {
    const normalized = template.trim();
    const nextCustom = saveCustomActivityMemoTemplates(
      customActivityMemoTemplates.filter((item) => item !== normalized),
    );
    setCustomActivityMemoTemplates(nextCustom);
    setErrorMessage(null);
    setSuccessMessage(`活動メモ候補「${normalized}」を削除しました。`);
  }

  function replaceCustomActivityMemoTemplate(template: string, nextTemplate: string): void {
    const normalizedCurrent = template.trim();
    const normalizedNext = nextTemplate.trim();

    if (!normalizedNext) {
      setErrorMessage('更新後の活動メモを入力してください。');
      setSuccessMessage(null);
      return;
    }

    if (normalizedCurrent === normalizedNext) {
      setErrorMessage(null);
      setSuccessMessage(`活動メモ候補「${normalizedCurrent}」は最新です。`);
      return;
    }

    const nextCustom = saveCustomActivityMemoTemplates(
      customActivityMemoTemplates.map((item) => (item === normalizedCurrent ? normalizedNext : item)),
    );
    const nextPinned = savePinnedActivityMemoTemplates(
      pinnedActivityMemoTemplates.map((item) => (item === normalizedCurrent ? normalizedNext : item)),
    );
    const nextHidden = saveHiddenActivityMemoTemplates(
      hiddenActivityMemoTemplates.map((item) => (item === normalizedCurrent ? normalizedNext : item)),
    );

    setCustomActivityMemoTemplates(nextCustom);
    setPinnedActivityMemoTemplates(nextPinned);
    setHiddenActivityMemoTemplates(nextHidden);
    setErrorMessage(null);
    setSuccessMessage(`活動メモ候補「${normalizedCurrent}」を「${normalizedNext}」に更新しました。`);
  }

  function reorderCustomActivityMemoTemplate(template: string, direction: 'up' | 'down'): void {
    const normalized = template.trim();
    if (!normalized) {
      return;
    }

    const nextCustom = moveItemInList(customActivityMemoTemplates, normalized, direction);
    if (nextCustom === customActivityMemoTemplates) {
      return;
    }

    setCustomActivityMemoTemplates(saveCustomActivityMemoTemplates(nextCustom));
    setErrorMessage(null);
    setSuccessMessage(`活動メモ候補「${normalized}」を${direction === 'up' ? '上へ' : '下へ'}移動しました。`);
  }

  function unpinActivityMemoTemplate(template: string): void {
    const normalized = template.trim();
    const nextPinned = savePinnedActivityMemoTemplates(
      pinnedActivityMemoTemplates.filter((item) => item !== normalized),
    );

    setPinnedActivityMemoTemplates(nextPinned);
    setErrorMessage(null);
    setSuccessMessage(`活動メモ候補「${normalized}」の固定を解除しました。`);
  }

  function hideActivityMemoTemplate(template: string): void {
    const normalized = template.trim();
    if (!normalized) {
      return;
    }

    const nextHidden = saveHiddenActivityMemoTemplates([
      normalized,
      ...hiddenActivityMemoTemplates.filter((item) => item !== normalized),
    ]);

    setHiddenActivityMemoTemplates(nextHidden);
    setErrorMessage(null);
    setSuccessMessage(`活動メモ候補「${normalized}」を非表示にしました。`);
  }

  function unhideActivityMemoTemplate(template: string): void {
    const normalized = template.trim();
    const nextHidden = saveHiddenActivityMemoTemplates(
      hiddenActivityMemoTemplates.filter((item) => item !== normalized),
    );

    setHiddenActivityMemoTemplates(nextHidden);
    setErrorMessage(null);
    setSuccessMessage(`活動メモ候補「${normalized}」を表示に戻しました。`);
  }

  function resetPinnedActivityMemoTemplates(): void {
    setPinnedActivityMemoTemplates(savePinnedActivityMemoTemplates([]));
    setErrorMessage(null);
    setSuccessMessage('固定候補を初期状態に戻しました。');
  }

  function resetHiddenActivityMemoTemplates(): void {
    setHiddenActivityMemoTemplates(saveHiddenActivityMemoTemplates([]));
    setErrorMessage(null);
    setSuccessMessage('非表示候補を初期状態に戻しました。');
  }

  function resetActivityMemoTemplateState(): void {
    setPinnedActivityMemoTemplates(savePinnedActivityMemoTemplates([]));
    setHiddenActivityMemoTemplates(saveHiddenActivityMemoTemplates([]));
    setErrorMessage(null);
    setSuccessMessage('活動メモ候補の管理状態を初期化しました。');
  }

  function persistLineHistory(nextEntries: LineHistoryEntry[]): void {
    setLineHistoryEntries(nextEntries);
    lineHistoryStore.save(nextEntries);
  }

  function updateLineHistoryField<K extends keyof LineHistoryFormState>(key: K, value: LineHistoryFormState[K]): void {
    setLineHistoryForm((current) => ({ ...current, [key]: value }));
  }

  function updateActivityLogField(id: string, key: keyof LineHistoryActivityLogFormState, value: string): void {
    setLineHistoryForm((current) => ({
      ...current,
      activityLogs: current.activityLogs.map((log) =>
        log.id === id ? { ...log, [key]: value } : log,
      ),
    }));
  }

  function addActivityLogField(): void {
    setLineHistoryForm((current) => ({
      ...current,
      activityLogs: [...current.activityLogs, createActivityLogFormState()],
    }));
  }

  function removeActivityLogField(id: string): void {
    setLineHistoryForm((current) => {
      const nextLogs = current.activityLogs.filter((log) => log.id !== id);
      return {
        ...current,
        activityLogs: nextLogs.length > 0 ? nextLogs : [createActivityLogFormState()],
      };
    });
  }

  function resetLineHistoryForm(): void {
    clearHistoryFormDraft();
    setLineHistoryForm(initialLineHistoryFormState);
    setEditingHistoryId(null);
    setShowRestoredDraftActions(false);
  }

  function handleDiscardRestoredHistoryDraft(): void {
    resetMessages();
    resetLineHistoryForm();
    setSuccessMessage('復元した履歴入力下書きを破棄し、新規入力に戻しました。');
  }

  function applyHistoryFormSuggestion(
    suggestion: HistoryFormDraftSuggestion | HistoryFormEntrySuggestion,
  ): void {
    setLineHistoryForm((current) => ({
      ...current,
      phoneNumber: normalizedPhoneNumber || current.phoneNumber,
      carrier: suggestion.carrier,
      status: suggestion.status,
      contractStartDate: suggestion.contractStartDate,
      contractEndDate: suggestion.contractEndDate,
    }));
  }

  function handleLineHistorySubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    resetMessages();

    try {
      const normalizedActivityLogs = lineHistoryForm.activityLogs
        .map((log) => ({
          id: log.id,
          activityDate: log.activityDate,
          activityType: log.activityType,
          activityMemo: log.activityMemo,
        }))
        .filter((log) => log.activityDate || log.activityType || log.activityMemo);

      if (editingHistoryId) {
        const current = lineHistoryEntries.find((entry) => entry.id === editingHistoryId);
        if (!current) {
          clearHistoryFormDraft();
          setErrorMessage('編集中の契約履歴が見つかりませんでした。');
          setEditingHistoryId(null);
          return;
        }

        const updated = createLineHistoryEntry({
          phoneNumber: lineHistoryForm.phoneNumber,
          carrier: lineHistoryForm.carrier,
          status: lineHistoryForm.status,
          contractStartDate: lineHistoryForm.contractStartDate,
          contractEndDate: lineHistoryForm.contractEndDate,
          activityLogs: normalizedActivityLogs,
          memo: lineHistoryForm.memo,
        });

        const nextEntries = lineHistoryEntries.map((entry) =>
          entry.id === editingHistoryId
            ? { ...updated, id: current.id, createdAt: current.createdAt }
            : entry,
        );

        persistLineHistory(nextEntries);
        resetLineHistoryForm();
        setSuccessMessage('契約履歴を更新しました。');
        return;
      }

      const nextEntry = createLineHistoryEntry({
        phoneNumber: lineHistoryForm.phoneNumber,
        carrier: lineHistoryForm.carrier,
        status: lineHistoryForm.status,
        contractStartDate: lineHistoryForm.contractStartDate,
        contractEndDate: lineHistoryForm.contractEndDate,
        activityLogs: normalizedActivityLogs,
        memo: lineHistoryForm.memo,
      });

      persistLineHistory([nextEntry, ...lineHistoryEntries]);
      resetLineHistoryForm();
      setSuccessMessage('契約履歴を保存しました。');

      // 次回確認日サジェスト
      const sortedDates = normalizedActivityLogs
        .map((log) => log.activityDate)
        .filter(Boolean)
        .sort();
      const latestActivityDate = sortedDates.length > 0 ? sortedDates[sortedDates.length - 1] : undefined;
      if (latestActivityDate) {
        const relatedDraft = drafts.find(
          (d) => d.phoneNumber === lineHistoryForm.phoneNumber || (d.last4 && d.last4 === lineHistoryForm.phoneNumber.slice(-4)),
        );
        if (relatedDraft) {
          const base = new Date(`${latestActivityDate}T00:00:00`);
          base.setDate(base.getDate() + notificationSettings.reviewIntervalDays);
          const suggestedDate = base.toISOString().slice(0, 10);
          setReviewSuggest({ draftId: relatedDraft.id, draftName: relatedDraft.lineName, suggestedDate });
        }
      }
    } catch {
      setErrorMessage('電話番号・キャリア・契約開始日は必須です。電話番号は 10〜11 桁で入力してください。');
    }
  }

  function handleApplyReviewSuggest(): void {
    if (!reviewSuggest) return;
    const target = drafts.find((d) => d.id === reviewSuggest.draftId);
    if (!target) return;
    const updated = updateLineDraft(target, { ...target, nextReviewDate: reviewSuggest.suggestedDate });
    lineDraftStore.save(drafts.map((d) => (d.id === updated.id ? updated : d)));
    setReviewSuggest(null);
    setSuccessMessage(`「${reviewSuggest.draftName}」の次回確認日を ${reviewSuggest.suggestedDate} に更新しました。`);
  }

  function handleEditLineHistory(entry: LineHistoryEntry): void {
    resetMessages();
    setShowRestoredDraftActions(false);
    setEditingHistoryId(entry.id);
    setLineHistoryForm(toLineHistoryFormState(entry));
  }

  function handleDeleteLineHistory(entryId: string): void {
    resetMessages();
    const nextEntries = lineHistoryEntries.filter((entry) => entry.id !== entryId);
    persistLineHistory(nextEntries);
    if (editingHistoryId === entryId) resetLineHistoryForm();
    setSuccessMessage('契約履歴を削除しました。');
  }

  function handleExportLineHistory(): void {
    resetMessages();
    downloadJson('line-history-backup.json', lineHistoryStore.exportJson());
    setSuccessMessage('契約履歴の JSON をエクスポートしました。');
  }

  async function handleImportLineHistory(event: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    if (!file) return;
    resetMessages();
    try {
      const raw = await file.text();
      const imported = lineHistoryStore.importJson(raw);
      setLineHistoryEntries(imported);
      setEditingHistoryId(null);
      setTimelinePhoneFilter(null);
      setHiddenActivityMemoTemplates(loadHiddenActivityMemoTemplates());
      setPinnedActivityMemoTemplates(loadPinnedActivityMemoTemplates());
      resetLineHistoryForm();
      setSuccessMessage(`契約履歴を ${imported.length} 件読み込みました。`);
    } catch {
      setErrorMessage('契約履歴 JSON の読み込みに失敗しました。形式を確認してください。');
    } finally {
      event.target.value = '';
    }
  }

  // ---------------------------------------------------------------------------
  // Derived state
  // ---------------------------------------------------------------------------

  const lineHistoryGroups = useMemo(() => buildLineHistoryGroups(lineHistoryEntries), [lineHistoryEntries]);
  const visibleLineHistoryGroups = useMemo(() => {
    return lineHistoryGroups
      .filter((group) => !timelinePhoneFilter || timelinePhoneFilter.includes(group.phoneNumber))
      .map((group) => {
        const visibleEntries = group.entries.filter((entry) =>
          isEntryVisibleInTimeline(entry, timelineWindow, timelineViewMode, today),
        );
        return {
          ...group,
          visibleEntries,
          relatedDrafts: findRelatedDrafts(group.entries[0], drafts),
        } satisfies VisibleLineHistoryGroup;
      })
      .filter((group) => group.visibleEntries.length > 0);
  }, [drafts, lineHistoryGroups, timelinePhoneFilter, timelineViewMode, timelineWindow, today]);

  const totalVisibleTimelineEntries = useMemo(
    () => visibleLineHistoryGroups.reduce((sum, group) => sum + group.visibleEntries.length, 0),
    [visibleLineHistoryGroups],
  );

  const visibleTimelineStatusLabel = timelinePhoneFilter
    ? `関連履歴に絞り込み中: ${timelinePhoneFilter.length}番号`
    : '全履歴を表示';

  const historySubmitLabel = editingHistoryId ? '履歴を更新する' : '履歴を保存する';

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="page">
      <header className="page__header">
        <div>
          <p className="page__eyebrow">契約履歴 / タイムライン</p>
          <h2>履歴・タイムライン</h2>
          <p className="muted">電話番号単位で契約の経緯や活動ログを記録します。回線一覧と紐付けて参照できます。</p>
        </div>
      </header>

      <section className="card-grid card-grid--history-hero">
        <article className="card card--accent">
          <div className="card__header">
            <h3>履歴の要点</h3>
            <span className="badge">{visibleLineHistoryGroups.length}番号</span>
          </div>
          <div className="history-kpi-grid">
            <div className="history-kpi">
              <span className="history-kpi__label">履歴件数</span>
              <strong className="history-kpi__value">{lineHistoryEntries.length}</strong>
            </div>
            <div className="history-kpi">
              <span className="history-kpi__label">表示中</span>
              <strong className="history-kpi__value">{visibleTimelineStatusLabel}</strong>
            </div>
            <div className="history-kpi">
              <span className="history-kpi__label">可視ログ</span>
              <strong className="history-kpi__value">{totalVisibleTimelineEntries}件</strong>
            </div>
          </div>
          <div className="badge-row" style={{ marginTop: '0.75rem' }}>
            <span className="badge badge--ok">{getTimelineRangeLabel(timelineWindow)}</span>
            <span className="badge badge--info">{TIMELINE_VIEW_OPTIONS.find((option) => option.key === timelineViewMode)?.label}</span>
            <span className="badge">{lineHistoryGroups.length - visibleLineHistoryGroups.length}番号をフィルタ</span>
          </div>
        </article>

        <article className="card">
          <div className="card__header">
            <h3>クイック操作</h3>
            <span className="badge">履歴 / タイムライン</span>
          </div>
          <p className="muted">フォーム、一覧、入出力をすばやく切り替えます。</p>
          <div className="button-row button-row--tight">
            <a className="button button--primary" href="#history-form">フォームへ</a>
            <a className="button" href="#history-timeline">タイムラインへ</a>
            <button type="button" className="button" onClick={handleExportLineHistory}>履歴 JSON をエクスポート</button>
            <button type="button" className="button" onClick={() => historyImportInputRef.current?.click()}>履歴 JSON をインポート</button>
            {isFirstRun ? (
              <button type="button" className="button" onClick={handleImportSampleData}>確認用サンプルデータを読み込む</button>
            ) : null}
            {timelinePhoneFilter ? (
              <button type="button" className="button" onClick={() => setTimelinePhoneFilter(null)}>絞り込み解除</button>
            ) : null}
          </div>
          {historyIntentView || quickActivityDraft ? (
            <div className="detail-panel" style={{ marginTop: '0.75rem' }}>
              <div className="card__header">
                <h3>開いている文脈</h3>
                {historyIntentView ? (
                  <span className={`badge badge--${historyIntentView.tone}`}>{historyIntentView.label}</span>
                ) : (
                  <span className="badge">履歴記録</span>
                )}
              </div>
              <p className="muted" style={{ marginTop: 0 }}>
                Dashboard からの遷移文脈をこのページに引き継いでいます。ここで活動ログを残すと、要対応イベントの消化記録になります。
              </p>
              {quickActivityDraft ? (
                <div className="badge-row" style={{ marginBottom: '0.75rem' }}>
                  <span className="badge badge--ok">{quickActivityDraft.lineName}</span>
                  <span className="badge">{quickActivityDraft.carrier}</span>
                  <span className="badge">{quickActivityDraft.status}</span>
                </div>
              ) : null}
              {historyIntentView ? <p className="muted" style={{ marginTop: 0 }}>{historyIntentView.description}</p> : null}
              {contextualHistoryEvents.length > 0 ? (
                <ul className="list list--drafts">
                  {contextualHistoryEvents.map((event) => (
                    <li key={event.id}>
                      <div className="list__row">
                        <strong>{event.title}</strong>
                        <span className={`badge badge--${event.severity === 'critical' ? 'danger' : event.severity === 'warning' ? 'warn' : 'info'}`}>
                          {event.severity === 'critical' ? 'Critical' : event.severity === 'warning' ? 'Warning' : 'Watch'}
                        </span>
                      </div>
                      <span>{event.detail}</span>
                      <div className="button-row button-row--tight">
                        <Link className="button button--sm" to={event.to}>
                          {event.ctaLabel}
                        </Link>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
          <p className="muted" style={{ marginBottom: 0 }}>表示期間や対象の切り替えはタイムライン側で行います。</p>
        </article>
      </section>

      <section className="card-grid card-grid--single">
        <article className="card" id="history-form">
          <div className="card__header">
            <h3>契約履歴の登録</h3>
            <span className="badge">{editingHistoryId ? '履歴編集中' : '電話番号単位'}</span>
          </div>
          <p className="muted">過去契約や MNP 転出済みの履歴は、現在の回線一覧とは別に軽量な契約エピソードとして記録します。</p>
          <form className="form-grid" onSubmit={handleLineHistorySubmit}>
            <label className="field">
              <span>電話番号 *</span>
              <input value={lineHistoryForm.phoneNumber} onChange={(event) => updateLineHistoryField('phoneNumber', event.target.value)} placeholder="例: 09012345678" />
            </label>
            <label className="field">
              <span>キャリア *</span>
              <input value={lineHistoryForm.carrier} onChange={(event) => updateLineHistoryField('carrier', event.target.value)} placeholder="例: NTTドコモ" />
            </label>
            <label className="field">
              <span>契約状態 *</span>
              <select value={lineHistoryForm.status} onChange={(event) => updateLineHistoryField('status', event.target.value as LineHistoryStatus)}>
                {LINE_HISTORY_STATUS_OPTIONS.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>契約開始日 *</span>
              <input type="date" value={lineHistoryForm.contractStartDate} onChange={(event) => updateLineHistoryField('contractStartDate', event.target.value)} />
            </label>
            <label className="field">
              <span>契約終了日</span>
              <input type="date" value={lineHistoryForm.contractEndDate} onChange={(event) => updateLineHistoryField('contractEndDate', event.target.value)} />
            </label>
            {matchingDraftSuggestion || matchingHistorySuggestion ? (
              <div className="detail-panel field--full" style={{ marginTop: '0.5rem' }}>
                <div className="card__header">
                  <h3>下書き候補</h3>
                  <span className="badge">{[matchingDraftSuggestion, matchingHistorySuggestion].filter(Boolean).length}件</span>
                </div>
                <p className="muted" style={{ marginTop: 0 }}>電話番号に一致する主台帳や既存履歴から、契約情報を1タップで反映できます。</p>
                <div className="stack" style={{ gap: '0.75rem' }}>
                  {matchingDraftSuggestion ? (
                    <div className="detail-panel" style={{ margin: 0 }}>
                      <div className="card__header">
                        <h3>{matchingDraftSuggestion.label}</h3>
                        <span className="badge badge--ok">{matchingDraftSuggestion.status}</span>
                      </div>
                      <p className="muted">{matchingDraftSuggestion.description}</p>
                      <div className="button-row button-row--tight">
                        <button type="button" className="button" onClick={() => applyHistoryFormSuggestion(matchingDraftSuggestion)}>主台帳候補を反映</button>
                      </div>
                    </div>
                  ) : null}
                  {matchingHistorySuggestion ? (
                    <div className="detail-panel" style={{ margin: 0 }}>
                      <div className="card__header">
                        <h3>{matchingHistorySuggestion.label}</h3>
                        <span className={isCurrentHistoryStatus(matchingHistorySuggestion.status) ? 'badge badge--ok' : 'badge'}>{matchingHistorySuggestion.status}</span>
                      </div>
                      <p className="muted">{matchingHistorySuggestion.description}</p>
                      <div className="button-row button-row--tight">
                        <button type="button" className="button" onClick={() => applyHistoryFormSuggestion(matchingHistorySuggestion)}>直近履歴候補を反映</button>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}
            <div className="detail-panel field--full" style={{ marginTop: '0.5rem' }}>
              <div className="card__header">
                <h3>活動ログ</h3>
                <button type="button" className="button" onClick={addActivityLogField}>活動ログを追加</button>
              </div>
              <div className="stack" style={{ gap: '0.75rem' }}>
                {lineHistoryForm.activityLogs.map((activityLog, index) => (
                  <div key={activityLog.id} className="detail-panel" style={{ margin: 0 }}>
                    <div className="card__header">
                      <h3>活動ログ {index + 1}</h3>
                      <button type="button" className="button button--danger" onClick={() => removeActivityLogField(activityLog.id)}>
                        このログを削除
                      </button>
                    </div>
                    <div className="form-grid">
                      <label className="field">
                        <span>活動日</span>
                        <input type="date" value={activityLog.activityDate} onChange={(event) => updateActivityLogField(activityLog.id, 'activityDate', event.target.value)} />
                        <div className="button-row button-row--tight">
                          {activityDateQuickPicks.map((option) => (
                            <button
                              key={`${activityLog.id}-${option.label}`}
                              type="button"
                              className={activityLog.activityDate === option.value ? 'button button--primary' : 'button'}
                              onClick={() => updateActivityLogField(activityLog.id, 'activityDate', option.value)}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                      </label>
                      <label className="field">
                        <span>活動種別</span>
                        <select value={activityLog.activityType} onChange={(event) => updateActivityLogField(activityLog.id, 'activityType', event.target.value)}>
                          {getActivityTypeOptions(allActivityTypes, activityLog.activityType).map((option) => (
                            <option key={option} value={option}>{option}</option>
                          ))}
                        </select>
                        <div className="button-row button-row--tight">
                          {getVisibleActivityTypeQuickPicks(activityTypeQuickPicks, activityLog.activityType).map((option) => (
                            <button
                              key={option}
                              type="button"
                              className={activityLog.activityType === option ? 'button button--primary' : 'button'}
                              onClick={() => updateActivityLogField(activityLog.id, 'activityType', option)}
                            >
                              {option}
                            </button>
                          ))}
                        </div>
                      </label>
                      <label className="field field--full">
                        <span>活動メモ</span>
                        <textarea value={activityLog.activityMemo} onChange={(event) => updateActivityLogField(activityLog.id, 'activityMemo', event.target.value)} rows={2} placeholder="例: 発信テスト実施 / データ通信実施 / 請求確認" />
                        <div className="detail-panel" style={{ marginTop: '0.5rem' }}>
                          {pinnedActivityMemoTemplates.length > 0 || hiddenActivityMemoTemplates.length > 0 ? (
                            <>
                              <p className="muted" style={{ marginTop: 0, marginBottom: '0.5rem' }}>候補管理</p>
                              <div className="button-row button-row--tight" style={{ marginBottom: '0.75rem' }}>
                                {pinnedActivityMemoTemplates.length > 0 ? (
                                  <button type="button" className="button" onClick={resetPinnedActivityMemoTemplates}>
                                    固定候補をクリア
                                  </button>
                                ) : null}
                                {hiddenActivityMemoTemplates.length > 0 ? (
                                  <button type="button" className="button" onClick={resetHiddenActivityMemoTemplates}>
                                    非表示候補をクリア
                                  </button>
                                ) : null}
                                <button type="button" className="button" onClick={resetActivityMemoTemplateState}>
                                  候補管理を初期化
                                </button>
                              </div>
                            </>
                          ) : null}
                          {buildActivityMemoQuickPickSections({
                            pinnedTemplates: pinnedActivityMemoTemplates,
                            hiddenTemplates: hiddenActivityMemoTemplates,
                            typeSpecificQuickPicks: getTypeSpecificActivityMemoQuickPicks(activityMemoQuickPickIndex, activityLog.activityType).filter(
                              (option) => !isPinnedActivityMemoTemplate(pinnedActivityMemoTemplates, option),
                            ),
                            customQuickPicks: customActivityMemoTemplates.filter(
                              (option) => !isPinnedActivityMemoTemplate(pinnedActivityMemoTemplates, option),
                            ),
                            templateQuickPicks: ACTIVITY_MEMO_TEMPLATE_OPTIONS.filter(
                              (option) => !isPinnedActivityMemoTemplate(pinnedActivityMemoTemplates, option),
                            ),
                            recentQuickPicks: recentActivityMemoQuickPicks.filter(
                              (option) => !isPinnedActivityMemoTemplate(pinnedActivityMemoTemplates, option),
                            ),
                          }).map((section) =>
                            renderActivityMemoQuickPickSection(
                              activityLog,
                              section.title,
                              section.quickPicks,
                              section.pinAction,
                              section.key,
                            ),
                          )}
                          {renderHiddenActivityMemoQuickPickSection(hiddenActivityMemoTemplates)}
                          <div className="button-row button-row--tight" style={{ marginTop: '0.75rem' }}>
                            <button
                              type="button"
                              className="button"
                              onClick={() => addCustomActivityMemoTemplate(activityLog.activityMemo)}
                            >
                              この文言を候補に追加
                            </button>
                          </div>
                        </div>
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <label className="field field--full">
              <span>メモ</span>
              <textarea value={lineHistoryForm.memo} onChange={(event) => updateLineHistoryField('memo', event.target.value)} rows={3} placeholder="例: au から LINEMO へ MNP など" />
            </label>
            {reviewSuggest && (
              <div className="notice field--full">
                <p>「{reviewSuggest.draftName}」の次回確認日を <strong>{reviewSuggest.suggestedDate}</strong> に更新しますか？（活動日 +{notificationSettings.reviewIntervalDays}日）</p>
                <div className="button-row">
                  <button type="button" className="button button--primary" onClick={handleApplyReviewSuggest}>更新する</button>
                  <button type="button" className="button" onClick={() => setReviewSuggest(null)}>スキップ</button>
                </div>
              </div>
            )}
            {errorMessage ? <p className="notice notice--warn field--full">{errorMessage}</p> : null}
            {successMessage ? (
              <div className="notice field--full">
                <p>{successMessage}</p>
                {showRestoredDraftActions ? (
                  <div className="button-row">
                    <button type="button" className="button" onClick={handleDiscardRestoredHistoryDraft}>破棄して新規入力</button>
                  </div>
                ) : null}
              </div>
            ) : null}
            <div className="button-row field--full">
              <button type="submit" className="button button--primary">{historySubmitLabel}</button>
              <button type="button" className="button" onClick={resetLineHistoryForm}>入力をリセット</button>
              <button type="button" className="button" onClick={handleExportLineHistory}>履歴 JSON をエクスポート</button>
              <button type="button" className="button" onClick={() => historyImportInputRef.current?.click()}>履歴 JSON をインポート</button>
              <input ref={historyImportInputRef} type="file" accept="application/json,.json" style={{ display: 'none' }} onChange={handleImportLineHistory} />
            </div>
          </form>
        </article>
      </section>

      <section className="card-grid card-grid--single">
        <article className="card" id="history-timeline">
          <div className="card__header">
            <h3>電話番号単位の履歴タイムライン</h3>
            <span className="badge">{visibleLineHistoryGroups.length}番号 / {totalVisibleTimelineEntries}件</span>
          </div>
          <div className="form-grid">
            <label className="field">
              <span>表示期間</span>
              <select value={timelineWindow} onChange={(event) => setTimelineWindow(event.target.value as TimelineWindowKey)}>
                {TIMELINE_WINDOW_OPTIONS.map((option) => (
                  <option key={option.key} value={option.key}>{option.label}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>表示対象</span>
              <select value={timelineViewMode} onChange={(event) => setTimelineViewMode(event.target.value as TimelineViewMode)}>
                {TIMELINE_VIEW_OPTIONS.map((option) => (
                  <option key={option.key} value={option.key}>{option.label}</option>
                ))}
              </select>
            </label>
          </div>
          <p className="muted">表示期間: {getTimelineRangeLabel(timelineWindow)} / 表示対象: {TIMELINE_VIEW_OPTIONS.find((option) => option.key === timelineViewMode)?.label}</p>
          {timelinePhoneFilter ? (
            <div className="button-row button-row--tight" style={{ marginBottom: '0.75rem' }}>
              <span className="badge badge--ok">関連履歴に絞り込み中: {timelinePhoneFilter.length}番号</span>
              <button type="button" className="button" onClick={() => setTimelinePhoneFilter(null)}>絞り込み解除</button>
            </div>
          ) : null}
          {visibleLineHistoryGroups.length === 0 ? (
            lineHistoryGroups.length === 0 ? (
              <>
                <p className="muted">履歴はまだありません。主台帳から「活動を記録」で始めるか、上のフォームから過去契約を1件追加するとここにタイムラインが表示されます。</p>
                <div className="detail-panel">
                  <p className="muted" style={{ marginTop: 0 }}>
                    既存データがある場合は、`/settings/backup` から統合バックアップを復元できます。
                  </p>
                  <div className="button-row button-row--tight">
                    <a className="button button--primary" href="#history-form">履歴フォームに戻る</a>
                    {isFirstRun ? (
                      <button type="button" className="button" onClick={handleImportSampleData}>確認用サンプルデータを読み込む</button>
                    ) : null}
                    <Link className="button" to="/lines">回線一覧で1件追加する</Link>
                    <Link className="button" to="/settings/backup">バックアップを復元する</Link>
                  </div>
                </div>
              </>
            ) : (
              <p className="muted">現在の表示条件に一致する履歴はありません。期間または表示対象を切り替えて確認してください。</p>
            )
          ) : (
            <div className="stack">
              {visibleLineHistoryGroups.map((group) => (
                <div key={group.phoneNumber} className="detail-panel">
                  <div className="card__header">
                    <h3>{group.maskedPhoneNumber}</h3>
                    <span className="badge">表示 {group.visibleEntries.length}件 / 全 {group.entries.length}件</span>
                  </div>
                  <p className="muted">履歴全体: {formatDate(group.earliestDate)} 〜 {formatDate(group.latestDate)}</p>
                  {group.relatedDrafts.length > 0 ? (
                    <div className="detail-panel" style={{ marginBottom: '0.75rem' }}>
                      <div className="card__header">
                        <h3>関連主台帳候補</h3>
                        <span className="badge">{group.relatedDrafts.length}件</span>
                      </div>
                      <div className="badge-row">
                        {group.relatedDrafts.map((draft) => (
                          <span key={draft.id} className="badge badge--ok">
                            {draft.lineName} / {draft.phoneNumber ? maskPhoneNumber(draft.phoneNumber) : draft.last4 ? `***-****-${draft.last4}` : '未設定'}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  <div className="stack" style={{ gap: '0.75rem' }}>
                    {group.visibleEntries.map((entry, index) => {
                      const timelineStyle = calculateTimelineStyleForWindow(entry, timelineWindow, today, group.earliestDate, group.latestDate);
                      const previousEntry = index > 0 ? group.visibleEntries[index - 1] : null;
                      return (
                        <div key={entry.id} className="detail-panel" style={{ margin: 0 }}>
                          <div className="card__header">
                            <h3>{entry.carrier}</h3>
                            <span className={isCurrentHistoryStatus(entry.status) ? 'badge badge--ok' : 'badge'}>{entry.status}</span>
                          </div>
                          <div className="list__summary-grid">
                            <span>開始: {formatDate(entry.contractStartDate)}</span>
                            <span>終了: {entry.contractEndDate ? formatDate(entry.contractEndDate) : '継続中'}</span>
                          </div>
                          {getLatestActivityDate(entry.activityLogs) != null ? (
                            <div className="badge-row" style={{ marginTop: '0.25rem' }}>
                              <span className="badge">最終活動: {formatDate(getLatestActivityDate(entry.activityLogs)!)}</span>
                            </div>
                          ) : null}
                          {previousEntry ? <p className="muted">直前の移動: {previousEntry.carrier} → {entry.carrier}</p> : null}
                          {entry.memo ? <p className="muted">{entry.memo}</p> : null}
                          {entry.activityLogs.length > 0 ? (
                            <div className="detail-panel" style={{ marginTop: '0.5rem', marginBottom: '0.5rem' }}>
                              <div className="card__header">
                                <h3>活動ログ</h3>
                                <span className="badge">{entry.activityLogs.length}件</span>
                              </div>
                              <div className="stack" style={{ gap: '0.5rem' }}>
                                {[...entry.activityLogs]
                                  .sort((a, b) => (b.activityDate || '').localeCompare(a.activityDate || ''))
                                  .map((activityLog) => (
                                    <div key={activityLog.id}>
                                      <div className="badge-row" style={{ marginBottom: '0.25rem' }}>
                                        {activityLog.activityDate ? <span className="badge">{formatDate(activityLog.activityDate)}</span> : null}
                                        {activityLog.activityType ? <span className="badge badge--ok">{activityLog.activityType}</span> : null}
                                      </div>
                                      {activityLog.activityMemo ? <p className="muted" style={{ margin: 0 }}>{activityLog.activityMemo}</p> : null}
                                    </div>
                                  ))}
                              </div>
                            </div>
                          ) : null}
                          {calculateContractDurationDays(entry.contractStartDate, entry.contractEndDate || '') != null ? (
                            <p className="muted">契約維持日数: {calculateContractDurationDays(entry.contractStartDate, entry.contractEndDate || '')}日</p>
                          ) : null}
                          {group.relatedDrafts.length > 0 ? (
                            <p className="muted">関連主台帳候補: {group.relatedDrafts.map((draft) => draft.lineName).join(' / ')}</p>
                          ) : null}
                          <div style={{ position: 'relative', marginTop: '0.5rem', height: '1.5rem', background: 'rgba(148, 163, 184, 0.2)', borderRadius: '999px', overflow: 'hidden' }}>
                            <div style={{ position: 'absolute', top: 0, bottom: 0, left: timelineStyle.left, width: timelineStyle.width, borderRadius: '999px', background: 'rgba(59, 130, 246, 0.8)' }} />
                          </div>
                          <div className="button-row button-row--tight">
                            <button type="button" className="button" onClick={() => handleEditLineHistory(entry)}>編集する</button>
                            <button type="button" className="button button--danger" onClick={() => handleDeleteLineHistory(entry.id)}>削除する</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </article>
      </section>
    </div>
  );
}
