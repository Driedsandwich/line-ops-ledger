import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  createLineDraft,
  DEFAULT_LINE_TYPE,
  lineDraftStore,
  LINE_STATUS_OPTIONS,
  LINE_TYPE_OPTIONS,
  normalizeLast4,
  normalizeMonthlyCost,
  normalizeReviewDate,
  updateLineDraft,
  type LineDraft,
  type LineStatus,
  type LineType,
} from '../lib/lineDrafts';
import {
  createLineHistoryEntry,
  lineHistoryStore,
  LINE_HISTORY_STATUS_OPTIONS,
  type LineHistoryEntry,
  type LineHistoryStatus,
} from '../lib/lineHistory';
import {
  loadNotificationSettings,
  type NotificationReminderWindow,
} from '../lib/notificationSettings';

type FormState = {
  lineName: string;
  carrier: string;
  lineType: LineType;
  monthlyCost: string;
  last4: string;
  contractHolderNote: string;
  contractStartDate: string;
  contractEndDate: string;
  contractHolder: string;
  serviceUser: string;
  paymentMethod: string;
  planName: string;
  deviceName: string;
  status: LineStatus;
  memo: string;
  nextReviewDate: string;
};

type LineHistoryFormState = {
  phoneNumber: string;
  carrier: string;
  status: LineHistoryStatus;
  contractStartDate: string;
  contractEndDate: string;
  memo: string;
};

type FilterState = {
  keyword: string;
  status: 'all' | LineStatus;
  lineType: 'all' | LineType;
  notificationTargetOnly: boolean;
  notificationReason: 'all' | NotificationReasonLabel;
  contractActiveOnly: boolean;
};

type UndoState = {
  drafts: LineDraft[];
  label: string;
};

type SortKey = 'nextReviewDate' | 'monthlyCostHigh' | 'monthlyCostLow' | 'createdAtDesc' | 'createdAtAsc';

type DeadlineStatus = {
  label: string;
  className: string;
  rank: number;
};

type NotificationReasonLabel = '期限超過' | '今日期限' | '3日以内' | '7日以内';

type NotificationReasonParam = 'overdue' | 'today' | 'within-3-days' | 'within-7-days';

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
};

const notificationReasonParamMap: Record<NotificationReasonParam, NotificationReasonLabel> = {
  overdue: '期限超過',
  today: '今日期限',
  'within-3-days': '3日以内',
  'within-7-days': '7日以内',
};

const CARRIER_OPTIONS = ['NTTドコモ', 'ahamo', 'au', 'UQ mobile', 'ソフトバンク', 'Y!mobile', 'LINEMO', '楽天モバイル', 'IIJmio', 'mineo', 'NUROモバイル', 'povo', 'irumo', 'その他'] as const;
const PAYMENT_METHOD_OPTIONS = ['クレジットカード', '口座振替', '請求書', '家族合算', 'その他'] as const;
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

function getNotificationReasonLabelFromParam(value: string | null): NotificationReasonLabel | 'all' {
  if (!value) {
    return 'all';
  }

  if (value in notificationReasonParamMap) {
    return notificationReasonParamMap[value as NotificationReasonParam];
  }

  return 'all';
}

function getNotificationReasonParam(label: NotificationReasonLabel | 'all'): NotificationReasonParam | null {
  if (label === 'all') {
    return null;
  }

  return (Object.entries(notificationReasonParamMap).find(([, mappedLabel]) => mappedLabel === label)?.[0] ?? null) as NotificationReasonParam | null;
}

function getNotificationTargetOnlyFromParam(value: string | null): boolean {
  return value === 'true';
}

const initialFormState: FormState = {
  lineName: '',
  carrier: 'NTTドコモ',
  lineType: DEFAULT_LINE_TYPE,
  monthlyCost: '',
  last4: '',
  contractHolderNote: '',
  contractStartDate: '',
  contractEndDate: '',
  contractHolder: '',
  serviceUser: '',
  paymentMethod: 'クレジットカード',
  planName: '',
  deviceName: '',
  status: '利用中',
  memo: '',
  nextReviewDate: '',
};

const initialLineHistoryFormState: LineHistoryFormState = {
  phoneNumber: '',
  carrier: '',
  status: '利用中',
  contractStartDate: '',
  contractEndDate: '',
  memo: '',
};

const initialFilterState: FilterState = {
  keyword: '',
  status: 'all',
  lineType: 'all',
  notificationTargetOnly: false,
  notificationReason: 'all',
  contractActiveOnly: false,
};

const initialSortKey: SortKey = 'nextReviewDate';

function isEditableElement(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable;
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

function parseReviewDate(value: string): Date | null {
  const normalized = normalizeReviewDate(value);
  if (!normalized) {
    return null;
  }

  const parsed = new Date(`${normalized}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseDate(value: string): Date | null {
  if (!value) {
    return null;
  }
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function calculateElapsedDays(value: string): number | null {
  const date = parseDate(value);
  if (!date) {
    return null;
  }
  return Math.max(diffInDays(date, new Date()), 0);
}

function isCurrentContract(status: LineStatus): boolean {
  return status === '利用中' || status === '解約予定';
}

function isCurrentHistoryStatus(status: string): boolean {
  return status === '利用中' || status === '解約予定';
}

function addMonths(date: Date, months: number): Date {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

function getTimelineWindowStart(windowKey: TimelineWindowKey, today: Date): Date | null {
  const base = startOfDay(today);

  switch (windowKey) {
    case '3m':
      return addMonths(base, -3);
    case '6m':
      return addMonths(base, -6);
    case '12m':
      return addMonths(base, -12);
    case 'all':
    default:
      return null;
  }
}

function isEntryVisibleInTimeline(entry: LineHistoryEntry, windowKey: TimelineWindowKey, viewMode: TimelineViewMode, today: Date): boolean {
  if (viewMode === 'active' && !isCurrentHistoryStatus(entry.status)) {
    return false;
  }

  const entryStart = parseDate(entry.contractStartDate);
  const entryEnd = parseDate(entry.contractEndDate || today.toISOString().slice(0, 10));

  if (!entryStart || !entryEnd) {
    return viewMode === 'all';
  }

  const windowStart = getTimelineWindowStart(windowKey, today);
  const windowEnd = startOfDay(today);

  if (!windowStart) {
    return true;
  }

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

  if (!entryStart || !entryEnd) {
    return { left: '0%', width: '100%' };
  }

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
    case '3m':
      return '直近3か月';
    case '6m':
      return '直近6か月';
    case '12m':
      return '直近12か月';
    case 'all':
    default:
      return '全期間';
  }
}

function isNotificationTarget(diff: number, window: NotificationReminderWindow): boolean {
  switch (window) {
    case 'overdue':
      return diff < 0;
    case 'today':
      return diff <= 0;
    case 'within-3-days':
      return diff <= 3;
    case 'within-7-days':
      return diff <= 7;
    default:
      return false;
  }
}

function getNotificationReasonLabel(diff: number, window: NotificationReminderWindow): NotificationReasonLabel | null {
  if (!isNotificationTarget(diff, window)) {
    return null;
  }

  if (diff < 0) {
    return '期限超過';
  }
  if (diff === 0) {
    return '今日期限';
  }
  if (diff <= 3) {
    return '3日以内';
  }
  return '7日以内';
}

function getNotificationReasonForDraft(
  draft: LineDraft,
  reminderWindow: NotificationReminderWindow,
  enabled: boolean,
): NotificationReasonLabel | null {
  if (!enabled) {
    return null;
  }

  const reviewDate = parseReviewDate(draft.nextReviewDate);
  if (!reviewDate) {
    return null;
  }

  return getNotificationReasonLabel(diffInDays(new Date(), reviewDate), reminderWindow);
}

function formatCreatedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function formatReviewDate(value: string): string {
  const normalized = normalizeReviewDate(value);
  if (!normalized) {
    return '未設定';
  }

  const date = new Date(`${normalized}T00:00:00`);
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function formatDate(value: string): string {
  if (!value) {
    return '未設定';
  }

  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function formatMonthlyCost(value: number | null): string {
  if (value == null) {
    return '未設定';
  }

  return `${new Intl.NumberFormat('ja-JP').format(value)}円/月`;
}

function maskPhoneNumber(phoneNumber: string): string {
  if (phoneNumber.length < 4) {
    return phoneNumber;
  }

  return `${phoneNumber.slice(0, 3)}-****-${phoneNumber.slice(-4)}`;
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

function toFormState(draft: LineDraft): FormState {
  return {
    lineName: draft.lineName,
    carrier: draft.carrier,
    lineType: draft.lineType,
    monthlyCost: draft.monthlyCost == null ? '' : String(draft.monthlyCost),
    last4: draft.last4,
    contractHolderNote: draft.contractHolderNote,
    contractStartDate: draft.contractStartDate,
    contractEndDate: draft.contractEndDate,
    contractHolder: draft.contractHolder,
    serviceUser: draft.serviceUser,
    paymentMethod: draft.paymentMethod || 'クレジットカード',
    planName: draft.planName,
    deviceName: draft.deviceName,
    status: draft.status,
    memo: draft.memo,
    nextReviewDate: draft.nextReviewDate,
  };
}

function toLineHistoryFormState(entry: LineHistoryEntry): LineHistoryFormState {
  return {
    phoneNumber: entry.phoneNumber,
    carrier: entry.carrier,
    status: entry.status,
    contractStartDate: entry.contractStartDate,
    contractEndDate: entry.contractEndDate,
    memo: entry.memo,
  };
}

function getDeadlineStatus(value: string): DeadlineStatus {
  const normalized = normalizeReviewDate(value);
  if (!normalized) {
    return { label: '期限未設定', className: 'badge', rank: 5 };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const reviewDate = new Date(`${normalized}T00:00:00`);
  const diff = Math.round((reviewDate.getTime() - today.getTime()) / 86400000);

  if (diff < 0) {
    return { label: '期限超過', className: 'badge', rank: 0 };
  }
  if (diff === 0) {
    return { label: '今日期限', className: 'badge', rank: 1 };
  }
  if (diff <= 3) {
    return { label: '3日以内', className: 'badge badge--ok', rank: 2 };
  }
  if (diff <= 7) {
    return { label: '7日以内', className: 'badge badge--ok', rank: 3 };
  }

  return { label: '期限あり', className: 'badge badge--ok', rank: 4 };
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

export function LinesPage(): JSX.Element {
  const [searchParams, setSearchParams] = useSearchParams();
  const [drafts, setDrafts] = useState<LineDraft[]>(() => lineDraftStore.load());
  const [lineHistoryEntries, setLineHistoryEntries] = useState<LineHistoryEntry[]>(() => lineHistoryStore.load());
  const [filters, setFilters] = useState<FilterState>(initialFilterState);
  const [sortKey, setSortKey] = useState<SortKey>(initialSortKey);
  const [timelineWindow, setTimelineWindow] = useState<TimelineWindowKey>('6m');
  const [timelineViewMode, setTimelineViewMode] = useState<TimelineViewMode>('all');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [expandedIds, setExpandedIds] = useState<string[]>([]);
  const [form, setForm] = useState<FormState>(initialFormState);
  const [lineHistoryForm, setLineHistoryForm] = useState<LineHistoryFormState>(initialLineHistoryFormState);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingHistoryId, setEditingHistoryId] = useState<string | null>(null);
  const [undoState, setUndoState] = useState<UndoState | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const historyImportInputRef = useRef<HTMLInputElement | null>(null);

  const notificationSettings = loadNotificationSettings();
  const notificationReasonFromQuery = getNotificationReasonLabelFromParam(searchParams.get('notificationReason'));
  const notificationTargetOnlyFromQuery = getNotificationTargetOnlyFromParam(searchParams.get('notificationTargetOnly'));
  const devPullRequestLabel = import.meta.env.DEV ? 'PR #63' : null;
  const today = new Date();

  function resetMessages(): void {
    setErrorMessage(null);
    setSuccessMessage(null);
  }

  function persist(nextDrafts: LineDraft[], options?: { previousDrafts?: LineDraft[]; undoLabel?: string }): void {
    setDrafts(nextDrafts);
    lineDraftStore.save(nextDrafts);

    if (options?.previousDrafts && options.undoLabel) {
      setUndoState({ drafts: options.previousDrafts, label: options.undoLabel });
    }
  }

  function persistLineHistory(nextEntries: LineHistoryEntry[]): void {
    setLineHistoryEntries(nextEntries);
    lineHistoryStore.save(nextEntries);
  }

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]): void {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function updateLineHistoryField<K extends keyof LineHistoryFormState>(key: K, value: LineHistoryFormState[K]): void {
    setLineHistoryForm((current) => ({ ...current, [key]: value }));
  }

  function updateFilter<K extends keyof FilterState>(key: K, value: FilterState[K]): void {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function setNotificationReasonFilter(reason: FilterState['notificationReason']): void {
    const nextReason = filters.notificationReason === reason ? 'all' : reason;

    setFilters((current) => ({
      ...current,
      notificationReason: nextReason,
    }));

    const nextParams = new URLSearchParams(searchParams);
    const nextReasonParam = getNotificationReasonParam(nextReason);

    if (nextReasonParam) {
      nextParams.set('notificationReason', nextReasonParam);
    } else {
      nextParams.delete('notificationReason');
    }

    setSearchParams(nextParams, { replace: true });
  }

  function setNotificationTargetOnlyFilter(enabled: boolean): void {
    setFilters((current) => ({
      ...current,
      notificationTargetOnly: enabled,
    }));

    const nextParams = new URLSearchParams(searchParams);

    if (enabled) {
      nextParams.set('notificationTargetOnly', 'true');
    } else {
      nextParams.delete('notificationTargetOnly');
    }

    setSearchParams(nextParams, { replace: true });
  }

  function resetForm(): void {
    setForm(initialFormState);
    setEditingId(null);
  }

  function resetLineHistoryForm(): void {
    setLineHistoryForm(initialLineHistoryFormState);
    setEditingHistoryId(null);
  }

  function handleExportLineHistory(): void {
    resetMessages();
    downloadJson('line-history-backup.json', lineHistoryStore.exportJson());
    setSuccessMessage('契約履歴の JSON をエクスポートしました。');
  }

  async function handleImportLineHistory(event: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    resetMessages();

    try {
      const raw = await file.text();
      const imported = lineHistoryStore.importJson(raw);
      setLineHistoryEntries(imported);
      setEditingHistoryId(null);
      setSuccessMessage(`契約履歴を ${imported.length} 件読み込みました。`);
    } catch {
      setErrorMessage('契約履歴 JSON の読み込みに失敗しました。形式を確認してください。');
    } finally {
      event.target.value = '';
    }
  }

  function validateForm(): {
    lineName: string;
    carrier: string;
    lineType: LineType;
    monthlyCost: number | null;
    last4: string;
    contractHolderNote: string;
    contractStartDate: string;
    contractEndDate: string;
    contractHolder: string;
    serviceUser: string;
    paymentMethod: string;
    planName: string;
    deviceName: string;
    status: LineStatus;
    memo: string;
    nextReviewDate: string;
  } | null {
    const lineName = form.lineName.trim();
    const carrier = form.carrier.trim();
    const memo = form.memo.trim();
    const contractHolderNote = form.contractHolderNote.trim();
    const contractStartDate = form.contractStartDate;
    const contractEndDate = form.contractEndDate;
    const contractHolder = form.contractHolder.trim();
    const serviceUser = form.serviceUser.trim();
    const paymentMethod = form.paymentMethod.trim();
    const planName = form.planName.trim();
    const deviceName = form.deviceName.trim();
    const nextReviewDate = form.nextReviewDate;
    const normalizedLast4 = normalizeLast4(form.last4);

    if (!lineName || !carrier || !form.status || !form.lineType) {
      setErrorMessage('回線名、キャリア、回線種別、契約状態は必須です。');
      return null;
    }

    if (contractStartDate && !normalizeReviewDate(contractStartDate)) {
      setErrorMessage('契約開始日は YYYY-MM-DD 形式の実在日付だけ保存できます。');
      return null;
    }

    if (contractEndDate && !normalizeReviewDate(contractEndDate)) {
      setErrorMessage('契約終了日は YYYY-MM-DD 形式の実在日付だけ保存できます。');
      return null;
    }

    if (nextReviewDate && !normalizeReviewDate(nextReviewDate)) {
      setErrorMessage('次回確認日は YYYY-MM-DD 形式の実在日付だけ保存できます。');
      return null;
    }

    if (form.monthlyCost && normalizeMonthlyCost(form.monthlyCost) == null) {
      setErrorMessage('月額費用は 0 以上の整数だけ保存できます。');
      return null;
    }

    if (form.last4 && !normalizedLast4) {
      setErrorMessage('回線番号下4桁は数字4桁だけ保存できます。');
      return null;
    }

    return {
      lineName,
      carrier,
      lineType: form.lineType,
      monthlyCost: normalizeMonthlyCost(form.monthlyCost),
      last4: normalizedLast4,
      contractHolderNote,
      contractStartDate,
      contractEndDate,
      contractHolder,
      serviceUser,
      paymentMethod,
      planName,
      deviceName,
      status: form.status,
      memo,
      nextReviewDate,
    };
  }

  function handleLineHistorySubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    resetMessages();

    try {
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
          memo: lineHistoryForm.memo,
        });

        const nextEntries = lineHistoryEntries.map((entry) =>
          entry.id === editingHistoryId
            ? {
                ...updated,
                id: current.id,
                createdAt: current.createdAt,
              }
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
        memo: lineHistoryForm.memo,
      });
      persistLineHistory([nextEntry, ...lineHistoryEntries]);
      resetLineHistoryForm();
      setSuccessMessage('契約履歴を追加しました。');
    } catch {
      setErrorMessage('電話番号・キャリア・契約開始日は必須です。電話番号は 10〜11 桁で入力してください。');
    }
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

    if (editingHistoryId === entryId) {
      resetLineHistoryForm();
    }

    setSuccessMessage('契約履歴を削除しました。');
  }

  function handleUndo(): void {
    if (!undoState) {
      return;
    }

    setDrafts(undoState.drafts);
    lineDraftStore.save(undoState.drafts);
    setUndoState(null);
    setEditingId(null);
    setSelectedIds([]);
    setExpandedIds([]);
    setForm(initialFormState);
    setErrorMessage(null);
    setSuccessMessage(`直前の操作（${undoState.label}）を元に戻しました。`);
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    resetMessages();

    const validated = validateForm();
    if (!validated) {
      return;
    }

    if (editingId) {
      const nextDrafts = drafts.map((draft) => (draft.id === editingId ? updateLineDraft(draft, validated) : draft));
      persist(nextDrafts, {
        previousDrafts: drafts,
        undoLabel: '回線更新',
      });
      setSuccessMessage('回線を更新しました。');
      resetForm();
      return;
    }

    const nextDraft = createLineDraft(validated);
    const nextDrafts = [nextDraft, ...drafts];
    persist(nextDrafts, {
      previousDrafts: drafts,
      undoLabel: '回線追加',
    });
    setSuccessMessage('回線を追加しました。');
    resetForm();
  }

  function handleEdit(draft: LineDraft): void {
    resetMessages();
    setEditingId(draft.id);
    setForm(toFormState(draft));
    setExpandedIds((current) => (current.includes(draft.id) ? current : [...current, draft.id]));
  }

  function handleDelete(draftId: string): void {
    resetMessages();
    const nextDrafts = drafts.filter((draft) => draft.id !== draftId);
    persist(nextDrafts, {
      previousDrafts: drafts,
      undoLabel: '回線削除',
    });

    setSelectedIds((current) => current.filter((id) => id !== draftId));
    setExpandedIds((current) => current.filter((id) => id !== draftId));

    if (editingId === draftId) {
      resetForm();
    }

    setSuccessMessage('回線を削除しました。');
  }

  function toggleSelected(id: string): void {
    setSelectedIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  function toggleExpanded(id: string): void {
    setExpandedIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  const filteredDrafts = useMemo(() => {
    const keyword = filters.keyword.trim().toLowerCase();

    return drafts.filter((draft) => {
      const notificationReason = getNotificationReasonForDraft(
        draft,
        notificationSettings.reminderWindow,
        notificationSettings.enabled,
      );

      if (filters.contractActiveOnly && !isCurrentContract(draft.status)) {
        return false;
      }

      if (filters.notificationTargetOnly && !notificationReason) {
        return false;
      }

      if (filters.notificationReason !== 'all' && notificationReason !== filters.notificationReason) {
        return false;
      }

      if (filters.status !== 'all' && draft.status !== filters.status) {
        return false;
      }
      if (filters.lineType !== 'all' && draft.lineType !== filters.lineType) {
        return false;
      }
      if (!keyword) {
        return true;
      }

      const haystack = [
        draft.lineName,
        draft.carrier,
        draft.memo,
        draft.lineType,
        draft.last4,
        draft.contractHolderNote,
        draft.contractHolder,
        draft.serviceUser,
        draft.paymentMethod,
        draft.planName,
        draft.deviceName,
      ]
        .join(' ')
        .toLowerCase();

      return haystack.includes(keyword);
    });
  }, [drafts, filters, notificationSettings]);

  const notificationSummary = useMemo(() => {
    const summaryDrafts = drafts.filter((draft) => {
      const keyword = filters.keyword.trim().toLowerCase();

      if (filters.contractActiveOnly && !isCurrentContract(draft.status)) {
        return false;
      }
      if (filters.status !== 'all' && draft.status !== filters.status) {
        return false;
      }
      if (filters.lineType !== 'all' && draft.lineType !== filters.lineType) {
        return false;
      }
      if (!keyword) {
        return true;
      }

      const haystack = [
        draft.lineName,
        draft.carrier,
        draft.memo,
        draft.lineType,
        draft.last4,
        draft.contractHolderNote,
        draft.contractHolder,
        draft.serviceUser,
        draft.paymentMethod,
        draft.planName,
        draft.deviceName,
      ]
        .join(' ')
        .toLowerCase();

      return haystack.includes(keyword);
    });

    const counts: Record<NotificationReasonLabel, number> = {
      '期限超過': 0,
      '今日期限': 0,
      '3日以内': 0,
      '7日以内': 0,
    };

    for (const draft of summaryDrafts) {
      const reason = getNotificationReasonForDraft(
        draft,
        notificationSettings.reminderWindow,
        notificationSettings.enabled,
      );

      if (reason) {
        counts[reason] += 1;
      }
    }

    return {
      total: Object.values(counts).reduce((sum, count) => sum + count, 0),
      counts,
    };
  }, [drafts, filters.contractActiveOnly, filters.keyword, filters.lineType, filters.status, notificationSettings]);

  const visibleDrafts = useMemo(() => {
    return [...filteredDrafts].sort((a, b) => {
      switch (sortKey) {
        case 'monthlyCostHigh':
          return (b.monthlyCost ?? -1) - (a.monthlyCost ?? -1);
        case 'monthlyCostLow':
          return (a.monthlyCost ?? Number.MAX_SAFE_INTEGER) - (b.monthlyCost ?? Number.MAX_SAFE_INTEGER);
        case 'createdAtDesc':
          return b.createdAt.localeCompare(a.createdAt);
        case 'createdAtAsc':
          return a.createdAt.localeCompare(b.createdAt);
        case 'nextReviewDate': {
          const aDate = normalizeReviewDate(a.nextReviewDate);
          const bDate = normalizeReviewDate(b.nextReviewDate);
          if (!aDate && !bDate) {
            return b.createdAt.localeCompare(a.createdAt);
          }
          if (!aDate) {
            return 1;
          }
          if (!bDate) {
            return -1;
          }
          return aDate.localeCompare(bDate);
        }
      }
    });
  }, [filteredDrafts, sortKey]);

  const lineHistoryGroups = useMemo(() => buildLineHistoryGroups(lineHistoryEntries), [lineHistoryEntries]);
  const visibleLineHistoryGroups = useMemo(() => {
    return lineHistoryGroups
      .map((group) => {
        const visibleEntries = group.entries.filter((entry) =>
          isEntryVisibleInTimeline(entry, timelineWindow, timelineViewMode, today),
        );

        return {
          ...group,
          visibleEntries,
        } satisfies VisibleLineHistoryGroup;
      })
      .filter((group) => group.visibleEntries.length > 0);
  }, [lineHistoryGroups, timelineViewMode, timelineWindow, today]);
  const totalVisibleTimelineEntries = useMemo(
    () => visibleLineHistoryGroups.reduce((sum, group) => sum + group.visibleEntries.length, 0),
    [visibleLineHistoryGroups],
  );
  const visibleIds = useMemo(() => visibleDrafts.map((draft) => draft.id), [visibleDrafts]);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));
  const hasDrafts = visibleDrafts.length > 0;
  const countLabel = useMemo(() => `${visibleDrafts.length}件`, [visibleDrafts.length]);
  const submitLabel = editingId ? '更新する' : '保存する';
  const historySubmitLabel = editingHistoryId ? '履歴を更新する' : '履歴を保存する';
  const cardBadge = editingId ? '編集中' : '詳細表示';
  const historyCardBadge = editingHistoryId ? '履歴編集中' : '電話番号単位';

  function toggleSelectAllVisible(): void {
    setSelectedIds((current) => {
      if (allVisibleSelected) {
        return current.filter((id) => !visibleIds.includes(id));
      }
      return Array.from(new Set([...current, ...visibleIds]));
    });
  }

  function applyBulkStatus(nextStatus: LineStatus): void {
    resetMessages();
    if (selectedIds.length === 0) {
      setErrorMessage('一括変更する回線を選択してください。');
      return;
    }

    const nextDrafts = drafts.map((draft) =>
      selectedIds.includes(draft.id)
        ? {
            ...draft,
            status: nextStatus,
          }
        : draft,
    );

    persist(nextDrafts, {
      previousDrafts: drafts,
      undoLabel: '一括ステータス変更',
    });
    setSuccessMessage(`${selectedIds.length}件の契約状態を更新しました。`);
  }

  function handleBulkDelete(): void {
    resetMessages();
    if (selectedIds.length === 0) {
      setErrorMessage('一括削除する回線を選択してください。');
      return;
    }

    const nextDrafts = drafts.filter((draft) => !selectedIds.includes(draft.id));
    persist(nextDrafts, {
      previousDrafts: drafts,
      undoLabel: '一括削除',
    });
    setSuccessMessage(`${selectedIds.length}件の回線を削除しました。`);
    setSelectedIds([]);
    setExpandedIds([]);
  }

  useEffect(() => {
    setSelectedIds((current) => current.filter((id) => drafts.some((draft) => draft.id === id)));
    setExpandedIds((current) => current.filter((id) => drafts.some((draft) => draft.id === id)));
  }, [drafts]);

  useEffect(() => {
    setFilters((current) => {
      if (
        current.notificationReason === notificationReasonFromQuery &&
        current.notificationTargetOnly === notificationTargetOnlyFromQuery
      ) {
        return current;
      }

      return {
        ...current,
        notificationReason: notificationReasonFromQuery,
        notificationTargetOnly: notificationTargetOnlyFromQuery,
      };
    });
  }, [notificationReasonFromQuery, notificationTargetOnlyFromQuery]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      const isUndoShortcut = (event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === 'z';
      if (!isUndoShortcut || !undoState) {
        return;
      }
      if (isEditableElement(event.target)) {
        return;
      }

      event.preventDefault();
      handleUndo();
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [undoState]);

  return (
    <div className="page">
      <header className="page__header">
        <div>
          <p className="eyebrow">Lines</p>
          <h2>回線一覧</h2>
          <p className="page__lead">
            回線ドラフトの追加に加えて、検索・絞り込み・並び替え・期限表示・一括更新・一括削除・詳細表示で見たい回線を探しやすくします。保存層は薄い store に切り出し、後で差し替えやすくします。
          </p>
          {devPullRequestLabel ? <p className="notice">開発中表示: {devPullRequestLabel}</p> : null}
        </div>
      </header>

      <section className="card-grid card-grid--lines">
        <article className="card">
          <div className="card__header">
            <h3>回線フォーム</h3>
            <span className="badge">{cardBadge}</span>
          </div>

          <form className="form-grid" onSubmit={handleSubmit}>
            <label className="field">
              <span>回線名 *</span>
              <input value={form.lineName} onChange={(event) => updateField('lineName', event.target.value)} placeholder="例: 自宅用メイン回線" />
            </label>

            <label className="field">
              <span>キャリア *</span>
              <select value={form.carrier} onChange={(event) => updateField('carrier', event.target.value)}>
                {CARRIER_OPTIONS.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>回線種別 *</span>
              <select value={form.lineType} onChange={(event) => updateField('lineType', event.target.value as LineType)}>
                {LINE_TYPE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>契約開始日</span>
              <input type="date" value={form.contractStartDate} onChange={(event) => updateField('contractStartDate', event.target.value)} />
            </label>

            <label className="field">
              <span>契約終了日</span>
              <input type="date" value={form.contractEndDate} onChange={(event) => updateField('contractEndDate', event.target.value)} />
            </label>

            <label className="field">
              <span>月額費用</span>
              <input inputMode="numeric" value={form.monthlyCost} onChange={(event) => updateField('monthlyCost', event.target.value)} placeholder="例: 2980" />
            </label>

            <label className="field">
              <span>回線番号下4桁</span>
              <input inputMode="numeric" value={form.last4} onChange={(event) => updateField('last4', event.target.value)} placeholder="例: 1234" />
            </label>

            <label className="field">
              <span>契約者</span>
              <input value={form.contractHolder} onChange={(event) => updateField('contractHolder', event.target.value)} placeholder="例: 山田 太郎" />
            </label>

            <label className="field">
              <span>使用者</span>
              <input value={form.serviceUser} onChange={(event) => updateField('serviceUser', event.target.value)} placeholder="例: 本人 / 家族" />
            </label>

            <label className="field">
              <span>支払方法</span>
              <select value={form.paymentMethod} onChange={(event) => updateField('paymentMethod', event.target.value)}>
                {PAYMENT_METHOD_OPTIONS.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>プラン</span>
              <input value={form.planName} onChange={(event) => updateField('planName', event.target.value)} placeholder="例: 20GB / かけ放題付き" />
            </label>

            <label className="field">
              <span>端末</span>
              <input value={form.deviceName} onChange={(event) => updateField('deviceName', event.target.value)} placeholder="例: iPhone 15 / モバイルルーター" />
            </label>

            <label className="field">
              <span>契約名義メモ</span>
              <input value={form.contractHolderNote} onChange={(event) => updateField('contractHolderNote', event.target.value)} placeholder="例: 本人 / 家族名義 など" />
            </label>

            <label className="field">
              <span>契約状態 *</span>
              <select value={form.status} onChange={(event) => updateField('status', event.target.value as LineStatus)}>
                {LINE_STATUS_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>次回確認日</span>
              <input
                type="date"
                min="2000-01-01"
                max="9999-12-31"
                value={form.nextReviewDate}
                onChange={(event) => updateField('nextReviewDate', event.target.value)}
              />
            </label>

            <label className="field field--full">
              <span>メモ</span>
              <textarea value={form.memo} onChange={(event) => updateField('memo', event.target.value)} rows={4} placeholder="特典期限や確認メモなど" />
            </label>

            {errorMessage ? <p className="notice notice--warn">{errorMessage}</p> : null}
            {successMessage ? <p className="notice">{successMessage}</p> : null}

            <div className="button-row field--full">
              <button type="submit" className="button button--primary">
                {submitLabel}
              </button>
              <button type="button" className="button" onClick={resetForm}>
                入力をリセット
              </button>
              <button type="button" className="button" onClick={handleUndo} disabled={!undoState}>
                操作を戻す
              </button>
            </div>
          </form>
        </article>

        <article className="card">
          <div className="card__header">
            <h3>検索と絞り込み</h3>
            <span className="badge">{countLabel}</span>
          </div>

          <div className="form-grid">
            <label className="field field--full">
              <span>キーワード</span>
              <input value={filters.keyword} onChange={(event) => updateFilter('keyword', event.target.value)} placeholder="回線名 / キャリア / 契約者 / 使用者 / プラン / 端末 / メモ" />
            </label>

            <label className="field">
              <span>契約状態</span>
              <select value={filters.status} onChange={(event) => updateFilter('status', event.target.value as FilterState['status'])}>
                <option value="all">すべて</option>
                {LINE_STATUS_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>回線種別</span>
              <select value={filters.lineType} onChange={(event) => updateFilter('lineType', event.target.value as FilterState['lineType'])}>
                <option value="all">すべて</option>
                {LINE_TYPE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>並び順</span>
              <select value={sortKey} onChange={(event) => setSortKey(event.target.value as SortKey)}>
                <option value="nextReviewDate">次回確認日が近い順</option>
                <option value="monthlyCostHigh">月額費用が高い順</option>
                <option value="monthlyCostLow">月額費用が低い順</option>
                <option value="createdAtDesc">作成日時が新しい順</option>
                <option value="createdAtAsc">作成日時が古い順</option>
              </select>
            </label>

            <label className="field checkbox-row">
              <input
                type="checkbox"
                checked={filters.notificationTargetOnly}
                onChange={(event) => setNotificationTargetOnlyFilter(event.target.checked)}
              />
              <span>通知対象のみ</span>
            </label>

            <label className="field checkbox-row">
              <input
                type="checkbox"
                checked={filters.contractActiveOnly}
                onChange={(event) => updateFilter('contractActiveOnly', event.target.checked)}
              />
              <span>契約中のみ</span>
            </label>
          </div>

          <div className="detail-panel">
            <div className="card__header">
              <h3>通知対象サマリー</h3>
              <span className="badge">{notificationSummary.total}件</span>
            </div>
            <p className="muted">現在の検索・契約状態・回線種別条件に対して、通知対象を理由別にすばやく絞り込めます。</p>
            <div className="button-row">
              <button
                type="button"
                className={filters.notificationReason === 'all' ? 'button button--primary' : 'button'}
                onClick={() => setNotificationReasonFilter('all')}
              >
                通知対象合計 {notificationSummary.total}件
              </button>
              {(['期限超過', '今日期限', '3日以内', '7日以内'] as const).map((reason) => (
                <button
                  key={reason}
                  type="button"
                  className={filters.notificationReason === reason ? 'button button--primary' : 'button'}
                  onClick={() => setNotificationReasonFilter(reason)}
                >
                  {reason} {notificationSummary.counts[reason]}件
                </button>
              ))}
            </div>
            {filters.notificationReason !== 'all' ? (
              <p className="notice">通知理由: {filters.notificationReason} で絞り込み中です。</p>
            ) : null}
          </div>

          <div className="button-row">
            <button type="button" className="button" onClick={toggleSelectAllVisible} disabled={!hasDrafts}>
              {allVisibleSelected ? '表示中の選択を解除' : '表示中をすべて選択'}
            </button>
            <button type="button" className="button" onClick={() => applyBulkStatus('利用中')}>
              選択中を利用中へ
            </button>
            <button type="button" className="button" onClick={() => applyBulkStatus('解約予定')}>
              選択中を解約予定へ
            </button>
            <button type="button" className="button button--danger" onClick={handleBulkDelete}>
              選択中を削除
            </button>
          </div>
        </article>
      </section>

      <section className="card-grid card-grid--single">
        <article className="card">
          <div className="card__header">
            <h3>保存済み回線</h3>
            <span className="badge">{countLabel}</span>
          </div>

          {!hasDrafts ? (
            <p className="muted">保存済み回線はまだありません。上のフォームから追加するとここに表示されます。</p>
          ) : (
            <ul className="list list--drafts">
              {visibleDrafts.map((draft) => {
                const deadlineStatus = getDeadlineStatus(draft.nextReviewDate);
                const notificationReason = getNotificationReasonForDraft(
                  draft,
                  notificationSettings.reminderWindow,
                  notificationSettings.enabled,
                );
                const isSelected = selectedIds.includes(draft.id);
                const isExpanded = expandedIds.includes(draft.id);
                const elapsedDays = calculateElapsedDays(draft.contractStartDate);

                return (
                  <li key={draft.id} className={isSelected ? 'list__item--selected' : ''}>
                    <div className="list__row">
                      <label className="checkbox-row">
                        <input type="checkbox" checked={isSelected} onChange={() => toggleSelected(draft.id)} />
                        <strong>{draft.lineName}</strong>
                      </label>
                      <span className={draft.status === '利用中' ? 'badge badge--ok' : 'badge'}>{draft.status}</span>
                    </div>
                    <div className="list__summary-grid">
                      <span>{draft.carrier}</span>
                      <span>回線種別: {draft.lineType}</span>
                      <span>月額費用: {formatMonthlyCost(draft.monthlyCost)}</span>
                      <span>次回確認日: {formatReviewDate(draft.nextReviewDate)}</span>
                      <span>契約者: {draft.contractHolder || '未設定'}</span>
                      <span>使用者: {draft.serviceUser || '未設定'}</span>
                      <span>プラン: {draft.planName || '未設定'}</span>
                      <span>端末: {draft.deviceName || '未設定'}</span>
                    </div>
                    <div className="badge-row">
                      <span className={deadlineStatus.className}>{deadlineStatus.label}</span>
                      {notificationReason ? <span className="badge badge--ok">通知理由: {notificationReason}</span> : null}
                      {draft.last4 ? <span className="badge">下4桁: {draft.last4}</span> : null}
                      {elapsedDays != null ? <span className="badge">契約経過: {elapsedDays}日</span> : null}
                      {draft.contractEndDate ? <span className="badge">契約終了: {formatDate(draft.contractEndDate)}</span> : null}
                    </div>
                    <div className="button-row button-row--tight">
                      <button type="button" className="button" onClick={() => toggleExpanded(draft.id)}>
                        {isExpanded ? '詳細を閉じる' : '詳細を開く'}
                      </button>
                      <button type="button" className="button" onClick={() => handleEdit(draft)}>
                        編集する
                      </button>
                      <button type="button" className="button button--danger" onClick={() => handleDelete(draft.id)}>
                        削除する
                      </button>
                    </div>
                    {isExpanded ? (
                      <div className="detail-panel">
                        <div className="definition-list">
                          <div>
                            <dt>回線番号下4桁</dt>
                            <dd>{draft.last4 || '未設定'}</dd>
                          </div>
                          <div>
                            <dt>契約名義メモ</dt>
                            <dd>{draft.contractHolderNote || '未設定'}</dd>
                          </div>
                          <div>
                            <dt>契約開始日</dt>
                            <dd>{formatDate(draft.contractStartDate)}</dd>
                          </div>
                          <div>
                            <dt>契約終了日</dt>
                            <dd>{formatDate(draft.contractEndDate)}</dd>
                          </div>
                          <div>
                            <dt>契約経過日数</dt>
                            <dd>{elapsedDays == null ? '未設定' : `${elapsedDays}日`}</dd>
                          </div>
                          <div>
                            <dt>契約者</dt>
                            <dd>{draft.contractHolder || '未設定'}</dd>
                          </div>
                          <div>
                            <dt>使用者</dt>
                            <dd>{draft.serviceUser || '未設定'}</dd>
                          </div>
                          <div>
                            <dt>支払方法</dt>
                            <dd>{draft.paymentMethod || '未設定'}</dd>
                          </div>
                          <div>
                            <dt>プラン</dt>
                            <dd>{draft.planName || '未設定'}</dd>
                          </div>
                          <div>
                            <dt>端末</dt>
                            <dd>{draft.deviceName || '未設定'}</dd>
                          </div>
                          <div>
                            <dt>通知理由</dt>
                            <dd>{notificationReason || '対象外'}</dd>
                          </div>
                          <div>
                            <dt>メモ</dt>
                            <dd>{draft.memo || '未設定'}</dd>
                          </div>
                          <div>
                            <dt>保存日時</dt>
                            <dd>{formatCreatedAt(draft.createdAt)}</dd>
                          </div>
                          <div>
                            <dt>期限ステータス</dt>
                            <dd>{deadlineStatus.label}</dd>
                          </div>
                          <div>
                            <dt>契約状態</dt>
                            <dd>{draft.status}</dd>
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </article>
      </section>

      <section className="card-grid card-grid--single">
        <article className="card">
          <div className="card__header">
            <h3>契約履歴の登録</h3>
            <span className="badge">{historyCardBadge}</span>
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
            <label className="field field--full">
              <span>メモ</span>
              <textarea value={lineHistoryForm.memo} onChange={(event) => updateLineHistoryField('memo', event.target.value)} rows={3} placeholder="例: au から LINEMO へ MNP など" />
            </label>
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
          {visibleLineHistoryGroups.length === 0 ? (
            <p className="muted">現在の表示条件に一致する履歴はありません。期間または表示対象を切り替えて確認してください。</p>
          ) : (
            <div className="stack">
              {visibleLineHistoryGroups.map((group) => (
                <div key={group.phoneNumber} className="detail-panel">
                  <div className="card__header">
                    <h3>{group.maskedPhoneNumber}</h3>
                    <span className="badge">表示 {group.visibleEntries.length}件 / 全 {group.entries.length}件</span>
                  </div>
                  <p className="muted">履歴全体: {formatDate(group.earliestDate)} 〜 {formatDate(group.latestDate)}</p>
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
                          {previousEntry ? <p className="muted">直前の移動: {previousEntry.carrier} → {entry.carrier}</p> : null}
                          {entry.memo ? <p className="muted">{entry.memo}</p> : null}
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
