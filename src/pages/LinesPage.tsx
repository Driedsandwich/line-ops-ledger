import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  createLineDraft,
  DEFAULT_LINE_TYPE,
  lineDraftStore,
  LINE_STATUS_OPTIONS,
  LINE_TYPE_OPTIONS,
  PLANNED_EXIT_TYPE_OPTIONS,
  normalizeLast4,
  normalizeMonthlyCost,
  normalizePhoneNumber,
  normalizeReviewDate,
  type PlannedExitType,
  updateLineDraft,
  type LineDraft,
  type LineStatus,
  type LineType,
} from '../lib/lineDrafts';
import {
  lineHistoryStore,
  type LineHistoryActivityLog,
  type LineHistoryEntry,
} from '../lib/lineHistory';
import {
  loadNotificationSettings,
  type NotificationReminderWindow,
} from '../lib/notificationSettings';
import {
  getAllActivityTypes,
  loadCustomActivityTypes,
} from '../lib/activityTypeSettings';
import { importBundledSampleData } from '../lib/sampleData';

type FormState = {
  lineName: string;
  carrier: string;
  lineType: LineType;
  monthlyCost: string;
  phoneNumber: string;
  last4: string;
  contractHolderNote: string;
  contractStartDate: string;
  contractEndDate: string;
  plannedExitDate: string;
  plannedExitType: PlannedExitType | '';
  plannedNextCarrier: string;
  contractHolder: string;
  serviceUser: string;
  paymentMethod: string;
  planName: string;
  deviceName: string;
  status: LineStatus;
  memo: string;
  nextReviewDate: string;
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

type SortKey = 'nextReviewDate' | 'monthlyCostHigh' | 'monthlyCostLow' | 'createdAtDesc' | 'createdAtAsc' | 'latestActivityAsc';
const SORT_KEYS: SortKey[] = ['nextReviewDate', 'monthlyCostHigh', 'monthlyCostLow', 'createdAtDesc', 'createdAtAsc', 'latestActivityAsc'];

type DeadlineStatus = {
  label: string;
  className: string;
  rank: number;
};

type NotificationReasonLabel = '期限超過' | '今日期限' | '3日以内' | '7日以内';

type NotificationReasonParam = 'overdue' | 'today' | 'within-3-days' | 'within-7-days';

const notificationReasonParamMap: Record<NotificationReasonParam, NotificationReasonLabel> = {
  overdue: '期限超過',
  today: '今日期限',
  'within-3-days': '3日以内',
  'within-7-days': '7日以内',
};

const CARRIER_OPTIONS = ['NTTドコモ', 'ahamo', 'au', 'UQ mobile', 'ソフトバンク', 'Y!mobile', 'LINEMO', '楽天モバイル', 'IIJmio', 'mineo', 'NUROモバイル', 'povo', 'irumo', 'その他'] as const;
const PAYMENT_METHOD_OPTIONS = ['クレジットカード', '口座振替', '請求書', '家族合算', 'その他'] as const;
const LINES_COMPACT_VIEW_STORAGE_KEY = 'line-ops-ledger.lines.compact-view';
const LINES_FORM_COLLAPSED_STORAGE_KEY = 'line-ops-ledger.lines.form-collapsed';
const SAFE_EXIT_DAYS = 181;

function readBooleanPreference(storageKey: string, fallback: boolean): boolean {
  if (typeof window === 'undefined') {
    return fallback;
  }

  const raw = window.localStorage.getItem(storageKey);
  if (raw == null) {
    return fallback;
  }

  return raw === 'true';
}

function writeBooleanPreference(storageKey: string, value: boolean): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(storageKey, value ? 'true' : 'false');
}

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
  phoneNumber: '',
  last4: '',
  contractHolderNote: '',
  contractStartDate: '',
  contractEndDate: '',
  plannedExitDate: '',
  plannedExitType: '',
  plannedNextCarrier: '',
  contractHolder: '',
  serviceUser: '',
  paymentMethod: 'クレジットカード',
  planName: '',
  deviceName: '',
  status: '利用中',
  memo: '',
  nextReviewDate: '',
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

function parseSortKeyParam(value: string | null): SortKey {
  if (value && (SORT_KEYS as string[]).includes(value)) {
    return value as SortKey;
  }
  return initialSortKey;
}

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

function calculateSafeExitDate(value: string): Date | null {
  const date = parseDate(value);
  if (!date) {
    return null;
  }

  const result = new Date(date);
  result.setDate(result.getDate() + SAFE_EXIT_DAYS);
  return result;
}

function formatSafeExitRecommendation(contractStartDate: string): string {
  const safeExitDate = calculateSafeExitDate(contractStartDate);
  if (!safeExitDate) {
    return '開始日未設定のため算出不可';
  }

  const remainingDays = diffInDays(new Date(), safeExitDate);
  const formattedDate = new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(safeExitDate);

  if (remainingDays > 0) {
    return `${formattedDate}（あと ${remainingDays} 日）`;
  }

  return `${formattedDate}（経過済み）`;
}

function isCurrentContract(status: LineStatus): boolean {
  return status === '利用中' || status === '解約予定';
}

function formatPlannedExitType(value: PlannedExitType | ''): string {
  return value || '未設定';
}

function formatPlannedExitSchedule(value: string): string {
  const plannedDate = parseDate(value);
  if (!plannedDate) {
    return '未設定';
  }

  const remainingDays = diffInDays(new Date(), plannedDate);
  const formattedDate = new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(plannedDate);

  if (remainingDays < 0) {
    return `${formattedDate}（予定日超過）`;
  }
  if (remainingDays === 0) {
    return `${formattedDate}（今日）`;
  }

  return `${formattedDate}（あと ${remainingDays} 日）`;
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

function getLatestActivityDate(activityLogs: LineHistoryActivityLog[]): string | null {
  const dated = activityLogs.filter((log) => log.activityDate);
  if (dated.length === 0) return null;
  return dated.reduce((latest, log) =>
    log.activityDate > latest ? log.activityDate : latest,
    dated[0].activityDate,
  );
}

function getLatestActivityDateFromHistoryEntries(entries: LineHistoryEntry[]): string | null {
  let latest: string | null = null;
  for (const entry of entries) {
    const date = getLatestActivityDate(entry.activityLogs);
    if (date != null && (latest == null || date > latest)) {
      latest = date;
    }
  }
  return latest;
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

function getPhoneLast4(phoneNumber: string): string {
  const digits = phoneNumber.replace(/\D/g, '');
  return digits.length >= 4 ? digits.slice(-4) : '';
}

function getMaskedDraftPhoneNumber(draft: LineDraft): string {
  if (draft.phoneNumber) {
    return maskPhoneNumber(draft.phoneNumber);
  }
  if (draft.last4) {
    return `***-****-${draft.last4}`;
  }
  return '未設定';
}

function findRelatedHistoryEntries(draft: LineDraft, entries: LineHistoryEntry[]): LineHistoryEntry[] {
  if (draft.phoneNumber) {
    return entries.filter((entry) => normalizePhoneNumber(entry.phoneNumber) === draft.phoneNumber);
  }

  if (!draft.last4) {
    return [];
  }

  return entries.filter((entry) => getPhoneLast4(entry.phoneNumber) === draft.last4);
}

function toFormState(draft: LineDraft): FormState {
  return {
    lineName: draft.lineName,
    carrier: draft.carrier,
    lineType: draft.lineType,
    monthlyCost: draft.monthlyCost == null ? '' : String(draft.monthlyCost),
    phoneNumber: draft.phoneNumber,
    last4: draft.last4,
    contractHolderNote: draft.contractHolderNote,
    contractStartDate: draft.contractStartDate,
    contractEndDate: draft.contractEndDate,
    plannedExitDate: draft.plannedExitDate,
    plannedExitType: draft.plannedExitType,
    plannedNextCarrier: draft.plannedNextCarrier,
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

export function LinesPage(): JSX.Element {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [drafts, setDrafts] = useState<LineDraft[]>(() => lineDraftStore.load());
  const [lineHistoryEntries, setLineHistoryEntries] = useState<LineHistoryEntry[]>(() => lineHistoryStore.load());
  const [filters, setFilters] = useState<FilterState>(initialFilterState);
  const [sortKey, setSortKey] = useState<SortKey>(() => parseSortKeyParam(new URLSearchParams(window.location.search).get('sort')));
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [expandedIds, setExpandedIds] = useState<string[]>([]);
  const [form, setForm] = useState<FormState>(initialFormState);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [undoState, setUndoState] = useState<UndoState | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isCompactView, setIsCompactView] = useState(() => readBooleanPreference(LINES_COMPACT_VIEW_STORAGE_KEY, false));
  const [isFormCollapsed, setIsFormCollapsed] = useState(() => readBooleanPreference(LINES_FORM_COLLAPSED_STORAGE_KEY, false));
  const isFirstRun = drafts.length === 0 && lineHistoryEntries.length === 0;

  const notificationSettings = loadNotificationSettings();
  const allActivityTypes = useMemo(() => getAllActivityTypes(loadCustomActivityTypes()), []);
  const notificationReasonFromQuery = getNotificationReasonLabelFromParam(searchParams.get('notificationReason'));
  const notificationTargetOnlyFromQuery = getNotificationTargetOnlyFromParam(searchParams.get('notificationTargetOnly'));
  const today = useMemo(() => new Date(), []);

  function resetMessages(): void {
    setErrorMessage(null);
    setSuccessMessage(null);
  }

  function handleImportSampleData(): void {
    try {
      const result = importBundledSampleData();
      setDrafts(result.drafts);
      setLineHistoryEntries(result.historyEntries);
      setSelectedIds([]);
      setExpandedIds([]);
      setUndoState(null);
      setErrorMessage(null);
      setSuccessMessage(`確認用サンプルデータを読み込みました（主台帳 ${result.draftCount} 件 / 履歴 ${result.historyCount} 件）。`);
    } catch {
      setSuccessMessage(null);
      setErrorMessage('確認用サンプルデータの読み込みに失敗しました。');
    }
  }

  function persist(nextDrafts: LineDraft[], options?: { previousDrafts?: LineDraft[]; undoLabel?: string }): void {
    setDrafts(nextDrafts);
    lineDraftStore.save(nextDrafts);

    if (options?.previousDrafts && options.undoLabel) {
      setUndoState({ drafts: options.previousDrafts, label: options.undoLabel });
    }
  }

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]): void {
    setForm((current) => ({ ...current, [key]: value }));
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

  function setContractActiveOnlyFilter(enabled: boolean): void {
    setFilters((current) => ({
      ...current,
      contractActiveOnly: enabled,
    }));
  }

  function resetForm(): void {
    setForm(initialFormState);
    setEditingId(null);
  }

  function validateForm(): {
    lineName: string;
    carrier: string;
    lineType: LineType;
    monthlyCost: number | null;
    phoneNumber: string;
    last4: string;
    contractHolderNote: string;
    contractStartDate: string;
    contractEndDate: string;
    plannedExitDate: string;
    plannedExitType: PlannedExitType | '';
    plannedNextCarrier: string;
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
    const phoneNumber = normalizePhoneNumber(form.phoneNumber);
    const contractHolderNote = form.contractHolderNote.trim();
    const contractStartDate = form.contractStartDate;
    const contractEndDate = form.contractEndDate;
    const plannedExitDate = form.plannedExitDate;
    const plannedExitType = form.plannedExitType;
    const plannedNextCarrier = form.plannedNextCarrier.trim();
    const contractHolder = form.contractHolder.trim();
    const serviceUser = form.serviceUser.trim();
    const paymentMethod = form.paymentMethod.trim();
    const planName = form.planName.trim();
    const deviceName = form.deviceName.trim();
    const nextReviewDate = form.nextReviewDate;
    const normalizedLast4 = phoneNumber ? normalizeLast4(phoneNumber) : normalizeLast4(form.last4);

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

    if (plannedExitDate && !normalizeReviewDate(plannedExitDate)) {
      setErrorMessage('今後のアクション予定日は YYYY-MM-DD 形式の実在日付だけ保存できます。');
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

    if (form.phoneNumber && !phoneNumber) {
      setErrorMessage('電話番号は数字10〜11桁だけ保存できます。');
      return null;
    }

    if (!phoneNumber && form.last4 && !normalizedLast4) {
      setErrorMessage('回線番号下4桁は数字4桁だけ保存できます。');
      return null;
    }

    return {
      lineName,
      carrier,
      lineType: form.lineType,
      monthlyCost: normalizeMonthlyCost(form.monthlyCost),
      phoneNumber,
      last4: normalizedLast4,
      contractHolderNote,
      contractStartDate,
      contractEndDate,
      plannedExitDate,
      plannedExitType,
      plannedNextCarrier,
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
    setIsFormCollapsed(false);
  }

  function handleQuickActivityLog(draft: LineDraft): void {
    if (!draft.phoneNumber) return;
    void navigate(`/lines/history?quickActivity=${encodeURIComponent(draft.phoneNumber)}`);
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
        draft.phoneNumber,
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
        draft.phoneNumber,
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
        case 'latestActivityAsc': {
          const aDate = getLatestActivityDateFromHistoryEntries(findRelatedHistoryEntries(a, lineHistoryEntries));
          const bDate = getLatestActivityDateFromHistoryEntries(findRelatedHistoryEntries(b, lineHistoryEntries));
          if (!aDate && !bDate) {
            return b.createdAt.localeCompare(a.createdAt);
          }
          if (!aDate) {
            return -1;
          }
          if (!bDate) {
            return 1;
          }
          return aDate.localeCompare(bDate);
        }
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
  }, [filteredDrafts, lineHistoryEntries, sortKey]);

  const visibleIds = useMemo(() => visibleDrafts.map((draft) => draft.id), [visibleDrafts]);
  const selectedVisibleCount = useMemo(() => visibleIds.filter((id) => selectedIds.includes(id)).length, [visibleIds, selectedIds]);
  const allVisibleSelected = visibleIds.length > 0 && selectedVisibleCount === visibleIds.length;
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

  function applyBulkStatus(nextStatus: Extract<LineStatus, '利用中' | '解約予定'>): void {
    if (selectedIds.length === 0) {
      setErrorMessage('一括ステータス変更する回線を選択してください。');
      return;
    }

    resetMessages();

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
    if (selectedIds.length === 0) {
      setErrorMessage('削除する回線を選択してください。');
      return;
    }

    resetMessages();

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
    lineDraftStore.ensureCurrentVersion();
  }, []);

  useEffect(() => {
    setFilters((current) => ({
      ...current,
      notificationReason: notificationReasonFromQuery,
      notificationTargetOnly: notificationTargetOnlyFromQuery,
    }));
  }, [notificationReasonFromQuery, notificationTargetOnlyFromQuery]);

  useEffect(() => {
    setSelectedIds((current) => current.filter((id) => drafts.some((draft) => draft.id === id)));
    setExpandedIds((current) => current.filter((id) => drafts.some((draft) => draft.id === id)));
  }, [drafts]);

  useEffect(() => {
    if (drafts.length > 0 && !editingId) {
      setIsFormCollapsed((current) => current || readBooleanPreference(LINES_FORM_COLLAPSED_STORAGE_KEY, true));
    }
  }, [drafts.length, editingId]);

  useEffect(() => {
    writeBooleanPreference(LINES_COMPACT_VIEW_STORAGE_KEY, isCompactView);
  }, [isCompactView]);

  useEffect(() => {
    writeBooleanPreference(LINES_FORM_COLLAPSED_STORAGE_KEY, isFormCollapsed);
  }, [isFormCollapsed]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      const isUndoShortcut = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && !event.shiftKey && !event.altKey;
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
          <p className="page__lead">回線ドラフトの追加・編集・一覧管理を行います。活動記録や履歴確認は<Link to="/lines/history">履歴・タイムライン</Link>ページで行えます。</p>
        </div>
        <div className="button-row button-row--tight" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className={`button ${isCompactView ? 'button--primary' : ''}`} onClick={() => setIsCompactView((current) => !current)}>
            {isCompactView ? '通常表示に戻す' : 'コンパクト表示'}
          </button>
        </div>
      </header>

      <section className="card-grid card-grid--lines">
        <article className="card" id="line-form">
          <div className="card__header">
            <h3>回線フォーム</h3>
            <div className="button-row button-row--tight">
              <span className="badge">{cardBadge}</span>
              <button type="button" className="button" onClick={() => setIsFormCollapsed((current) => !current)}>
                {isFormCollapsed ? 'フォームを開く' : 'フォームをたたむ'}
              </button>
            </div>
          </div>

          {isFormCollapsed ? (
            <p className="muted">登録済み回線があるためフォームを折りたたんでいます。追加や編集時に開いてください。</p>
          ) : (
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
                    <option key={option} value={option}>{option}</option>
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

              {isCurrentContract(form.status) || form.plannedExitDate || form.plannedExitType || form.plannedNextCarrier ? (
                <>
                  <label className="field">
                    <span>今後のアクション予定日</span>
                    <input type="date" value={form.plannedExitDate} onChange={(event) => updateField('plannedExitDate', event.target.value)} />
                  </label>

                  <label className="field">
                    <span>今後のアクション種別</span>
                    <select value={form.plannedExitType} onChange={(event) => updateField('plannedExitType', event.target.value as PlannedExitType | '')}>
                      <option value="">未設定</option>
                      {PLANNED_EXIT_TYPE_OPTIONS.map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                  </label>

                  <label className="field">
                    <span>次に移るキャリア</span>
                    <input value={form.plannedNextCarrier} onChange={(event) => updateField('plannedNextCarrier', event.target.value)} placeholder="例: ahamo / LINEMO" />
                  </label>
                </>
              ) : null}

              <label className="field">
                <span>月額費用</span>
                <input inputMode="numeric" value={form.monthlyCost} onChange={(event) => updateField('monthlyCost', event.target.value)} placeholder="例: 2980" />
              </label>

              <label className="field">
                <span>電話番号</span>
                <input inputMode="numeric" value={form.phoneNumber} onChange={(event) => updateField('phoneNumber', event.target.value)} placeholder="例: 09012345678" />
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
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span>次回確認日</span>
                <input type="date" value={form.nextReviewDate} onChange={(event) => updateField('nextReviewDate', event.target.value)} />
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
          )}
        </article>

        <article className="card">
          <div className="card__header">
            <h3>検索と絞り込み</h3>
            <span className="badge">{countLabel}</span>
          </div>

          <div className="form-grid">
            <label className="field field--full">
              <span>キーワード</span>
              <input value={filters.keyword} onChange={(event) => updateFilter('keyword', event.target.value)} placeholder="回線名 / キャリア / 電話番号 / 契約者 / 使用者 / プラン / 端末 / メモ" />
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
                <option value="latestActivityAsc">最終活動日が古い順（要確認優先）</option>
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
                onChange={(event) => setContractActiveOnlyFilter(event.target.checked)}
              />
              <span>契約中のみ</span>
            </label>
          </div>

          <div className="detail-panel">
            <div className="card__header">
              <h3>クイック巡回</h3>
              <span className="badge">1タップ切替</span>
            </div>
            <div className="badge-row">
              <button type="button" className={`button ${filters.contractActiveOnly ? 'button--primary' : ''}`} onClick={() => setContractActiveOnlyFilter(!filters.contractActiveOnly)}>
                {filters.contractActiveOnly ? '契約中のみ: ON' : '契約中のみ'}
              </button>
              <button type="button" className={`button ${filters.notificationTargetOnly ? 'button--primary' : ''}`} onClick={() => setNotificationTargetOnlyFilter(!filters.notificationTargetOnly)}>
                {filters.notificationTargetOnly ? '通知対象のみ: ON' : '通知対象のみ'}
              </button>
              <button type="button" className="button" onClick={() => {
                setFilters(initialFilterState);
                setSearchParams(new URLSearchParams(), { replace: true });
              }}>
                絞り込みをリセット
              </button>
            </div>
          </div>

          <div className="detail-panel">
            <div className="card__header">
              <h3>通知対象サマリー</h3>
              <span className="badge">対象 {notificationSummary.total}件</span>
            </div>
            <div className="badge-row">
              <button type="button" className={`button ${filters.notificationReason === 'all' ? 'button--primary' : ''}`} onClick={() => setNotificationReasonFilter('all')}>
                通知対象合計 {notificationSummary.total}
              </button>
              {(['期限超過', '今日期限', '3日以内', '7日以内'] as NotificationReasonLabel[]).map((reason) => (
                <button
                  key={reason}
                  type="button"
                  className={`button ${filters.notificationReason === reason ? 'button--primary' : ''}`}
                  onClick={() => setNotificationReasonFilter(reason)}
                >
                  {reason} {notificationSummary.counts[reason]}
                </button>
              ))}
            </div>
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
            <div className="button-row button-row--tight">
              <span className="badge">{countLabel}</span>
              {isCompactView ? <span className="badge badge--ok">コンパクト表示中</span> : null}
            </div>
          </div>

          {!hasDrafts ? (
            <>
              <p className="muted">保存済み回線はまだありません。最初は回線名・キャリア・電話番号だけでも登録できます。</p>
              <div className="detail-panel">
                <p className="muted" style={{ marginTop: 0 }}>
                  既存データがある場合は、`/settings/backup` から統合バックアップを復元すると主台帳と履歴をまとめて戻せます。
                </p>
                <div className="button-row button-row--tight">
                  <a className="button button--primary" href="#line-form">回線フォームに戻る</a>
                  {isFirstRun ? (
                    <button type="button" className="button" onClick={handleImportSampleData}>確認用サンプルデータを読み込む</button>
                  ) : null}
                  <Link className="button" to="/settings/backup">バックアップを復元する</Link>
                  <Link className="button" to="/lines/history">履歴ページを見る</Link>
                </div>
              </div>
            </>
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
                const safeExitRecommendation = isCurrentContract(draft.status)
                  ? formatSafeExitRecommendation(draft.contractStartDate)
                  : null;
                const relatedHistoryEntries = findRelatedHistoryEntries(draft, lineHistoryEntries);
                const latestActivityDate = getLatestActivityDateFromHistoryEntries(relatedHistoryEntries);

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
                      <span>電話番号: {getMaskedDraftPhoneNumber(draft)}</span>
                      <span>次回確認日: {formatReviewDate(draft.nextReviewDate)}</span>
                      {!isCompactView ? <span>月額費用: {formatMonthlyCost(draft.monthlyCost)}</span> : null}
                      {!isCompactView ? <span>契約者: {draft.contractHolder || '未設定'}</span> : null}
                      {!isCompactView ? <span>使用者: {draft.serviceUser || '未設定'}</span> : null}
                      {!isCompactView ? <span>プラン: {draft.planName || '未設定'}</span> : null}
                      {!isCompactView ? <span>端末: {draft.deviceName || '未設定'}</span> : null}
                    </div>
                    <div className="badge-row">
                      <span className={deadlineStatus.className}>{deadlineStatus.label}</span>
                      {notificationReason ? <span className="badge badge--ok">通知理由: {notificationReason}</span> : null}
                      {draft.phoneNumber ? <span className="badge">電話番号: {maskPhoneNumber(draft.phoneNumber)}</span> : draft.last4 ? <span className="badge">下4桁: {draft.last4}</span> : null}
                      {!isCompactView && elapsedDays != null ? <span className="badge">契約経過: {elapsedDays}日</span> : null}
                      {!isCompactView && draft.contractEndDate ? <span className="badge">契約終了: {formatDate(draft.contractEndDate)}</span> : null}
                      {!isCompactView && draft.plannedExitDate ? <span className="badge">予定: {formatPlannedExitSchedule(draft.plannedExitDate)}</span> : null}
                      {latestActivityDate != null ? <span className="badge">最終活動: {formatDate(latestActivityDate)}</span> : null}
                    </div>
                    <div className="button-row button-row--tight">
                      <button type="button" className="button" onClick={() => toggleExpanded(draft.id)}>
                        {isExpanded ? '詳細を閉じる' : '詳細を開く'}
                      </button>
                      <button type="button" className="button" onClick={() => handleEdit(draft)}>
                        編集する
                      </button>
                      <button type="button" className="button" onClick={() => handleQuickActivityLog(draft)} disabled={!draft.phoneNumber}>
                        活動を記録
                      </button>
                      <button type="button" className="button button--danger" onClick={() => handleDelete(draft.id)}>
                        削除する
                      </button>
                    </div>
                    {isExpanded ? (
                      <div className="detail-panel">
                        <div className="definition-list">
                          <div>
                            <dt>電話番号</dt>
                            <dd>{getMaskedDraftPhoneNumber(draft)}</dd>
                          </div>
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
                            <dt>今後のアクション予定日</dt>
                            <dd>{formatPlannedExitSchedule(draft.plannedExitDate)}</dd>
                          </div>
                          <div>
                            <dt>今後のアクション種別</dt>
                            <dd>{formatPlannedExitType(draft.plannedExitType)}</dd>
                          </div>
                          <div>
                            <dt>次に移るキャリア</dt>
                            <dd>{draft.plannedNextCarrier || '未設定'}</dd>
                          </div>
                          <div>
                            <dt>契約経過日数</dt>
                            <dd>{elapsedDays == null ? '未設定' : `${elapsedDays}日`}</dd>
                          </div>
                          {safeExitRecommendation ? (
                            <div>
                              <dt>解約可能推奨日</dt>
                              <dd>{safeExitRecommendation}</dd>
                            </div>
                          ) : null}
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
                          <div>
                            <dt>最終活動日</dt>
                            <dd>{latestActivityDate != null ? formatDate(latestActivityDate) : '記録なし'}</dd>
                          </div>
                        </div>
                        {relatedHistoryEntries.length > 0 ? (
                          <div className="badge-row" style={{ marginTop: '0.75rem' }}>
                            <span className="badge badge--ok">関連履歴: {relatedHistoryEntries.length}件</span>
                            {relatedHistoryEntries.map((entry) => (
                              <span key={entry.id} className="badge">{entry.carrier} / {maskPhoneNumber(entry.phoneNumber)}</span>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </article>
      </section>
    </div>
  );
}

