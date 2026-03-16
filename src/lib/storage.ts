export type StoragePersistenceState = {
  supported: boolean;
  persisted: boolean | null;
  quotaEstimate: string;
  errorMessage: string | null;
};

function formatBytes(bytes?: number): string {
  if (bytes == null || Number.isNaN(bytes)) {
    return '不明';
  }

  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export async function readStoragePersistenceState(): Promise<StoragePersistenceState> {
  if (!('storage' in navigator) || !navigator.storage) {
    return {
      supported: false,
      persisted: null,
      quotaEstimate: '不明',
      errorMessage: 'StorageManager API が利用できません。',
    };
  }

  try {
    const persisted = typeof navigator.storage.persisted === 'function'
      ? await navigator.storage.persisted()
      : null;

    const estimate = typeof navigator.storage.estimate === 'function'
      ? await navigator.storage.estimate()
      : undefined;

    const used = formatBytes(estimate?.usage);
    const quota = formatBytes(estimate?.quota);

    return {
      supported: true,
      persisted,
      quotaEstimate: `使用量 ${used} / 上限 ${quota}`,
      errorMessage: null,
    };
  } catch (error) {
    return {
      supported: true,
      persisted: null,
      quotaEstimate: '不明',
      errorMessage: error instanceof Error ? error.message : '状態取得に失敗しました。',
    };
  }
}

export async function requestPersistentStorage(): Promise<{
  granted: boolean;
  errorMessage: string | null;
}> {
  if (!('storage' in navigator) || typeof navigator.storage.persist !== 'function') {
    return {
      granted: false,
      errorMessage: 'persist API が利用できません。',
    };
  }

  try {
    const granted = await navigator.storage.persist();
    return { granted, errorMessage: null };
  } catch (error) {
    return {
      granted: false,
      errorMessage: error instanceof Error ? error.message : '永続化要求に失敗しました。',
    };
  }
}
