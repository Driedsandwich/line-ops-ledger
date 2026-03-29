# Runbook

## 10分で再開する手順

1. `README.md` を読む
2. Issue #2（Context Hub）を開いて現在地を確認する
3. `gh pr list --state open` で open PR を確認する
4. ローカルで `npm install && npm run dev` を実行する
5. `.env.local` に `VITE_DEV_LABEL="DEV / <ブランチ名> / Issue #NNN"` をセットする
6. `/`、`/lines`、`/lines/history`、`/settings` の表示を確認する

## 動作確認チェックリスト

- ダッシュボード（`/`）
  - [ ] 危険案件サマリー・契約終了アラート・長期未活動カードが表示される
  - [ ] 長期未活動カードに「活動を記録」リンクがあり、`/lines/history?quickActivity=<phone>` へ遷移する（データがある場合）
- 主台帳（`/lines`）
  - [ ] 回線の追加・編集・削除・Undo が動く
  - [ ] 検索・絞り込み・並び替えが動く
  - [ ] `?sort=latestActivityAsc` などの URL パラメータが反映される
  - [ ] 行の「活動を記録」ボタンが `/lines/history` の履歴フォームをセットする
  - [ ] 統合バックアップエクスポートで JSON がダウンロードされる
  - [ ] 「回線一覧で確認する」が `/lines?sort=latestActivityAsc` で開く
- 履歴・タイムライン（`/lines/history`）
  - [ ] `?quickActivity=<phone>` で履歴フォームが自動セットされる
  - [ ] 活動記録保存後に次回確認日サジェストが表示される
  - [ ] 既存履歴の未知活動種別を編集しても種別が保持される
- 設定（`/settings`）
  - [ ] 通知方針の変更が保存される
  - [ ] 統合バックアップの復元成功メッセージに主台帳件数と履歴件数が表示される

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
