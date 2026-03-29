import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { lineDraftStore, normalizePhoneNumber, type LineDraft } from '../lib/lineDrafts';
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
const ACTIVITY_MEMO_TEMPLATE_OPTIONS = [
  '請求確認。',
  '通信テスト実施。正常。',
  '通話テスト実施。正常。',
  'SMS送信テスト実施。正常。',
  'MNP予約番号取得。',
  '月額変動なし。',
] as const;

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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function HistoryPage(): JSX.Element {
  const [searchParams] = useSearchParams();
  const [drafts] = useState<LineDraft[]>(() => lineDraftStore.load());
  const [lineHistoryEntries, setLineHistoryEntries] = useState<LineHistoryEntry[]>(() => lineHistoryStore.load());
  const [lineHistoryForm, setLineHistoryForm] = useState<LineHistoryFormState>(initialLineHistoryFormState);
  const [editingHistoryId, setEditingHistoryId] = useState<string | null>(null);
  const [timelineWindow, setTimelineWindow] = useState<TimelineWindowKey>('6m');
  const [timelineViewMode, setTimelineViewMode] = useState<TimelineViewMode>('all');
  const [timelinePhoneFilter, setTimelinePhoneFilter] = useState<string[] | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [reviewSuggest, setReviewSuggest] = useState<{ draftId: string; draftName: string; suggestedDate: string } | null>(null);
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
  const activityDateQuickPicks = useMemo(
    () => getActivityDateQuickPicks(todayDateString, lineHistoryForm.contractStartDate, matchingHistorySuggestion?.latestActivityDate ?? ''),
    [lineHistoryForm.contractStartDate, matchingHistorySuggestion?.latestActivityDate, todayDateString],
  );

  // quickActivity パラメータで電話番号が渡された場合フォームにセット
  const quickActivityParam = searchParams.get('quickActivity');
  useEffect(() => {
    if (!quickActivityParam) return;
    const target = drafts.find((d) => d.phoneNumber === quickActivityParam);
    if (!target) return;
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

  function resetMessages(): void {
    setErrorMessage(null);
    setSuccessMessage(null);
    setReviewSuggest(null);
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
    setLineHistoryForm(initialLineHistoryFormState);
    setEditingHistoryId(null);
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
                          <p className="muted" style={{ marginTop: 0, marginBottom: '0.5rem' }}>定型候補</p>
                          <div className="button-row button-row--tight">
                            {ACTIVITY_MEMO_TEMPLATE_OPTIONS.map((option) => (
                              <button
                                key={option}
                                type="button"
                                className="button"
                                onClick={() => updateActivityLogField(activityLog.id, 'activityMemo', applyActivityMemoQuickPick(activityLog.activityMemo, option))}
                              >
                                {option}
                              </button>
                            ))}
                          </div>
                          {recentActivityMemoQuickPicks.length > 0 ? (
                            <>
                              <p className="muted" style={{ marginTop: '0.75rem', marginBottom: '0.5rem' }}>最近使った文言</p>
                              <div className="button-row button-row--tight">
                                {recentActivityMemoQuickPicks.map((option) => (
                                  <button
                                    key={option}
                                    type="button"
                                    className="button"
                                    onClick={() => updateActivityLogField(activityLog.id, 'activityMemo', applyActivityMemoQuickPick(activityLog.activityMemo, option))}
                                  >
                                    {option}
                                  </button>
                                ))}
                              </div>
                            </>
                          ) : null}
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
            {successMessage ? <p className="notice field--full">{successMessage}</p> : null}
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
        <article className="card">
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
                    既存データがある場合は、`/settings` から統合バックアップを復元できます。
                  </p>
                  <div className="button-row button-row--tight">
                    <a className="button button--primary" href="#history-form">履歴フォームに戻る</a>
                    <Link className="button" to="/lines">回線一覧で1件追加する</Link>
                    <Link className="button" to="/settings">バックアップを復元する</Link>
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
