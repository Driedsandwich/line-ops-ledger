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

type LineHistoryGroup = {
  phoneNumber: string;
  maskedPhoneNumber: string;
  entries: LineHistoryEntry[];
  earliestDate: string;
  latestDate: string;
};

const notificationReasonParamMap: Record<NotificationReasonParam, NotificationReasonLabel> = {
  overdue: '期限超過',
  today: '今日期限',
  'within-3-days': '3日以内',
  'within-7-days': '7日以内',
};

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
  carrier: '',
  lineType: DEFAULT_LINE_TYPE,
  monthlyCost: '',
  last4: '',
  contractHolderNote: '',
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
    status: draft.status,
    memo: draft.memo,
    nextReviewDate: draft.nextReviewDate,
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

function calculateTimelineStyle(group: LineHistoryGroup, entry: LineHistoryEntry): { left: string; width: string } {
  const groupStart = parseDate(group.earliestDate);
  const groupEnd = parseDate(group.latestDate || group.earliestDate);
  const entryStart = parseDate(entry.contractStartDate);
  const entryEnd = parseDate(entry.contractEndDate || group.latestDate || entry.contractStartDate);

  if (!groupStart || !groupEnd || !entryStart || !entryEnd) {
    return { left: '0%', width: '100%' };
  }

  const totalDays = Math.max(diffInDays(groupStart, groupEnd) + 1, 1);
  const offsetDays = Math.max(diffInDays(groupStart, entryStart), 0);
  const durationDays = Math.max(diffInDays(entryStart, entryEnd) + 1, 1);

  return {
    left: `${(offsetDays / totalDays) * 100}%`,
    width: `${Math.max((durationDays / totalDays) * 100, 8)}%`,
  };
}

export function LinesPage(): JSX.Element {
  const [searchParams, setSearchParams] = useSearchParams();
  const [drafts, setDrafts] = useState<LineDraft[]>(() => lineDraftStore.load());
  const [lineHistoryEntries, setLineHistoryEntries] = useState<LineHistoryEntry[]>(() => lineHistoryStore.load());
  const [filters, setFilters] = useState<FilterState>(initialFilterState);
  const [sortKey, setSortKey] = useState<SortKey>(initialSortKey);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [expandedIds, setExpandedIds] = useState<string[]>([]);
  const [form, setForm] = useState<FormState>(initialFormState);
  const [lineHistoryForm, setLineHistoryForm] = useState<LineHistoryFormState>(initialLineHistoryFormState);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [undoState, setUndoState] = useState<UndoState | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const historyImportInputRef = useRef<HTMLInputElement | null>(null);

  const notificationSettings = loadNotificationSettings();
  const notificationReasonFromQuery = getNotificationReasonLabelFromParam(searchParams.get('notificationReason'));
  const notificationTargetOnlyFromQuery = getNotificationTargetOnlyFromParam(searchParams.get('notificationTargetOnly'));
  const devPullRequestLabel = import.meta.env.DEV ? 'PR #53' : null;

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
    status: LineStatus;
    memo: string;
    nextReviewDate: string;
  } | null {
    const lineName = form.lineName.trim();
    const carrier = form.carrier.trim();
    const memo = form.memo.trim();
    const contractHolderNote = form.contractHolderNote.trim();
    const nextReviewDate = form.nextReviewDate;
    const normalizedLast4 = normalizeLast4(form.last4);

    if (!lineName || !carrier || !form.status || !form.lineType) {
      setErrorMessage('回線名、キャリア、回線種別、契約状態は必須です。');
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
      status: form.status,
      memo,
      nextReviewDate,
    };
  }

  function handleLineHistorySubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    resetMessages();

    try {
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
      ]
        .join(' ')
        .toLowerCase();

      return haystack.includes(keyword);
    });
  }, [drafts, filters, notificationSettings]);

  const notificationSummary = useMemo(() => {
    const summaryDrafts = drafts.filter((draft) => {
      const keyword = filters.keyword.trim().toLowerCase();

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
  }, [drafts, filters.keyword, filters.lineType, filters.status, notificationSettings]);

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
  const visibleIds = useMemo(() => visibleDrafts.map((draft) => draft.id), [visibleDrafts]);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));
  const hasDrafts = visibleDrafts.length > 0;
  const countLabel = useMemo(() => `${visibleDrafts.length}件`, [visibleDrafts.length]);
  const submitLabel = editingId ? '更新する' : '保存する';
  const cardBadge = editingId ? '編集中' : '詳細表示';

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
              <input value={form.carrier} onChange={(event) => updateField('carrier', event.target.value)} placeholder="例: NTTドコモ" />
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
              <span>月額費用</span>
              <input inputMode="numeric" value={form.monthlyCost} onChange={(event) => updateField('monthlyCost', event.target.value)} placeholder="例: 2980" />
            </label>

            <label className="field">
              <span>回線番号下4桁</span>
              <input inputMode="numeric" value={form.last4} onChange={(event) => updateField('last4', event.target.value)} placeholder="例: 1234" />
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
              <input value={filters.keyword} onChange={(event) => updateFilter('keyword', event.target.value)} placeholder="回線名 / キャリア / メモ / 下4桁 / 契約名義メモ" />
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
                    </div>
                    <div className="badge-row">
                      <span className={deadlineStatus.className}>{deadlineStatus.label}</span>
                      {notificationReason ? <span className="badge badge--ok">通知理由: {notificationReason}</span> : null}
                      {draft.last4 ? <span className="badge">下4桁: {draft.last4}</span> : null}
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
            <span className="badge">電話番号単位</span>
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
              <button type="submit" className="button button--primary">履歴を保存する</button>
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
            <span className="badge">{lineHistoryGroups.length}番号</span>
          </div>
          {lineHistoryGroups.length === 0 ? (
            <p className="muted">契約履歴はまだありません。上のフォームから過去契約や MNP 転出済みの履歴を追加すると、ここに電話番号単位の履歴が表示されます。</p>
          ) : (
            <div className="stack">
              {lineHistoryGroups.map((group) => (
                <div key={group.phoneNumber} className="detail-panel">
                  <div className="card__header">
                    <h3>{group.maskedPhoneNumber}</h3>
                    <span className="badge">{group.entries.length}件</span>
                  </div>
                  <p className="muted">{formatDate(group.earliestDate)} 〜 {formatDate(group.latestDate)}</p>
                  <div className="definition-list">
                    {group.entries.map((entry, index) => {
                      const timelineStyle = calculateTimelineStyle(group, entry);
                      const previousEntry = index > 0 ? group.entries[index - 1] : null;
                      return (
                        <div key={entry.id}>
                          <dt>{entry.carrier} / {entry.status}</dt>
                          <dd>
                            <div>{formatDate(entry.contractStartDate)} 〜 {entry.contractEndDate ? formatDate(entry.contractEndDate) : '継続中'}</div>
                            {previousEntry ? <div>MNP / 契約移行: {previousEntry.carrier} → {entry.carrier}</div> : null}
                            {entry.memo ? <div>{entry.memo}</div> : null}
                            <div style={{ position: 'relative', marginTop: '0.5rem', height: '1.5rem', background: 'rgba(148, 163, 184, 0.2)', borderRadius: '999px' }}>
                              <div style={{ position: 'absolute', top: 0, bottom: 0, left: timelineStyle.left, width: timelineStyle.width, borderRadius: '999px', background: 'rgba(59, 130, 246, 0.8)' }} />
                            </div>
                          </dd>
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
