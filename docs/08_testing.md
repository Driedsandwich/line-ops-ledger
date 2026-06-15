# テストと確認（Testing）

## 自動チェック（ある場合）
- 単体テスト: 未導入（現時点）
- 静的チェック:
  - `npx tsc --noEmit` （`npm run check`）
  - `npm run build`
  - `npm run test:sidepanel`
  - GitHub Actions `check-and-build`（CI側で `npm ci` → `npm run check` → `npm run build`）

## 手動スモークテスト（最小）
- 手順:
  1. `npm install` 後 `npm run dev` を起動
  2. `/`, `/lines`, `/lines/history`, `/settings/storage`, `/settings/backup`, `/settings/notifications`, `/settings/activity-types` を順に開く
  3. localStorage クリアで空状態ガイドが表示されることを確認
  4. 回線追加、履歴入力、`/lines?sort=latestActivityAsc` など URL ドリルダウンが動くことを確認
  5. バックアップエクスポート→再インポートで主要データ（台帳/履歴/活動メモ候補設定/活動種別設定）が復元されることを確認
  6. 空状態から確認用サンプルデータを読み込み、dashboard の主要カードと `Actionable Alerts` からの `履歴で記録` 導線が動くことを確認
- 期待する結果:
  - 主要ルートが読み込みエラーなく表示され、エラーメッセージや空白画面が出ない
  - 低 viewport でもサイドパネル確認が再現すること（例: 360x812）:
    - `npm run test:sidepanel` で 29 ケース（7ルート到達性＋`quickActivity` 3件＋`historyIntent` 10件＋未一致 `quickActivity` + `historyIntent` 1件＋無効 `historyIntent` 1件＋`quickActivity` 未一致のみ 1件＋無効 `historyIntent` + unknown `quickActivity` 1件＋`historyIntent` 単体 1件＋`quickActivity` 異常値 + `historyIntent` 1件＋`quickActivity` 異常値のみ 1件＋`/lines/history` 非指定 2件）の到達性確認を通過（Playwright の `webServer` が必要時に dev サーバを自動起動）
    - `npm run dev -- --host 127.0.0.1 --port 4173 --strictPort`
    - ブラウザ幅を 360x812（または iPhone 相当）に変更し、`メイン / 履歴 / 設定` の見出し付き構造が崩れないことを確認
    - 同状態で `/`, `/lines`, `/lines/history`, `/settings/storage` が開けることを確認
- 主要機能の主要導線（追加・保存・編集・バックアップ）が1回以上通る
- 既定の表示件数・集計カードに異常な `NaN` や空配列のみの崩れがない
- サイドパネル標準検証:
  - `メイン` / `履歴` / `設定` の見出しとリンク群が一貫して表示される
  - 現在ページが明確にアクティブ状態として表示される
  - 低い viewport でもサイドパネルが縦スクロール可能で主要リンクに到達できる
- 設定永続化検証:
  - カスタム活動種別を追加後に reload しても一覧へ戻ること
  - 通知設定の有効/期限/再通知/確認日数が reload 後も保持されること

## 主要導線回帰観点（行為 / 履歴 / バックアップ）

- 確認条件:
  1. `?quickActivity=` / `historyIntent=` の URL 受け口が成立する状態（主台帳またはダミーデータ）で `/` と `/lines` へ入れる。
  2. `/lines` または `DashboardPage` から `履歴で記録` / `活動を記録` の導線を一度通れる。
  3. `?quickActivity=<phone>` 直打ちでも履歴フォームの電話番号が受け取れる。

- 重点ケース:
  - 行為導線
    - `/lines` の行一覧で `活動を記録` を押し、`/lines/history` へ遷移する。
    - 遷移先フォームに、対象回線の番号が正規化済み値で先頭に入る（`-` や空白があっても問題ない）。
    - 保存済み回線を選択して一括ステータス変更し、`操作を戻す` で元の契約状態へ戻る。
    - 保存済み回線を選択して一括削除し、`操作を戻す` で一覧へ復元される。
    - フィルタ中に `表示中をすべて選択` / `表示中の選択を解除` を押し、可視行だけの選択状態が切り替わる。
  - 履歴導線
    - 空状態から確認用サンプルデータを投入し、`Summary KPI` / `Hopping Health` / `Actionable Alerts` が表示される。
    - `DashboardPage` の `Actionable Alerts` から `履歴で記録` を押し、`historyIntent` が付いた `?quickActivity=` 遷移が成立する。
    - `HistoryPage` の「開いている文脈」帯で意図ラベルが見えること。
    - `?quickActivity=<phone>` を手入力した場合でも、履歴フォームの電話番号が受け側で正規化前提に沿って補完される。
    - 履歴編集後に reload しても、更新済みの活動メモがタイムラインへ保持される。
    - 未保存の履歴入力フォームを reload すると下書きが復元され、`破棄して新規入力` 後は再 reload しても下書きが戻らない。
    - 未保存の履歴入力フォームを `入力をリセット` すると下書きが消え、履歴保存後も下書きだけが残らない。
    - 活動メモ欄から custom 候補を追加すると、入力リセットと reload 後も `追加した候補` として残る。
    - 活動メモ候補を固定 / 非表示 / 復帰すると、reload 後も `固定候補` / `非表示候補` の状態が維持される。
    - 活動メモ候補の固定 / 非表示がある状態で候補管理を初期化すると、reload 後に管理状態が残らず、custom 候補自体は再表示される。
    - custom 活動メモ候補を更新 / 並び替えすると、reload 後も更新後の文言と順序が維持される。
    - 活動メモ候補セクションを折りたたむと、reload 後も閉じた状態が維持され、`展開` で候補ボタンが戻る。
  - 主台帳 URL 導線
    - サンプルデータ投入後、`Hopping Health` の `利用実績を確認` から `/lines?sort=latestActivityAsc&contractActiveOnly=true` に遷移し、契約中のみ filter が有効になる。
    - `/lines?openDraft=<id>&focusSection=benefits` と `/lines?openDraft=<id>&focusSection=fiber` で対象回線が展開され、該当セクションが表示される。
    - `/lines?sort=latestActivityAsc&contractActiveOnly=true&usagePriority=<kind>` で不足種別の優先 filter と対象行の強調が表示される。
    - 通知設定を有効化した状態で `/lines?notificationTargetOnly=true&notificationReason=<reason>` を開き、通知対象のみ filter と通知理由 filter が表示に反映される。
    - 通知設定を有効化した状態で Dashboard の通知理由リンクから `/lines` へ遷移し、`通知対象のみ` 切替後も通知理由 filter が維持される。
  - バックアップ導線
    - `/settings/backup` で「統合バックアップをエクスポート」→ 生成 JSON をローカルで保存。
    - 生成 JSON に主台帳、履歴、活動メモ候補設定（custom / pinned / hidden / collapsed sections）、活動種別設定が含まれることを確認する。
    - 主台帳/履歴を初期化後、同じ JSON で復元し、主台帳件数と履歴件数が一致することを確認。
    - 復元後、活動メモ候補設定が localStorage に戻ることを確認する。
    - 復元後、活動種別設定が localStorage に戻ることを確認する。
    - 復元後、カスタム活動種別を `/lines/history` の活動種別 select で選択し、その活動種別で履歴保存できることを確認する。
    - `activityMemoPreferences` を含まない旧統合バックアップを復元しても、主台帳 / 履歴が戻り、既存の活動メモ候補設定が消えないことを確認する。
    - 主台帳単体バックアップを復元しても、主台帳が戻り、既存の活動メモ候補設定が消えないことを確認する。
    - 復元後、`/lines` と `/lines/history` に戻って追加・保存・空状態導線が壊れていないことを確認。
    - 復元後、主台帳行を編集して保存し、reload 後も更新内容が保持されることを確認。
    - 復元後、履歴タイムラインの履歴を編集して保存し、reload 後も更新内容が保持されることを確認。
    - E2E では履歴メモとマスク済み電話番号が `/lines/history` のタイムラインに戻ることまで確認する。
    - 不正な JSON バックアップを読み込んだ場合、形式不正 notice が表示されることを確認する。

- これらが成立しない場合:
  - `buildHistoryLink` 利用有無と `normalizePhoneNumber` 周辺（`lineEvents.ts` / `HistoryPage.tsx`）の受け口を優先で確認する。
  - まず `main` の最小導線が機能しているかを優先復旧し、次にデータ量を増やして再実行する。

## React Router 7 移行時の重点確認

- 実行条件:
  - React Router 7 更新 PR は React 19 / TypeScript 6 と分離する。
  - `npm run check` / `npm run build` / `npm run test:e2e` / `npm audit --audit-level=low` を必須にする。
  - CI の `Repo sanity` と `CI / check-and-build` が通過してから merge 判断する。

- ルーティング確認:
  - `/`, `/lines`, `/lines/history`, `/settings/storage`, `/settings/backup`, `/settings/notifications`, `/settings/activity-types` が直接 URL 入力でも表示される。
  - `/settings` が `/settings/storage` へ replace 遷移する。
  - サイドパネルの `メイン` / `履歴` / `設定` セクションと active state が崩れない。

- deep link 確認:
  - `/lines/history?quickActivity=<phone>` で履歴フォームの電話番号が補完される。
  - Dashboard から `historyIntent` 付きで `/lines/history` へ遷移し、文脈カードが表示される。
  - `/lines?openDraft=<id>&focusSection=benefits` と `/lines?openDraft=<id>&focusSection=fiber` のスクロール導線が維持される。
  - `/lines?sort=latestActivityAsc&contractActiveOnly=true&usagePriority=<kind>` の初期フィルタと強調表示が維持される。

- バックアップ復元後確認:
  - `/settings/backup` で統合バックアップを復元した後、`/lines` と `/lines/history` へ遷移して主台帳件数と履歴件数が表示される。
  - 復元後も `活動を記録` と `履歴で記録` の導線が成立する。

- 事前に再確認するコード条件:
  - multi-segment splat route が追加されていない。
  - `useFetcher` / `useFetchers` / Router `loader` / Router `action` / `React.lazy` / SSR hydration / `fallbackElement` が追加されていない。
  - `RouterProvider` の import は React Router 7 の DOM deep import 要件に合わせている。

## リリース前チェック（必要な場合）
- [ ] 受け入れ条件を満たす
- [ ] セキュリティ観点で問題がない
- [ ] docs/02_runbook.md が最新
- [ ] docs/03_status.md が最新
- [ ] バージョンやタグ運用を決めた
