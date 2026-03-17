import { useEffect, useState } from 'react';
import {
  CURRENT_LINE_DRAFT_SCHEMA_VERSION,
  lineDraftStore,
  type LineDraftStorageInfo,
} from '../lib/lineDrafts';
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

const initialStorageInfo: LineDraftStorageInfo = {
  schemaVersion: CURRENT_LINE_DRAFT_SCHEMA_VERSION,
  itemCount: 0,
  updatedAt: null,
  format: 'empty',
};

function formatUpdatedAt(value: string | null): string {
  if (!value) {
    return '未保存';
  }

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

function formatStorageFormat(value: LineDraftStorageInfo['format']): string {
  switch (value) {
    case 'empty':
      return '未保存';
    case 'legacy-array':
      return '旧配列形式';
    case 'versioned-envelope':
      return 'versioned envelope';
    case 'invalid-data':
      return '不正データ';
    default:
      return '不明';
  }
}

function formatSchemaVersion(value: number | null): string {
  return value == null ? '不明' : `v${value}`;
}

export function SettingsPage(): JSX.Element {
  const [state, setState] = useState<StoragePersistenceState>(initialState);
  const [storageInfo, setStorageInfo] = useState<LineDraftStorageInfo>(initialStorageInfo);
  const [loading, setLoading] = useState(true);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  async function refresh(): Promise<void> {
    setLoading(true);
    const nextState = await readStoragePersistenceState();
    lineDraftStore.ensureCurrentVersion();
    const nextStorageInfo = lineDraftStore.getInfo();
    setState(nextState);
    setStorageInfo(nextStorageInfo);
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
            永続ストレージ状態に加えて、回線台帳の保存データ情報を確認できる画面です。
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

        <article className="card">
          <div className="card__header">
            <h3>保存データ情報</h3>
            <span className="badge">{formatSchemaVersion(storageInfo.schemaVersion)}</span>
          </div>

          <dl className="definition-list">
            <div>
              <dt>schema version</dt>
              <dd>{formatSchemaVersion(storageInfo.schemaVersion)}</dd>
            </div>
            <div>
              <dt>保存件数</dt>
              <dd>{storageInfo.itemCount}件</dd>
            </div>
            <div>
              <dt>最終更新時刻</dt>
              <dd>{formatUpdatedAt(storageInfo.updatedAt)}</dd>
            </div>
            <div>
              <dt>保存形式</dt>
              <dd>{formatStorageFormat(storageInfo.format)}</dd>
            </div>
          </dl>

          <p className="muted">
            旧配列形式の保存データがある場合、この画面を開いた時点で現行の versioned envelope へ読み替えます。
          </p>
        </article>
      </section>
    </div>
  );
}
