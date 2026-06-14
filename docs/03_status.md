# Status

## 現在地（2026-06-15）

- Bootstrap Issue: #1（永続 open）
- Context Hub Issue: #2（永続 open）
- 現在地: 共通イベントフィードと command center 化を main に反映。PR #217 で `quickActivity` 導線とサイドパネル回帰を Playwright 常設化し、PR #218 で `@types/node` patch を吸収。PR #219 で Vite 8 / plugin-react 6 へ更新し、PR #221 で React Router 7 移行調査を完了。PR #222 で React Router 7 への単独更新を main に反映し、PR #224 で React 19 単独更新、PR #225 で TypeScript 6 単独更新、PR #226 で統合バックアップ復元 E2E 拡張、PR #227 で設定永続化 E2E 拡張、PR #228 でバックアップ import 失敗表示 E2E 拡張、PR #229 でサンプルデータ投入後の dashboard / history drilldown E2E、PR #230 で `/lines` URL drilldown E2E、PR #231 でバックアップ復元後の編集保存 E2E、PR #232 で通知対象フィルタ E2E、PR #233 で履歴編集後の reload persistence E2E、PR #234 で一括ステータス変更後の undo E2E、PR #235 で一括削除後の undo E2E、PR #236 でバックアップ復元後の履歴編集 E2E、PR #237 で履歴下書き破棄後の persistence E2E、PR #238 で履歴下書きの reset / save cleanup E2E、PR #239 で活動メモ custom 候補の persistence E2E を main に反映。続いて活動メモ候補の固定 / 非表示 / 復帰 persistence E2E を追加している。
- 運用前提: PR 必須 / approval 任意 / required check `check-and-build`
- 直近の作業: `activity memo template pin and hide persistence path` E2E を追加し、活動メモ custom 候補を固定、非表示、復帰した状態が localStorage と reload 後の表示に反映されることを mobile / desktop の両 viewport で確認する。
- 追加確認: Playwright MCP はローカル `cwd` で起動でき、`/lines/history` の実画面確認が可能

## 実装済み主要機能

### ダッシュボード (`/`)
- データ 0 件時の初回ガイド（回線追加 / 確認用サンプルデータ投入 / 履歴確認 / バックアップ復元）
- `Summary KPI` で `Danger Alerts / Notifications / Monthly Cost / Net Balance` を横並び表示
- `Hopping Health` で `安全離脱 / 期限警告 / 実績不足` の 3 リングを表示
- `Actionable Alerts` を `Critical / Warning / Watch` のアコーディオンで整理
- `Actionable Alerts` は共通イベントフィード由来で、`安全離脱 / 期限警告 / 実績不足` の3分類を維持したまま並べ替えている
- `Actionable Alerts` から `履歴で記録` で `HistoryPage` へ飛び、`quickActivity` と `historyIntent` を受けた文脈カードを表示できる
- `HistoryPage` に `今後のイベント` の月別 read-only 一覧を追加し、共通イベントフィードを calendar 前段として確認できるようにした
- 契約終了が近い回線アラート（30日以内）
- 今後のアクション予定（予定日が60日以内または超過の利用中 / 解約予定回線）
- 番号・無料オプション期限アラート（MNP予約番号期限 / 無料オプション期限が3日以内または超過の利用中 / 解約予定回線）
- 特典期限アラート（未受取かつ受取期限日が30日以内または超過の特典）
- 長期未活動の回線カード（90日基準）＋「活動を記録」クイックリンク（`/lines/history?quickActivity=<phone>`）
- 名義が複数あるときだけ表示される `名義別サマリー`
- `BenefitRecord` ベースの概算 `収支サマリー`
- `収支サマリー` から、受取済み特典がある回線一覧と `/lines?openDraft=<id>&focusSection=benefits` で該当回線を直接開く導線を表示
- 光回線向けの `残債解消予定日 / あとN日 / 概算残債` ダッシュボード補助カードと、`/lines?openDraft=<id>&focusSection=fiber` で該当回線を直接開く導線
- `利用中` / `解約予定` 回線について、`通 / 話 / S` の不足種別を巡回できるダッシュボード補助カードと `contractActiveOnly=true` / `usagePriority=<kind>` 付きの `/lines` 導線
- 共通イベントフィードを read-only 集約として `src/lib/lineEvents.ts` に分離し、`plannedExitDate` / `mnpReservationExpiry` / `freeOptionDeadline` / `benefits.deadlineDate` / `nextReviewDate` / `contractEndDate` / 光回線残債 / 長期未活動 を横断して扱えるようにした
- 通知方針サマリー / 通知理由別件数 / 通知対象回線一覧
- サイドバーの `設定` は見出しに整理し、`ストレージ` / `バックアップ` / `通知設定` / `活動種別` の配下リンクが重複しない状態にした

### 主台帳 (`/lines`)
- CRUD・Undo / 絞り込み・並び替え・一括操作
- URLパラメータでソート指定（`?sort=latestActivityAsc` など）
- 契約開始日から 181 日後の `解約可能推奨日` を自動表示
- `plannedExitDate` / `plannedExitType` / `plannedNextCarrier` を構造化して保存・表示
- `mnpReservationNumber` / `mnpReservationExpiry` / `freeOptionDeadline` を構造化して保存・表示
- `LineDraft.benefits: BenefitRecord[]` を導入し、特典 / キャッシュバックを構造化して保存・表示
- 特典の種別 / 金額 / 受取期限日 / 受取条件 / 受取済み / 受取日 / メモを追加・編集・削除可能
- `利用中` / `解約予定` の回線に、180日以内の `通 / 話 / S` 利用実績バッジを表示
- `lineType === 光回線` のときだけ、移行種別 / ISP 名 / 工事費関連を構造化して保存・表示
- 光回線の詳細に `残債解消予定日` と `概算残債` を表示
- 行ボタンから「活動を記録」→ `/lines/history?quickActivity=<phone>` へ遷移
- データ 0 件時の空状態ガイド（回線フォーム / 確認用サンプルデータ投入 / バックアップ復元 / 履歴ページ）

### 契約履歴・活動ログ (`/lines/history`)
- 履歴 CRUD / 複数活動ログ / タイムライン（PR #120 でページ分離）
- `?quickActivity=<phone>` で履歴フォームを自動セット
- 電話番号に一致する主台帳候補 / 直近履歴候補のワンタップ反映
- 上部の `履歴の要点` / `クイック操作` 帯で、フォーム / タイムライン / 入出力をすばやく切り替えられる
- Dashboard からの `historyIntent` / `quickActivity` を受け取ると、開いている文脈を上部で確認できる
- 活動種別のクイック選択ボタン（頻出種別 + 定義済み種別）
- 活動種別に応じた活動メモ候補（種別別の頻出文言 + fallback 候補）
- 活動メモのクイック候補（固定候補 + この種別でよく使う文言 + 追加した候補 + 定型候補 + 最近使った文言 + 非表示候補）
- 現在の活動メモ文言を custom 候補として追加・削除・更新可能
- 活動メモ候補の pin / unpin / 非表示 / 復帰を localStorage で保持
- 候補の重複を優先順で整理し、現在値と一致する候補を選択中表示
- 固定候補 / 非表示候補 / 候補管理全体を一括で初期化可能
- custom 候補を `上へ` / `下へ` で並び替え、表示順を保持可能
- 各候補セクションを折りたたみ可能で、表示状態を localStorage に保持
- 活動日のクイック入力（今日 / 契約開始日 / 前回活動日）
- 活動記録後「次回確認日を更新しますか？」サジェスト（活動日+`reviewIntervalDays`日）
- 既存履歴の未知活動種別を編集しても値を保持
- 履歴入力フォームの下書きを localStorage に自動保存し、再読み込み後に復元
- 復元した下書きを `破棄して新規入力` で即座に捨てて空フォームへ戻せる
- 履歴 JSON のエクスポート / インポート
- データ 0 件時の空状態ガイド（履歴フォーム / 確認用サンプルデータ投入 / 回線一覧 / バックアップ復元）

### 設定 (`/settings`)
- `/settings/storage` / `/settings/backup` / `/settings/notifications` / `/settings/activity-types` のサブルート導線
- StorageManager API 状態確認・永続化要求
- 統合バックアップエクスポート・インポート（主台帳＋履歴）
- 通知設定（有効/無効・対象期限・再通知方針・確認間隔日数）
- カスタム活動種別管理

### インフラ
- PWA（manifest / SW）/ SW は開発環境で無効 / ビルド時キャッシュバスト
- `.env.local` の `VITE_DEV_LABEL` でサイドバーにブランチバッジ表示（`PR #NNN` 運用）
- 左側サイドパネル（サイドバー）はヘッダーを残したまま nav だけ縦スクロール可能
- GitHub Actions: `Repo sanity` に加えて `CI` workflow で Node.js 22 / `npm run check` / `npm run build` / Playwright side panel regression を実行
- `main` 保護: PR 必須 / approval 任意 / required check `check-and-build`

## 次の候補

1. 活動メモ候補の固定 / 非表示 / 復帰 persistence E2E PR の `check` / `build` / `test:e2e` / `audit` と GitHub Actions を通し、候補管理状態に回帰がないことを確認する
2. `npm audit --audit-level=low` と `npm outdated --depth=0` を継続監視する
3. 次の品質改善は、活動メモ custom 候補の更新 / 並び替えや複数選択一括操作の追加パターンなど、未自動化のユーザー導線を小さく追加する
