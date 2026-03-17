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

type UndoState = {
  drafts: LineDraft[];
  label: string;
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

export function LinesPage(): JSX.Element {
  const [drafts, setDrafts] = useState<LineDraft[]>(() => lineDraftStore.load());
  const [form, setForm] = useState<FormState>(initialFormState);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [undoState, setUndoState] = useState<UndoState | null>(null);

  const hasDrafts = drafts.length > 0;
  const countLabel = useMemo(() => `${drafts.length}件`, [drafts.length]);
  const submitLabel = editingId ? '更新する' : '保存する';
  const cardBadge = editingId ? '編集中' : 'スキーマ拡張';

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
    setForm(initialFormState);
    setErrorMessage(null);
    setSuccessMessage(`直前の操作（${undoState.label}）を元に戻しました。`);
  }

  useEffect(() => {
    lineDraftStore.ensureCurrentVersion();
  }, []);

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

      const nextDrafts = drafts.map((draft) =>
        draft.id === editingId ? updateLineDraft(draft, validated) : draft,
      );
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
            回線ドラフトの追加に加えて、編集と削除までをこの段階で扱います。保存層は薄い store に切り出し、後で差し替えやすくします。
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
              <input
                value={form.lineName}
                onChange={(event) => updateField('lineName', event.target.value)}
                placeholder="例: 楽天モバイル メイン"
              />
            </label>

            <label className="field">
              <span>キャリア *</span>
              <input
                value={form.carrier}
                onChange={(event) => updateField('carrier', event.target.value)}
                placeholder="例: 楽天モバイル"
              />
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
              <input
                inputMode="numeric"
                value={form.monthlyCost}
                onChange={(event) => updateField('monthlyCost', event.target.value)}
                placeholder="例: 2980"
              />
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
              <textarea
                value={form.memo}
                onChange={(event) => updateField('memo', event.target.value)}
                rows={4}
                placeholder="任意。次回確認したいことを残せます。"
              />
            </label>

            {errorMessage ? <p className="notice notice--warn field--full">{errorMessage}</p> : null}
            {successMessage ? <p className="notice field--full">{successMessage}</p> : null}
            {undoState ? (
              <div className="notice notice--undo field--full">
                <div>
                  <strong>直前の操作を戻せます</strong>
                  <p className="muted">{undoState.label} / `Ctrl+Z` または `⌘Z` でも戻せます</p>
                </div>
                <button type="button" className="button" onClick={handleUndo}>
                  操作を戻す
                </button>
              </div>
            ) : null}

            <div className="button-row field--full">
              <button type="submit" className="button button--primary">
                {submitLabel}
              </button>
              {editingId ? (
                <button type="button" className="button" onClick={handleCancelEdit}>
                  編集をやめる
                </button>
              ) : null}
            </div>
          </form>
        </article>

        <article className="card">
          <div className="card__header">
            <h3>保存済みの回線</h3>
            <span className="badge">{countLabel}</span>
          </div>

          {!hasDrafts ? (
            <p className="muted">
              登録された回線はまだありません。フォームから1件追加すると、この一覧に直ちに反映されます。
            </p>
          ) : (
            <ul className="list list--drafts">
              {drafts.map((draft) => (
                <li key={draft.id}>
                  <div className="list__row">
                    <strong>{draft.lineName}</strong>
                    <span className={draft.status === '利用中' ? 'badge badge--ok' : 'badge'}>{draft.status}</span>
                  </div>
                  <span>{draft.carrier}</span>
                  <span>回線種別: {draft.lineType}</span>
                  <span>月額費用: {formatMonthlyCost(draft.monthlyCost)}</span>
                  <span>次回確認日: {formatReviewDate(draft.nextReviewDate)}</span>
                  {draft.memo ? <span>{draft.memo}</span> : null}
                  <span className="muted">保存日時: {formatCreatedAt(draft.createdAt)}</span>
                  <div className="button-row button-row--tight">
                    <button type="button" className="button" onClick={() => handleEdit(draft)}>
                      編集する
                    </button>
                    <button type="button" className="button button--danger" onClick={() => handleDelete(draft.id)}>
                      削除する
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </article>
      </section>
    </div>
  );
}
