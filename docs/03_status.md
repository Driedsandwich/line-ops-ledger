# Status

## 現在地（2026-03-30）

- Bootstrap Issue: #1（永続 open）
- Context Hub Issue: #2（永続 open）
- 現在地: PR #145 まで `main` 反映済み
- 運用前提: PR 必須 / approval 任意 / required check `check-and-build`

## 実装済み主要機能

### ダッシュボード (`/`)
- データ 0 件時の初回ガイド（回線追加 / 確認用サンプルデータ投入 / 履歴確認 / バックアップ復元）
- 危険案件サマリー / 近日期限集計（排他）/ 状態別件数 / 月額費用サマリー
- 契約終了が近い回線アラート（30日以内）
- 長期未活動の回線カード（90日基準）＋「活動を記録」クイックリンク（`/lines/history?quickActivity=<phone>`）
- 通知方針サマリー / 通知理由別件数 / 通知対象回線一覧

### 主台帳 (`/lines`)
- CRUD・Undo / 絞り込み・並び替え・一括操作
- URLパラメータでソート指定（`?sort=latestActivityAsc` など）
- 行ボタンから「活動を記録」→ `/lines/history?quickActivity=<phone>` へ遷移
- データ 0 件時の空状態ガイド（回線フォーム / 確認用サンプルデータ投入 / バックアップ復元 / 履歴ページ）

### 契約履歴・活動ログ (`/lines/history`)
- 履歴 CRUD / 複数活動ログ / タイムライン（PR #120 でページ分離）
- `?quickActivity=<phone>` で履歴フォームを自動セット
- 電話番号に一致する主台帳候補 / 直近履歴候補のワンタップ反映
- 活動種別のクイック選択ボタン（頻出種別 + 定義済み種別）
- 活動種別に応じた活動メモ候補（種別別の頻出文言 + fallback 候補）
- 活動メモのクイック候補（固定候補 + 定型候補 + 最近使った文言 + 非表示候補）
- 活動メモ候補の pin / unpin / 非表示 / 復帰を localStorage で保持
- 候補の重複を優先順で整理し、現在値と一致する候補を選択中表示
- 固定候補 / 非表示候補 / 候補管理全体を一括で初期化可能
- 活動日のクイック入力（今日 / 契約開始日 / 前回活動日）
- 活動記録後「次回確認日を更新しますか？」サジェスト（活動日+`reviewIntervalDays`日）
- 既存履歴の未知活動種別を編集しても値を保持
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
- GitHub Actions: `Repo sanity` に加えて `CI` workflow で `npm run check` / `npm run build` を実行
- `main` 保護: PR 必須 / approval 任意 / required check `check-and-build`

## 次の候補

1. 履歴入力の下書き補助強化の継続（例: 活動メモ候補の個別管理の拡張 / 管理導線の整理）
2. merge 後に stale 化しやすい status / Context 運用の簡素化
3. `Repo sanity` の役割整理（CI と二重化している確認の扱い見直し）
