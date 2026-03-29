import { useEffect, useRef, useState } from 'react';
import {
  ACTIVITY_TYPE_LABEL_MAX_LENGTH,
  ACTIVITY_TYPE_MAX_CUSTOM,
  BUILT_IN_ACTIVITY_TYPES,
  loadCustomActivityTypes,
  saveCustomActivityTypes,
} from '../lib/activityTypeSettings';
import {
  CURRENT_LINE_DRAFT_SCHEMA_VERSION,
  lineDraftStore,
  type LineDraftStorageInfo,
} from '../lib/lineDrafts';
import {
  getDefaultNotificationSettings,
  loadNotificationSettings,
  saveNotificationSettings,
  type NotificationRelaunchPolicy,
  type NotificationReminderWindow,
  type NotificationSettings,
} from '../lib/notificationSettings';
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

function formatReminderWindow(value: NotificationReminderWindow): string {
  switch (value) {
    case 'overdue':
      return '期限超過だけを対象にする';
    case 'today':
      return '今日期限までを対象にする';
    case 'within-3-days':
      return '3日以内までを対象にする';
    case 'within-7-days':
      return '7日以内までを対象にする';
    default:
      return '不明';
  }
}

function formatRelaunchPolicy(value: NotificationRelaunchPolicy): string {
  switch (value) {
    case 'none':
      return '再通知しない';
    case 'on-app-launch':
      return '次回起動時に再表示する';
    default:
      return '不明';
  }
}

export function SettingsPage(): JSX.Element {
  const [state, setState] = useState<StoragePersistenceState>(initialState);
  const [storageInfo, setStorageInfo] = useState<LineDraftStorageInfo>(initialStorageInfo);
  const [notificationSettings, setNotificationSettings] = useState<NotificationSettings>(() =>
    getDefaultNotificationSettings(),
  );
  const [loading, setLoading] = useState(true);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [customActivityTypes, setCustomActivityTypes] = useState<string[]>(() => loadCustomActivityTypes());
  const [newActivityType, setNewActivityType] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  async function refresh(): Promise<void> {
    setLoading(true);
    const nextState = await readStoragePersistenceState();
    lineDraftStore.ensureCurrentVersion();
    const nextStorageInfo = lineDraftStore.getInfo();
    const nextNotificationSettings = loadNotificationSettings();
    setState(nextState);
    setStorageInfo(nextStorageInfo);
    setNotificationSettings(nextNotificationSettings);
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

  function handleExportBackup(): void {
    try {
      const json = lineDraftStore.exportBackupJson();
      const filename = lineDraftStore.buildBackupFilename();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
      setActionMessage(`JSON バックアップをエクスポートしました: ${filename}`);
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : 'バックアップのエクスポートに失敗しました。');
    }
  }

  async function handleImportFile(event: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const raw = await file.text();
      const result = lineDraftStore.importBackupJson(raw);
      await refresh();
      setActionMessage(`JSON バックアップをインポートしました。${result.importedCount}件を復元しました。`);
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : 'バックアップのインポートに失敗しました。');
    } finally {
      event.target.value = '';
    }
  }

  function updateNotificationSettings(nextSettings: NotificationSettings): void {
    setNotificationSettings(nextSettings);
    saveNotificationSettings(nextSettings);
    setActionMessage('通知設定を保存しました。');
  }

  function handleAddActivityType(): void {
    const label = newActivityType.trim();
    if (!label) return;
    if (label.length > ACTIVITY_TYPE_LABEL_MAX_LENGTH) {
      setActionMessage(`活動種別は${ACTIVITY_TYPE_LABEL_MAX_LENGTH}文字以内で入力してください。`);
      return;
    }
    if ((BUILT_IN_ACTIVITY_TYPES as readonly string[]).includes(label) || customActivityTypes.includes(label)) {
      setActionMessage('同じ名前の活動種別がすでに存在します。');
      return;
    }
    if (customActivityTypes.length >= ACTIVITY_TYPE_MAX_CUSTOM) {
      setActionMessage(`カスタム活動種別は${ACTIVITY_TYPE_MAX_CUSTOM}件まで登録できます。`);
      return;
    }
    const next = [...customActivityTypes, label];
    setCustomActivityTypes(next);
    saveCustomActivityTypes(next);
    setNewActivityType('');
    setActionMessage(`「${label}」を活動種別に追加しました。`);
  }

  function handleRemoveActivityType(label: string): void {
    const next = customActivityTypes.filter((t) => t !== label);
    setCustomActivityTypes(next);
    saveCustomActivityTypes(next);
    setActionMessage(`「${label}」を削除しました。`);
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
            永続ストレージ状態に加えて、回線台帳の保存データ情報、JSON バックアップ導線、通知方針を確認できる画面です。
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

        <article className="card">
          <div className="card__header">
            <h3>JSON バックアップ</h3>
            <span className="badge">手動退避</span>
          </div>

          <p className="muted">
            現在の保存データを JSON ファイルとして退避できます。インポートすると現在の保存データを置き換えます。
          </p>

          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden-file-input"
            onChange={(event) => void handleImportFile(event)}
          />

          <div className="button-row">
            <button type="button" className="button button--primary" onClick={handleExportBackup}>
              JSON をエクスポート
            </button>
            <button type="button" className="button" onClick={() => fileInputRef.current?.click()}>
              JSON をインポート
            </button>
          </div>
        </article>

        <article className="card">
          <div className="card__header">
            <h3>通知設定</h3>
            <span className={notificationSettings.enabled ? 'badge badge--ok' : 'badge'}>
              {notificationSettings.enabled ? '利用する' : '利用しない'}
            </span>
          </div>

          <form className="form-grid">
            <label className="field field--full">
              <span>通知を使うか</span>
              <select
                value={notificationSettings.enabled ? 'enabled' : 'disabled'}
                onChange={(event) =>
                  updateNotificationSettings({
                    ...notificationSettings,
                    enabled: event.target.value === 'enabled',
                  })
                }
              >
                <option value="disabled">使わない</option>
                <option value="enabled">使う</option>
              </select>
            </label>

            <label className="field">
              <span>通知対象の期限</span>
              <select
                value={notificationSettings.reminderWindow}
                onChange={(event) =>
                  updateNotificationSettings({
                    ...notificationSettings,
                    reminderWindow: event.target.value as NotificationReminderWindow,
                  })
                }
              >
                <option value="overdue">{formatReminderWindow('overdue')}</option>
                <option value="today">{formatReminderWindow('today')}</option>
                <option value="within-3-days">{formatReminderWindow('within-3-days')}</option>
                <option value="within-7-days">{formatReminderWindow('within-7-days')}</option>
              </select>
            </label>

            <label className="field">
              <span>再通知の扱い</span>
              <select
                value={notificationSettings.relaunchPolicy}
                onChange={(event) =>
                  updateNotificationSettings({
                    ...notificationSettings,
                    relaunchPolicy: event.target.value as NotificationRelaunchPolicy,
                  })
                }
              >
                <option value="none">{formatRelaunchPolicy('none')}</option>
                <option value="on-app-launch">{formatRelaunchPolicy('on-app-launch')}</option>
              </select>
            </label>
          </form>

          <p className="muted">
            この MVP では、アプリを閉じている間の通知配信は保証しません。ここでは「どこまでを通知対象とみなすか」と
            「次回起動時に再表示するか」の最小方針だけを保存します。
          </p>
        </article>

        <article className="card">
          <div className="card__header">
            <h3>カスタム活動種別</h3>
            <span className="badge">{customActivityTypes.length}件</span>
          </div>

          <p className="muted">
            活動ログ記録時のプルダウンに表示する独自の種別を追加できます（最大{ACTIVITY_TYPE_MAX_CUSTOM}件）。
          </p>

          {customActivityTypes.length > 0 ? (
            <ul className="list">
              {customActivityTypes.map((label) => (
                <li key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                  <span>{label}</span>
                  <button type="button" className="button button--sm" onClick={() => handleRemoveActivityType(label)}>
                    削除
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">カスタム種別はまだありません。</p>
          )}

          <div className="field" style={{ marginTop: '1rem' }}>
            <span>新しい種別名</span>
            <input
              type="text"
              value={newActivityType}
              maxLength={ACTIVITY_TYPE_LABEL_MAX_LENGTH}
              placeholder="例: データ速度確認"
              onChange={(event) => setNewActivityType(event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); handleAddActivityType(); } }}
            />
          </div>

          <div className="button-row">
            <button
              type="button"
              className="button button--primary"
              disabled={!newActivityType.trim() || customActivityTypes.length >= ACTIVITY_TYPE_MAX_CUSTOM}
              onClick={handleAddActivityType}
            >
              追加する
            </button>
          </div>
        </article>
      </section>
    </div>
  );
}
