# AI Log

## 2026-03-17
- repo `Driedsandwich/line-ops-ledger` を確認
- Bootstrap Issue #1 を作成
- PR #3〜#19 を squash merge（PWA shell / ダッシュボード基盤 / 主台帳基盤）

## 2026-03-18
- PR #21〜#25 をユーザー側で squash merge
- PR #27〜#53: 契約履歴・タイムライン・活動ログ・JSON バックアップ・通知方針 etc.

## 2026-03-19〜2026-03-26
- PR #55〜#86: 活動ログ多重化・表示改善・ダッシュボード強化・回線一覧最適化 etc.

## 2026-03-27
- PR #88: 最終活動日が古い順ソート追加（Issue #87）
- PR #90: ダッシュボードに長期未活動カード追加（Issue #89）
- Issue #93: SW キャッシュ問題（dev 無効化・network-first・キャッシュバスト）→ PR #94
- Issue #95: バグ3件修正（累積カウント・今日 useMemo・import reset）→ PR #96

## 2026-03-28
- PR #92: 行ボタンから「活動を記録」追加（Issue #91）
- PR #94: SW キャッシュ修正（Issue #93）
- PR #96: バグ3件修正（Issue #95）
- PR #98: ダッシュボードに契約終了アラート追加（Issue #97）
- PR #100: 長期未活動カードから解約済み除外（Issue #99）
- PR #103: URL パラメータでソート指定（Issue #101/102）

## 2026-03-29
- PR #105: ダッシュボード長期未活動カードから「活動を記録」クイックリンク追加（Issue #104）
  - `/lines?quickActivity=<phone>` で履歴フォームを自動セット
- PR #107: devProgressLabel を `.env.local` の `VITE_DEV_LABEL` に切り替え（Issue #106）
  - App.tsx のブランチ毎書き換えを廃止 → コンフリクト根本解消
- PR #109: 統合バックアップエクスポート追加（Issue #108）
  - `{ exportedAt, version, lineDrafts, lineHistory }` を1ファイルに
- PR #114: 統合バックアップインポート追加（Issue #113）
  - 主台帳と履歴を1ファイルから同時に復元
- PR #117: カスタム活動種別管理追加（Issue #116）
  - `/settings` で独自種別を追加・削除
- PR #118: 次回確認日サジェスト日数を設定化（Issue #115）
  - `reviewIntervalDays` を導入し、固定 +30 日を廃止
- PR #111: 活動記録後「次回確認日を更新しますか？」サジェスト追加（Issue #110）
  - 活動日+30日を提案、ワンクリックで nextReviewDate を更新
- Issue #91 クローズ漏れ対処（PR #92 マージ済み）
- docs / README / Context Hub を現状に同期（本 PR）
- PR #120（Issue #119）: 履歴・タイムラインを `/lines/history` へ分離、サイドバーサブナビ追加
  - `LinesPage` から履歴フォーム・活動ログ・タイムライン（~855行）を `HistoryPage` へ抽出
  - 「活動を記録」ボタンが `/lines/history?quickActivity=<phone>` へ遷移するよう変更
  - `NotificationSettings.reviewIntervalDays` フィールドを追加（PR #115 依存を前倒し）
- Issue #121: quick activity 回帰修正と履歴互換保護
  - ダッシュボードの「活動を記録」を `/lines/history?quickActivity=<phone>` に修正
  - 既存履歴の未知活動種別を編集しても値を保持
  - 統合バックアップ復元メッセージに主台帳件数と履歴件数を表示
- Issue #123: 初回利用者向け Empty State 改善
  - `/` に初回ガイドを追加し、回線追加 / 履歴確認 / バックアップ復元の導線を表示
  - `/lines` と `/lines/history` のデータ 0 件時に次アクションのボタンを追加
- Issue #125: 履歴入力で活動種別のクイック選択を追加
  - 頻出種別と定義済み種別から `活動種別` のクイック候補を表示
  - 候補を押すと、その活動ログの `activityType` に即時反映
- Issue #127: 活動ログメモのクイック候補を追加
  - `活動メモ` の直下に `定型候補` と `最近使った文言` を表示
  - 候補を押すと、空欄ならセット、非空なら末尾に追記
- Issue #129: 履歴入力の下書き候補を追加
  - 電話番号に一致する主台帳候補 / 直近履歴候補をワンタップ反映
  - 活動日に `今日` / `契約開始日` / `前回活動日` のクイック入力を追加
- Issue #131: 設定ページをサブルート分割してサイドバー導線を追加
  - `/settings/storage` / `/settings/backup` / `/settings/notifications` / `/settings/activity-types` を追加
  - サイドバー subnav と設定ページ内メニューから各セクションを直接開けるようにした
- Issue #133: 初回ガイドから確認用サンプルデータを読み込めるようにする
  - `/`、`/lines`、`/lines/history` のデータ 0 件時に確認用サンプルデータ投入ボタンを追加
  - クリック直後に主台帳と履歴を localStorage へ復元し、その場で画面を更新
- Issue #135: 活動種別に連動した活動メモ候補を追加
  - 履歴データから種別ごとの頻出メモを集計し、`活動メモ` 直下に表示
  - 履歴が少ない種別でも fallback 候補を出し、`活動種別` と `活動メモ` の連動を強化
- Issue #137: GitHub Actions に最小 CI を追加
  - `CI` workflow で `npm ci` → `npm run check` → `npm run build` を実行
  - required checks を安全に有効化する前段として、安定 job `check-and-build` を固定

## 2026-03-30
- Issue #139: `main` 保護と required checks を有効化
  - `main` に PR 必須 / approval 任意 / force push 禁止 / deletion 禁止を設定
  - required check として `CI / check-and-build` を採用
- Issue #140: 履歴入力で活動メモ候補を固定できるようにする
  - `活動メモ` の候補を `固定候補` として pin/unpin できるようにする
  - 固定候補は localStorage に保存し、再読み込み後も保持する
- Issue #142: 履歴入力で活動メモ候補を個別に非表示・復元できるようにする
  - `活動メモ` の候補を非表示にし、全候補セクションから除外できるようにする
  - `非表示候補` セクションから `戻す` で復帰し、状態を localStorage に保存する
