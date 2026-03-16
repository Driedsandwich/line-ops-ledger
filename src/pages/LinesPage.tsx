import { useMemo, useState } from 'react';
import {
  createLineDraft,
  LINE_STATUS_OPTIONS,
  loadLineDrafts,
  saveLineDrafts,
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

export function LinesPage(): JSX.Element {
  const [drafts, setDrafts] = useState<LineDraft[]>(() => loadLineDrafts());
  const [form, setForm] = useState<FormState>(initialFormState);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const hasDrafts = drafts.length > 0;
  const countLabel = useMemo(() => `${drafts.length}件`, [drafts.length]);

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

  function handleSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    resetMessages();

    const lineName = form.lineName.trim();
    const carrier = form.carrier.trim();
    const memo = form.memo.trim();

    if (!lineName || !carrier || !form.status) {
      setErrorMessage('回線名、キャリア、契約状態は必須です。');
      return;
    }

    const nextDraft = createLineDraft({
      lineName,
      carrier,
      status: form.status,
      memo,
    });

    const nextDrafts = [nextDraft, ...drafts];
    setDrafts(nextDrafts);
    saveLineDrafts(nextDrafts);
    setForm(initialFormState);
    setSuccessMessage(`回線ドラフト「${lineName}」を保存しました。`);
  }

  return (
    <div className="page">
      <header className="page__header">
        <div>
          <p className="eyebrow">Lines</p>
          <h2>回線一覧</h2>
          <p className="page__lead">
            最小フォームで回線ドラフトを保存し、一覧に表示する段階です。後続で保存層を置き換えやすいよう localStorage で先行します。
          </p>
        </div>
      </header>

      <section className="card-grid card-grid--lines">
        <article className="card">
          <div className="card__header">
            <h3>回線ドラフトを追加</h3>
            <span className="badge">最小保存</span>
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
                保存する
              </button>
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
                </li>
              ))}
            </ul>
          )}
        </article>
      </section>
    </div>
  );
}
