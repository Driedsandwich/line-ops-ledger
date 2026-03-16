export function LinesPage(): JSX.Element {
  return (
    <div className="page">
      <header className="page__header">
        <div>
          <p className="eyebrow">Lines</p>
          <h2>回線一覧</h2>
          <p className="page__lead">
            この画面は次Issueで一覧・作成フォームへ拡張します。現時点では遷移確認用のプレースホルダーです。
          </p>
        </div>
      </header>

      <section className="card-grid card-grid--single">
        <article className="card">
          <div className="card__header">
            <h3>空状態</h3>
            <span className="badge">0件</span>
          </div>
          <p className="muted">登録された回線はまだありません。最初の回線ドラフト登録は次の1 Issue で実装します。</p>
        </article>
      </section>
    </div>
  );
}
