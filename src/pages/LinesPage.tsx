import { useEffect, useMemo, useState } from 'react';
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

type FilterState = {
  keyword: string;
  status: 'all' | LineStatus;
  lineType: 'all' | LineType;
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

const initialFilterState: FilterState = {
  keyword: '',
  status: 'all',
  lineType: 'all',
};

const initialSortKey: SortKey = 'nextReviewDate';

function isEditableElement(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable;
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

export function LinesPage(): JSX.Element {
  const [drafts, setDrafts] = useState<LineDraft[]>(() => lineDraftStore.load());
  const [filters, setFilters] = useState<FilterState>(initialFilterState);
  const [sortKey, setSortKey] = useState<SortKey>(initialSortKey);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [expandedIds, setExpandedIds] = useState<string[]>([]);
  const [form, setForm] = useState<FormState>(initialFormState);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [undoState, setUndoState] = useState<UndoState | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

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

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]): void {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function updateFilter<K extends keyof FilterState>(key: K, value: FilterState[K]): void {
    setFilters((current) => ({ ...current, [key]: value }));
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

  const visibleDrafts = useMemo(() => {
    const keyword = filters.keyword.trim().toLowerCase();
    const filtered = drafts.filter((draft) => {
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

    return filtered.sort((a, b) => {
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
  }, [drafts, filters, sortKey]);

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
    </div>
  );
}
