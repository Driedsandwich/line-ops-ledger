import { lineDraftStore, type LineDraft } from '../lib/lineDrafts';

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
  if (!value) {
    return null;
  }

  const parsed = new Date(`${value}T00:00:00`);
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

function buildSummary(drafts: LineDraft[]): {
  dangerCount: number;
  todayCount: number;
  within3Days: number;
  within7Days: number;
  activeCount: number;
  closingCount: number;
  nearest: LineDraft[];
} {
  const today = new Date();
  let dangerCount = 0;
  let todayCount = 0;
  let within3Days = 0;
  let within7Days = 0;
  let activeCount = 0;
  let closingCount = 0;

  const nearest = drafts
    .filter((draft) => Boolean(draft.nextReviewDate))
    .sort((a, b) => a.nextReviewDate.localeCompare(b.nextReviewDate))
    .slice(0, 5);

  for (const draft of drafts) {
    if (draft.status === '利用中') {
      activeCount += 1;
    } else {
      closingCount += 1;
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
  }

  return {
    dangerCount,
    todayCount,
    within3Days,
    within7Days,
    activeCount,
    closingCount,
    nearest,
  };
}

export function DashboardPage(): JSX.Element {
  const drafts = lineDraftStore.load();
  const summary = buildSummary(drafts);

  return (
    <div className="page">
      <header className="page__header">
        <div>
          <p className="eyebrow">Dashboard</p>
          <h2>今日やることと危険案件の入口</h2>
          <p className="page__lead">
            保存済み回線の次回確認日と契約状態から、危険案件サマリーと近日期限を集計します。
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
      </section>

      <section className="card-grid card-grid--single">
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
