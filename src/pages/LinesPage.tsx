import { useEffect, useMemo, useState } from 'react';
import {
  createLineDraft,
  DEFAULT_LINE_TYPE,
  lineDraftStore,
  LINE_STATUS_OPTIONS,
  LINE_TYPE_OPTIONS,
  normalizeMonthlyCost,
  normalizeReviewDate,
  updateLineDraft,
  type LineDraft,
  type LineStatus,
  type LineType,
} from '../lib/lineDrafts';

type FormState = {
  lineName: string;
  carrier: string;
  lineType: LineType;
  monthlyCost: string;
  status: LineStatus;
  memo: string;
  nextReviewDate: string;
};

type FilterState = {
  keyword: string;
  status: 'all' | LineStatus;
  lineType: 'all' | LineType;
};

type SortKey = 'review-date-asc' | 'monthly-cost-desc' | 'monthly-cost-asc' | 'created-at-desc' | 'created-at-asc';

type UndoState = {
  drafts: LineDraft[];
  label: string;
};

type DeadlineStatus = {
  label: string;
  className: string;
};

const initialFormState: FormState = {
  lineName: '',
  carrier: '',
  lineType: DEFAULT_LINE_TYPE,
  monthlyCost: '',
  status: '利用中',
  memo: '',
  nextReviewDate: '',
};

const initialFilterState: FilterState = {
  keyword: '',
  status: 'all',
  lineType: 'all',
};

const initialSortKey: SortKey = 'review-date-asc';

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

function formatMonthlyCost(value: number | null): string {
  if (value == null) {
    return '未設定';
  }

  return `${new Intl.NumberFormat('ja-JP').format(value)}円/月`;
}

function toFormState(draft: LineDraft): FormState {
  return {
    lineName: draft.lineName,
    carrier: draft.carrier,
    lineType: draft.lineType,
    monthlyCost: draft.monthlyCost == null ? '' : String(draft.monthlyCost),
    status: draft.status,
    memo: draft.memo,
    nextReviewDate: draft.nextReviewDate,
  };
}

function isEditableElement(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName;
  return tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT' || target.isContentEditable;
}

function matchesKeyword(draft: LineDraft, keyword: string): boolean {
  if (!keyword) {
    return true;
  }

  const normalized = keyword.trim().toLowerCase();
  if (!normalized) {
    return true;
  }

  return [draft.lineName, draft.carrier, draft.memo].some((value) => value.toLowerCase().includes(normalized));
}

function reviewDateTimestamp(value: string): number {
  const normalized = normalizeReviewDate(value);
  if (!normalized) {
    return Number.MAX_SAFE_INTEGER;
  }

  const date = new Date(`${normalized}T00:00:00`);
  return Number.isNaN(date.getTime()) ? Number.MAX_SAFE_INTEGER : date.getTime();
}

function compareBySortKey(a: LineDraft, b: LineDraft, sortKey: SortKey): number {
  switch (sortKey) {
    case 'review-date-asc':
      return reviewDateTimestamp(a.nextReviewDate) - reviewDateTimestamp(b.nextReviewDate) || b.createdAt.localeCompare(a.createdAt);
    case 'monthly-cost-desc': {
      const left = a.monthlyCost ?? -1;
      const right = b.monthlyCost ?? -1;
      return right - left || b.createdAt.localeCompare(a.createdAt);
    }
    case 'monthly-cost-asc': {
      const left = a.monthlyCost ?? Number.MAX_SAFE_INTEGER;
      const right = b.monthlyCost ?? Number.MAX_SAFE_INTEGER;
      return left - right || b.createdAt.localeCompare(a.createdAt);
    }
    case 'created-at-asc':
      return a.createdAt.localeCompare(b.createdAt);
    case 'created-at-desc':
    default:
      return b.createdAt.localeCompare(a.createdAt);
  }
}

function toStartOfDay(date: Date): Date {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function getDeadlineStatus(nextReviewDate: string): DeadlineStatus {
  const normalized = normalizeReviewDate(nextReviewDate);
  if (!normalized) {
    return { label: '期限未設定', className: 'badge' };
  }

  const today = toStartOfDay(new Date()).getTime();
  const due = new Date(`${normalized}T00:00:00`).getTime();
  const diffDays = Math.round((due - today) / 86400000);

  if (diffDays < 0) {
    return { label: '期限超過', className: 'badge badge--danger' };
  }
  if (diffDays === 0) {
    return { label: '今日期限', className: 'badge badge--warn' };
  }
  if (diffDays <= 3) {
    return { label: '3日以内', className: 'badge badge--warn' };
  }
  if (diffDays <= 7) {
    return { label: '7日以内', className: 'badge badge--info' };
  }

  return { label: '期限あり', className: 'badge badge--ok' };
}

export function LinesPage(): JSX.Element {
  const [drafts, setDrafts] = useState<LineDraft[]>(() => lineDraftStore.load());
  const [filters, setFilters] = useState<FilterState>(initialFilterState);
  const [sortKey, setSortKey] = useState<SortKey>(initialSortKey);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [form, setForm] = useState<FormState>(initialFormState);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [undoState, setUndoState] = useState<UndoState | null>(null);

  const filteredDrafts = useMemo(() => {
    return drafts.filter((draft) => {
      if (!matchesKeyword(draft, filters.keyword)) {
        return false;
      }
      if (filters.status !== 'all' && draft.status !== filters.status) {
        return false;
      }
      if (filters.lineType !== 'all' && draft.lineType !== filters.lineType) {
        return false;
      }
      return true;
    });
  }, [drafts, filters]);

  const visibleDrafts = useMemo(() => {
    return [...filteredDrafts].sort((a, b) => compareBySortKey(a, b, sortKey));
  }, [filteredDrafts, sortKey]);

  const visibleIds = useMemo(() => visibleDrafts.map((draft) => draft.id), [visibleDrafts]);
  const selectedVisibleCount = useMemo(() => visibleIds.filter((id) => selectedIds.includes(id)).length, [visibleIds, selectedIds]);
  const allVisibleSelected = visibleIds.length > 0 && selectedVisibleCount === visibleIds.length;

  const hasDrafts = visibleDrafts.length > 0;
  const countLabel = useMemo(() => `${visibleDrafts.length}件`, [visibleDrafts.length]);
  const submitLabel = editingId ? '更新する' : '保存する';
  const cardBadge = editingId ? '編集中' : '一括削除';

  function persist(nextDrafts: LineDraft[], options?: { previousDrafts?: LineDraft[]; undoLabel?: string }): void {
    setDrafts(nextDrafts);
    lineDraftStore.save(nextDrafts);

    if (options?.previousDrafts && options.undoLabel) {
      setUndoState({
        drafts: options.previousDrafts,
        label: options.undoLabel,
      });
    }
  }

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]): void {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function updateFilter<K extends keyof FilterState>(key: K, value: FilterState[K]): void {
    setFilters((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function resetMessages(): void {
    setErrorMessage(null);
    setSuccessMessage(null);
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
    status: LineStatus;
    memo: string;
    nextReviewDate: string;
  } | null {
    const lineName = form.lineName.trim();
    const carrier = form.carrier.trim();
    const memo = form.memo.trim();
    const nextReviewDate = form.nextReviewDate;

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

    return {
      lineName,
      carrier,
      lineType: form.lineType,
      monthlyCost: normalizeMonthlyCost(form.monthlyCost),
      status: form.status,
      memo,
      nextReviewDate,
    };
  }

  function handleUndo(): void {
    if (!undoState) {
      return;
    }

    lineDraftStore.save(undoState.drafts);
    setDrafts(undoState.drafts);
    setUndoState(null);
    setEditingId(null);
    setSelectedIds([]);
    setForm(initialFormState);
    setErrorMessage(null);
    setSuccessMessage(`直前の操作（${undoState.label}）を元に戻しました。`);
  }

  function resetFilters(): void {
    setFilters(initialFilterState);
    setSortKey(initialSortKey);
  }

  function toggleSelected(id: string): void {
    setSelectedIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

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

    const selectedSet = new Set(selectedIds);
    const nextDrafts = drafts.map((draft) =>
      selectedSet.has(draft.id)
        ? updateLineDraft(draft, {
            lineName: draft.lineName,
            carrier: draft.carrier,
            lineType: draft.lineType,
            monthlyCost: draft.monthlyCost,
            status: nextStatus,
            memo: draft.memo,
            nextReviewDate: draft.nextReviewDate,
          })
        : draft,
    );

    persist(nextDrafts, {
      previousDrafts: drafts,
      undoLabel: `一括変更: ${selectedIds.length}件を${nextStatus}へ更新`,
    });
    setSelectedIds([]);
    setSuccessMessage(`${selectedIds.length}件の契約状態を「${nextStatus}」へ更新しました。`);
  }

  function handleBulkDelete(): void {
    resetMessages();

    if (selectedIds.length === 0) {
      setErrorMessage('一括削除する回線を選択してください。');
      return;
    }

    const selectedSet = new Set(selectedIds);
    const nextDrafts = drafts.filter((draft) => !selectedSet.has(draft.id));

    persist(nextDrafts, {
      previousDrafts: drafts,
      undoLabel: `一括削除: ${selectedIds.length}件を削除`,
    });
    setSuccessMessage(`${selectedIds.length}件の回線を削除しました。`);
    setSelectedIds([]);
  }

  useEffect(() => {
    lineDraftStore.ensureCurrentVersion();
  }, []);

  useEffect(() => {
    setSelectedIds((current) => current.filter((id) => drafts.some((draft) => draft.id === id)));
  }, [drafts]);

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

  function handleSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    resetMessages();

    const validated = validateForm();
    if (!validated) {
      return;
    }

    if (editingId) {
      const current = drafts.find((draft) => draft.id === editingId);
      if (!current) {
        setErrorMessage('編集対象が見つかりませんでした。もう一度選び直してください。');
        return;
      }

      const nextDrafts = drafts.map((draft) => (draft.id === editingId ? updateLineDraft(draft, validated) : draft));
      persist(nextDrafts, {
        previousDrafts: drafts,
        undoLabel: `更新: ${validated.lineName}`,
      });
      setSuccessMessage(`回線ドラフト「${validated.lineName}」を更新しました。`);
      resetForm();
      return;
    }

    const nextDraft = createLineDraft(validated);
    const nextDrafts = [nextDraft, ...drafts];
    persist(nextDrafts, {
      previousDrafts: drafts,
      undoLabel: `追加: ${validated.lineName}`,
    });
    setSuccessMessage(`回線ドラフト「${validated.lineName}」を保存しました。`);
    resetForm();
  }

  function handleEdit(draft: LineDraft): void {
    resetMessages();
    setEditingId(draft.id);
    setForm(toFormState(draft));
  }

  function handleDelete(draftId: string): void {
    resetMessages();
    const target = drafts.find((draft) => draft.id === draftId);
    const nextDrafts = drafts.filter((draft) => draft.id !== draftId);
    persist(nextDrafts, {
      previousDrafts: drafts,
      undoLabel: target ? `削除: ${target.lineName}` : '削除',
    });

    setSelectedIds((current) => current.filter((id) => id !== draftId));

    if (editingId === draftId) {
      resetForm();
    }

    setSuccessMessage(target ? `回線ドラフト「${target.lineName}」を削除しました。` : '回線ドラフトを削除しました。');
  }

  function handleCancelEdit(): void {
    resetMessages();
    resetForm();
  }

  return (
    <div className="page">
      <header className="page__header">
        <div>
          <p className="eyebrow">Lines</p>
          <h2>回線一覧</h2>
          <p className="page__lead">
            回線ドラフトの追加に加えて、検索・絞り込み・並び替え・期限表示・一括更新・一括削除で見たい回線を探しやすくします。保存層は薄い store に切り出し、後で差し替えやすくします。
          </p>
        </div>
      </header>

      <section className="card-grid card-grid--lines">
        <article className="card">
          <div className="card__header">
            <h3>回線ドラフトを追加・編集</h3>
            <span className="badge">{cardBadge}</span>
          </div>

          <form className="form-grid" onSubmit={handleSubmit}>
            <label className="field">
              <span>回線名 *</span>
              <input value={form.lineName} onChange={(event) => updateField('lineName', event.target.value)} placeholder="例: 楽天モバイル メイン" />
            </label>

            <label className="field">
              <span>キャリア *</span>
              <input value={form.carrier} onChange={(event) => updateField('carrier', event.target.value)} placeholder="例: 楽天モバイル" />
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
              <span>月額費用</span>
              <input inputMode="numeric" value={form.monthlyCost} onChange={(event) => updateField('monthlyCost', event.target.value)} placeholder="例: 2980" />
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
              <input type="date" min="2000-01-01" max="9999-12-31" value={form.nextReviewDate} onChange={(event) => updateField('nextReviewDate', event.target.value)} />
            </label>

            <label className="field field--full">
              <span>メモ</span>
              <textarea value={form.memo} onChange={(event) => updateField('memo', event.target.value)} rows={4} placeholder="任意。次回確認したいことを残せます。" />
            </label>

            {errorMessage ? <p className="notice notice--warn field--full">{errorMessage}</p> : null}
            {successMessage ? <p className="notice field--full">{successMessage}</p> : null}
            {undoState ? (
              <div className="notice notice--undo field--full">
                <div>
                  <strong>直前の操作を戻せます</strong>
                  <p className="muted">{undoState.label} / `Ctrl+Z` または `⌘Z` でも戻せます</p>
                </div>
                <button type="button" className="button" onClick={handleUndo}>操作を戻す</button>
              </div>
            ) : null}

            <div className="button-row field--full">
              <button type="submit" className="button button--primary">{submitLabel}</button>
              {editingId ? <button type="button" className="button" onClick={handleCancelEdit}>編集をやめる</button> : null}
            </div>
          </form>
        </article>

        <article className="card">
          <div className="card__header">
            <h3>保存済みの回線</h3>
            <span className="badge">{countLabel}</span>
          </div>

          <div className="form-grid form-grid--filters">
            <label className="field field--full">
              <span>キーワード</span>
              <input value={filters.keyword} onChange={(event) => updateFilter('keyword', event.target.value)} placeholder="回線名・キャリア・メモで検索" />
            </label>

            <label className="field">
              <span>契約状態</span>
              <select value={filters.status} onChange={(event) => updateFilter('status', event.target.value as FilterState['status'])}>
                <option value="all">すべて</option>
                {LINE_STATUS_OPTIONS.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>回線種別</span>
              <select value={filters.lineType} onChange={(event) => updateFilter('lineType', event.target.value as FilterState['lineType'])}>
                <option value="all">すべて</option>
                {LINE_TYPE_OPTIONS.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </label>

            <label className="field field--full">
              <span>並び順</span>
              <select value={sortKey} onChange={(event) => setSortKey(event.target.value as SortKey)}>
                <option value="review-date-asc">次回確認日が近い順</option>
                <option value="monthly-cost-desc">月額費用が高い順</option>
                <option value="monthly-cost-asc">月額費用が低い順</option>
                <option value="created-at-desc">作成日時が新しい順</option>
                <option value="created-at-asc">作成日時が古い順</option>
              </select>
            </label>

            <div className="bulk-toolbar field--full">
              <label className="bulk-checkbox">
                <input type="checkbox" checked={allVisibleSelected} onChange={toggleSelectAllVisible} disabled={visibleIds.length === 0} />
                <span>表示中をすべて選択</span>
              </label>
              <span className="badge">選択中 {selectedIds.length}件</span>
            </div>

            <div className="button-row field--full button-row--tight">
              <button type="button" className="button button--primary" onClick={() => applyBulkStatus('利用中')}>選択中を利用中へ</button>
              <button type="button" className="button" onClick={() => applyBulkStatus('解約予定')}>選択中を解約予定へ</button>
              <button type="button" className="button button--danger" onClick={handleBulkDelete}>選択中を削除</button>
              <button type="button" className="button" onClick={resetFilters}>絞り込みと並び順を解除</button>
            </div>
          </div>

          {!hasDrafts ? (
            <p className="muted">条件に一致する回線はありません。検索条件を見直すか、フォームから1件追加してください。</p>
          ) : (
            <ul className="list list--drafts">
              {visibleDrafts.map((draft) => {
                const deadlineStatus = getDeadlineStatus(draft.nextReviewDate);
                const isSelected = selectedIds.includes(draft.id);

                return (
                  <li key={draft.id} className={isSelected ? 'list__item--selected' : ''}>
                    <div className="list__row list__row--selectable">
                      <label className="bulk-checkbox">
                        <input type="checkbox" checked={isSelected} onChange={() => toggleSelected(draft.id)} />
                        <strong>{draft.lineName}</strong>
                      </label>
                      <span className={draft.status === '利用中' ? 'badge badge--ok' : 'badge'}>{draft.status}</span>
                    </div>
                    <div className="badge-row">
                      <span className={deadlineStatus.className}>{deadlineStatus.label}</span>
                    </div>
                    <span>{draft.carrier}</span>
                    <span>回線種別: {draft.lineType}</span>
                    <span>月額費用: {formatMonthlyCost(draft.monthlyCost)}</span>
                    <span>次回確認日: {formatReviewDate(draft.nextReviewDate)}</span>
                    {draft.memo ? <span>{draft.memo}</span> : null}
                    <span className="muted">保存日時: {formatCreatedAt(draft.createdAt)}</span>
                    <div className="button-row button-row--tight">
                      <button type="button" className="button" onClick={() => handleEdit(draft)}>編集する</button>
                      <button type="button" className="button button--danger" onClick={() => handleDelete(draft.id)}>削除する</button>
                    </div>
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
