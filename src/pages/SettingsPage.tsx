import { useEffect, useState } from 'react';
import {
  readStoragePersistenceState,
  requestPersistentStorage,
  type StoragePersistenceState,
} from '../lib/storage';

const initialState: StoragePersistenceState = {
  supported: false,
  persisted: null,
  quotaEstimate: '確認中…',
  errorMessage: null,
};

export function SettingsPage(): JSX.Element {
  const [state, setState] = useState<StoragePersistenceState>(initialState);
  const [loading, setLoading] = useState(true);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  async function refresh(): Promise<void> {
    setLoading(true);
    const nextState = await readStoragePersistenceState();
    setState(nextState);
    setLoading(false);
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function handleRequestPersistence(): Promise<void> {
    const result = await requestPersistentStorage();

    if (result.errorMessage) {
      setActionMessage(`永続化要求に失敗: ${result.errorMessage}`);
    } else if (result.granted) {
      setActionMessage('永続化要求が許可されました。');
    } else {
      setActionMessage('永続化要求は利用可能ですが、この環境では許可されませんでした。');
    }

    await refresh();
  }

  const persistenceLabel = !state.supported
    ? '非対応'
    : state.persisted === true
      ? '有効'
      : state.persisted === false
        ? '未許可'
        : '未確認';

  return (
    <div className="page">
      <header className="page__header">
        <div>
          <p className="eyebrow">Settings</p>
          <h2>永続ストレージ状態</h2>
          <p className="page__lead">
            初回セットアップ手順にある「永続ストレージ状態を確認する」を先に満たすための画面です。
          </p>
        </div>
      </header>

      <section className="card-grid card-grid--single">
        <article className="card">
          <div className="card__header">
            <h3>StorageManager API</h3>
            <span className={state.persisted ? 'badge badge--ok' : 'badge'}>{persistenceLabel}</span>
          </div>

          <dl className="definition-list">
            <div>
              <dt>API対応</dt>
              <dd>{state.supported ? '対応' : '非対応'}</dd>
            </div>
            <div>
              <dt>永続化状態</dt>
              <dd>{persistenceLabel}</dd>
            </div>
            <div>
              <dt>容量目安</dt>
              <dd>{loading ? '確認中…' : state.quotaEstimate}</dd>
            </div>
          </dl>

          {state.errorMessage ? <p className="notice notice--warn">{state.errorMessage}</p> : null}
          {actionMessage ? <p className="notice">{actionMessage}</p> : null}

          <div className="button-row">
            <button type="button" className="button button--primary" onClick={() => void handleRequestPersistence()}>
              persist を要求する
            </button>
            <button type="button" className="button" onClick={() => void refresh()}>
              再確認する
            </button>
          </div>
        </article>
      </section>
    </div>
  );
}
