import { useMemo, useState } from 'react';
import {
  createLineDraft,
  lineDraftStore,
  LINE_STATUS_OPTIONS,
  updateLineDraft,
  type LineStatus,
  type LineDraft,
} from '../lib/lineDrafts';

type FormState = {
  lineName: string;
  carrier: string;
  status: LineStatus;
  memo: string;
};

const initialFormState: FormState = {
  lineName: '',
  carrier: '',
  status: '利用中',
  memo: '',
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

function toFormState(draft: LineDraft): FormState {
  return {
    lineName: draft.lineName,
    carrier: draft.carrier,
    status: draft.status,
    memo: draft.memo,
  };
}

export function LinesPage(): JSX.Element {
  const [drafts, setDrafts] = useState<LineDraft[]>(() => lineDraftStore.load());
  const [form, setForm] = useState<FormState>(initialFormState);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const hasDrafts = drafts.length > 0;
  const countLabel = useMemo(() => `${drafts.length}件`, [drafts.length]);
  const submitLabel = editingId ? '更新する' : '保存する';
  const cardBadge = editingId ? '編集中' : '最小保存';

  function persist(nextDrafts: LineDraft[]): void {
    setDrafts(nextDrafts);
    lineDraftStore.save(nextDrafts);
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

  function validateForm(): { lineName: string; carrier: string; memo: string } | null {
    const lineName = form.lineName.trim();
    const carrier = form.carrier.trim();
    const memo = form.memo.trim();

    if (!lineName || !carrier || !form.status) {
      setErrorMessage('回線名、キャリア、契約状態は必須です。');
      return null;
    }

    return { lineName, carrier, memo };
  }

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
        draft.id === editingId
          ? updateLineDraft(draft, {
              lineName: validated.lineName,
              carrier: validated.carrier,
              status: form.status,
              memo: validated.memo,
            })
          : draft,
      );
      persist(nextDrafts);
      setSuccessMessage(`回線ドラフト「${validated.lineName}」を更新しました。`);
      resetForm();
      return;
    }

    const nextDraft = createLineDraft({
      lineName: validated.lineName,
      carrier: validated.carrier,
      status: form.status,
      memo: validated.memo,
    });

    const nextDrafts = [nextDraft, ...drafts];
    persist(nextDrafts);
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
    persist(nextDrafts);

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
              <span>契約状態 *</span>
              <select value={form.status} onChange={(event) => updateField('status', event.target.value as LineStatus)}>
                {LINE_STATUS_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
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
