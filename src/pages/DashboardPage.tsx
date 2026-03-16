const todayTasks = [
  { title: '初回セットアップ確認', detail: 'ロック設定・バックアップ導線・永続ストレージ確認' },
  { title: '回線ドラフト登録準備', detail: '最低1件の回線ドラフトを登録できる状態を次Issueで作る' },
];

const upcomingDeadlines = [
  { label: '今日期限', value: '0件' },
  { label: '3日以内', value: '0件' },
  { label: '7日以内', value: '0件' },
];

export function DashboardPage(): JSX.Element {
  return (
    <div className="page">
      <header className="page__header">
        <div>
          <p className="eyebrow">Dashboard</p>
          <h2>今日やることと危険案件の入口</h2>
          <p className="page__lead">
            仕様で要求される「危険案件0件でもカード表示」「0件時は問題なし」を先に満たす骨組みです。
          </p>
        </div>
      </header>

      <section className="card-grid">
        <article className="card card--accent">
          <div className="card__header">
            <h3>危険案件サマリー</h3>
            <span className="badge badge--ok">問題なし</span>
          </div>
          <p className="metric">0件</p>
          <p className="muted">
            危険案件が0件でもカードは非表示にしません。次の実装で実データ集計につなぎます。
          </p>
        </article>

        <article className="card">
          <div className="card__header">
            <h3>今日の優先タスク</h3>
            <span className="badge">準備中</span>
          </div>
          <ul className="list">
            {todayTasks.map((task) => (
              <li key={task.title}>
                <strong>{task.title}</strong>
                <span>{task.detail}</span>
              </li>
            ))}
          </ul>
        </article>

        <article className="card">
          <div className="card__header">
            <h3>近日期限</h3>
            <span className="badge">空状態</span>
          </div>
          <div className="stats-row">
            {upcomingDeadlines.map((item) => (
              <div className="stat-box" key={item.label}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </div>
            ))}
          </div>
        </article>
      </section>
    </div>
  );
}
