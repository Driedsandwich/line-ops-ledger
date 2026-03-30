# Runbook

## 10分で再開する手順

1. `README.md` を読む
2. Issue #2（Context Hub）を開いて現在地を確認する
3. `gh pr list --state open` で open PR を確認する
4. ローカルで `npm install && npm run dev` を実行する
5. `.env.local` に `VITE_DEV_LABEL="DEV / <ブランチ名> / PR #NNN"` をセットする
6. `/`、`/lines`、`/lines/history`、`/settings/storage`、`/settings/backup`、`/settings/notifications`、`/settings/activity-types` の表示を確認する

## 動作確認チェックリスト

- ダッシュボード（`/`）
  - [ ] localStorage 空の状態で、初回ガイドと `回線一覧で1件追加する` / `確認用サンプルデータを読み込む` / `バックアップを復元する` が表示される
  - [ ] `確認用サンプルデータを読み込む` で、ダッシュボードのカード群に件数と回線が即時反映される
  - [ ] 危険案件サマリー・契約終了アラート・長期未活動カードが表示される
  - [ ] 長期未活動カードに「活動を記録」リンクがあり、`/lines/history?quickActivity=<phone>` へ遷移する（データがある場合）
- 主台帳（`/lines`）
  - [ ] データ 0 件時に `回線フォームに戻る` / `確認用サンプルデータを読み込む` / `バックアップを復元する` / `履歴ページを見る` が表示される
  - [ ] 回線の追加・編集・削除・Undo が動く
  - [ ] 検索・絞り込み・並び替えが動く
  - [ ] `?sort=latestActivityAsc` などの URL パラメータが反映される
  - [ ] 行の「活動を記録」ボタンが `/lines/history` の履歴フォームをセットする
  - [ ] 統合バックアップエクスポートで JSON がダウンロードされる
  - [ ] 「回線一覧で確認する」が `/lines?sort=latestActivityAsc` で開く
- 履歴・タイムライン（`/lines/history`）
  - [ ] 履歴 0 件時に `履歴フォームに戻る` / `確認用サンプルデータを読み込む` / `回線一覧で1件追加する` / `バックアップを復元する` が表示される
  - [ ] `?quickActivity=<phone>` で履歴フォームが自動セットされる
  - [ ] 電話番号に一致する `主台帳候補` / `直近履歴候補` が表示され、押すと契約情報が反映される
  - [ ] `活動種別` の直下にクイック選択候補が表示され、押すとそのログの種別に即時反映される
  - [ ] `活動種別` に応じて `この種別でよく使う文言` が切り替わる
  - [ ] `活動メモ` の直下に `定型候補` と `最近使った文言` が表示され、押すとメモ欄に反映される
  - [ ] `活動日` に `今日` / `契約開始日` / `前回活動日` のクイック入力が表示される
  - [ ] 活動記録保存後に次回確認日サジェストが表示される
  - [ ] 既存履歴の未知活動種別を編集しても種別が保持される
- 設定（`/settings/*`）
  - [ ] `/settings` で `/settings/storage` へリダイレクトされる
  - [ ] `/settings/storage` で永続化状態と保存データ情報が表示される
  - [ ] `/settings/backup` で統合バックアップの入出力ができる
  - [ ] `/settings/notifications` で通知方針の変更が保存される
  - [ ] `/settings/activity-types` でカスタム活動種別の追加・削除ができる

## ブランチ命名規則

```
feat/<kebab-case>   機能追加
fix/<kebab-case>    バグ修正
chore/<kebab-case>  ドキュメント・設定変更
```

## Service Worker（本番ビルド）

- 開発環境（`npm run dev`）では SW は無効
- `npm run build` 時に `sw.js` の `__SW_CACHE_VERSION__` がビルド時刻で置換される
- 本番でキャッシュが古い場合は SW を手動登録解除するか、新しいビルドをデプロイする
