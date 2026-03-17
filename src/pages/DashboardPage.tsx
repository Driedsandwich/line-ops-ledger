import { lineDraftStore, normalizeReviewDate, type LineDraft } from '../lib/lineDrafts';
import {
  loadNotificationSettings,
  type NotificationRelaunchPolicy,
  type NotificationReminderWindow,
} from '../lib/notificationSettings';

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

function formatReviewDate(value: string): string {
  const date = parseReviewDate(value);
  if (!date) {
    return '未設定';
  }

  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function formatCurrency(value: number): string {
  return `${new Intl.NumberFormat('ja-JP').format(value)}円/月`;
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

type NotificationTargetItem = {
  draft: LineDraft;
  reasonLabel: string;
};

type DashboardSummary = {
  dangerCount: number;
  todayCount: number;
  within3Days: number;
  within7Days: number;
  activeCount: number;
  closingCount: number;
  monthlyTotal: number;
  notificationEligibleCount: number;
  notificationTargets: NotificationTargetItem[];
  nearest: LineDraft[];
};

function buildReasonLabel(diff: number): string {
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

function buildSummary(drafts: LineDraft[], reminderWindow: NotificationReminderWindow): DashboardSummary {
  const today = new Date();
  let dangerCount = 0;
  let todayCount = 0;
  let within3Days = 0;
  let within7Days = 0;
  let activeCount = 0;
  let closingCount = 0;
  let monthlyTotal = 0;
  let notificationEligibleCount = 0;

  const nearest = drafts
    .filter((draft) => Boolean(normalizeReviewDate(draft.nextReviewDate)))
    .sort((a, b) => a.nextReviewDate.localeCompare(b.nextReviewDate))
    .slice(0, 5);

  const notificationTargets = drafts
    .flatMap((draft) => {
      const reviewDate = parseReviewDate(draft.nextReviewDate);
      if (!reviewDate) {
        return [];
      }

      const diff = diffInDays(today, reviewDate);
      if (!isNotificationTarget(diff, reminderWindow)) {
        return [];
      }

      return [{
        draft,
        reasonLabel: buildReasonLabel(diff),
      } satisfies NotificationTargetItem];
    })
    .sort((a, b) => a.draft.nextReviewDate.localeCompare(b.draft.nextReviewDate))
    .slice(0, 5);

  for (const draft of drafts) {
    if (draft.status === '利用中') {
      activeCount += 1;
    } else {
      closingCount += 1;
    }

    if (draft.monthlyCost != null) {
      monthlyTotal += draft.monthlyCost;
    }

    const reviewDate = parseReviewDate(draft.nextReviewDate);
    if (!reviewDate) {
      continue;
    }

    const diff = diffInDays(today, reviewDate);

    if (diff <= 0) {
      dangerCount += 1;
    }
    if (diff === 0) {
      todayCount += 1;
    }
    if (diff >= 0 && diff <= 3) {
      within3Days += 1;
    }
    if (diff >= 0 && diff <= 7) {
      within7Days += 1;
    }
    if (isNotificationTarget(diff, reminderWindow)) {
      notificationEligibleCount += 1;
    }
  }

  return {
    dangerCount,
    todayCount,
    within3Days,
    within7Days,
    activeCount,
    closingCount,
    monthlyTotal,
    notificationEligibleCount,
    notificationTargets,
    nearest,
  };
}

export function DashboardPage(): JSX.Element {
  const drafts = lineDraftStore.load();
  const notificationSettings = loadNotificationSettings();
  const summary = buildSummary(drafts, notificationSettings.reminderWindow);

  return (
    <div className="page">
      <header className="page__header">
        <div>
          <p className="eyebrow">Dashboard</p>
          <h2>今日やることと危険案件の入口</h2>
          <p className="page__lead">
            保存済み回線の次回確認日、契約状態、月額費用に加えて、通知方針を見比べながら今日の優先度を確認できます。
          </p>
        </div>
      </header>

      <section className="card-grid">
        <article className="card card--accent">
          <div className="card__header">
            <h3>危険案件サマリー</h3>
            <span className={summary.dangerCount === 0 ? 'badge badge--ok' : 'badge'}>
              {summary.dangerCount === 0 ? '問題なし' : '要確認'}
            </span>
          </div>
          <p className="metric">{summary.dangerCount}件</p>
          <p className="muted">
            次回確認日が今日以前の回線を危険案件として集計します。日付未設定の回線は件数に含めません。
          </p>
        </article>

        <article className="card">
          <div className="card__header">
            <h3>状態別件数</h3>
            <span className="badge">実データ</span>
          </div>
          <div className="stats-row">
            <div className="stat-box">
              <span>利用中</span>
              <strong>{summary.activeCount}件</strong>
            </div>
            <div className="stat-box">
              <span>解約予定</span>
              <strong>{summary.closingCount}件</strong>
            </div>
            <div className="stat-box">
              <span>登録総数</span>
              <strong>{drafts.length}件</strong>
            </div>
          </div>
        </article>

        <article className="card">
          <div className="card__header">
            <h3>近日期限</h3>
            <span className="badge">実データ</span>
          </div>
          <div className="stats-row">
            <div className="stat-box">
              <span>今日期限</span>
              <strong>{summary.todayCount}件</strong>
            </div>
            <div className="stat-box">
              <span>3日以内</span>
              <strong>{summary.within3Days}件</strong>
            </div>
            <div className="stat-box">
              <span>7日以内</span>
              <strong>{summary.within7Days}件</strong>
            </div>
          </div>
        </article>

        <article className="card">
          <div className="card__header">
            <h3>通知方針サマリー</h3>
            <span className={notificationSettings.enabled ? 'badge badge--ok' : 'badge'}>
              {notificationSettings.enabled ? '利用する' : '利用しない'}
            </span>
          </div>
          <dl className="definition-list">
            <div>
              <dt>通知対象の期限</dt>
              <dd>{formatReminderWindow(notificationSettings.reminderWindow)}</dd>
            </div>
            <div>
              <dt>再通知の扱い</dt>
              <dd>{formatRelaunchPolicy(notificationSettings.relaunchPolicy)}</dd>
            </div>
            <div>
              <dt>現在の通知対象件数</dt>
              <dd>{notificationSettings.enabled ? `${summary.notificationEligibleCount}件` : '無効'}</dd>
            </div>
          </dl>
          <p className="muted">
            {notificationSettings.enabled
              ? '現在の設定と次回確認日から、通知対象になり得る回線件数を表示しています。閉アプリ時通知そのものはこの MVP では保証しません。'
              : '通知は無効です。`/settings` で有効にすると、現在の設定で通知対象になる件数をここで確認できます。'}
          </p>
        </article>
      </section>

      <section className="card-grid card-grid--single">
        <article className="card">
          <div className="card__header">
            <h3>通知対象の回線一覧</h3>
            <span className={notificationSettings.enabled ? 'badge badge--ok' : 'badge'}>
              {notificationSettings.enabled ? `最大${summary.notificationTargets.length}件` : '無効'}
            </span>
          </div>
          {!notificationSettings.enabled ? (
            <p className="muted">通知は無効です。`/settings` で通知を有効にすると、ここに対象回線が表示されます。</p>
          ) : summary.notificationTargets.length === 0 ? (
            <p className="muted">現在の設定では通知対象になる回線はありません。期限設定か次回確認日を見直すと、ここに候補が表示されます。</p>
          ) : (
            <>
              <ul className="list list--drafts">
                {summary.notificationTargets.map((item) => (
                  <li key={item.draft.id}>
                    <div className="list__row">
                      <strong>{item.draft.lineName}</strong>
                      <span className={item.draft.status === '利用中' ? 'badge badge--ok' : 'badge'}>{item.draft.status}</span>
                    </div>
                    <span>{item.draft.carrier}</span>
                    <span>次回確認日: {formatReviewDate(item.draft.nextReviewDate)}</span>
                    <span className="badge">{item.reasonLabel}</span>
                  </li>
                ))}
              </ul>
              <div className="button-row">
                <a className="button" href="/lines">
                  回線一覧で確認する
                </a>
              </div>
            </>
          )}
        </article>

        <article className="card">
          <div className="card__header">
            <h3>月額費用サマリー</h3>
            <span className="badge">実データ</span>
          </div>
          <p className="metric">{formatCurrency(summary.monthlyTotal)}</p>
          <p className="muted">月額費用が入力された回線だけを合計します。未設定の回線は合計に含めません。</p>
        </article>

        <article className="card">
          <div className="card__header">
            <h3>次回確認日が近い回線</h3>
            <span className="badge">最大5件</span>
          </div>
          {summary.nearest.length === 0 ? (
            <p className="muted">次回確認日が設定された回線はまだありません。`/lines` から日付を入れるとここに表示されます。</p>
          ) : (
            <ul className="list list--drafts">
              {summary.nearest.map((draft) => (
                <li key={draft.id}>
                  <div className="list__row">
                    <strong>{draft.lineName}</strong>
                    <span className={draft.status === '利用中' ? 'badge badge--ok' : 'badge'}>{draft.status}</span>
                  </div>
                  <span>{draft.carrier}</span>
                  <span>回線種別: {draft.lineType}</span>
                  <span>月額費用: {draft.monthlyCost == null ? '未設定' : formatCurrency(draft.monthlyCost)}</span>
                  <span>次回確認日: {formatReviewDate(draft.nextReviewDate)}</span>
                </li>
              ))}
            </ul>
          )}
        </article>
      </section>
    </div>
  );
}
