# 要件（Requirements）

## 1. プロジェクト種別（どれか1つ）
- [x] Webアプリ
- [ ] CLIツール（コマンド実行型）
- [ ] 自動化スクリプト（バッチ）
- [ ] その他（具体的に）

## 2. 入力（Input）
- 回線データ、履歴データ、活動ログ、特典情報、通知設定
- `lines/history` のフォーム入力
- JSON の backup import/export
- URL パラメータ（`openDraft` / `focusSection` / `contractActiveOnly` / `usagePriority` / `quickActivity`）

## 3. 出力（Output）
- `/` の dashboard
- `/lines` の主台帳一覧・詳細・編集フォーム
- `/lines/history` の履歴入力・タイムライン・event feed
- `/settings/*` の設定画面
- localStorage / versioned envelope に保存された状態

## 4. 制約（Constraints）
- 実行環境（Windows/Mac、ブラウザ、社内PC制限など）
  - Windows のローカル開発環境
  - ブラウザでの確認を前提にする
- 使えないもの（外部API禁止など）
  - 外部バックエンド必須の構成
  - 機密 vault を前提にした設計
- 予算（従量課金の上限）
  - 追加の外部課金を前提にしない

## 5. データの機密度（Security）
- 扱う情報:
  - 電話番号、契約者名義、履歴、特典条件、通知設定
- 外部サービスに送ってよい情報の範囲:
  - このリポジトリでは外部送信を前提にしない

## 6. 受け入れ条件（Acceptance Criteria）
- `/`、`/lines`、`/lines/history`、`/settings/*` がそれぞれ目的どおり動く
- `openDraft` / `focusSection` / `contractActiveOnly` / `usagePriority` / `quickActivity` が回帰しない
- `check-and-build` が通る
- backup import/export が壊れない
- 0 件データと sample data の両方で主要導線が成立する

## 7. 確認手順（How to verify）
- `npm run check`
- `npm run build`
- ブラウザで `/`、`/lines`、`/lines/history`、`/settings/storage`、`/settings/backup`、`/settings/notifications`、`/settings/activity-types` を確認する

## 8. ユーザーストーリー（任意）
- 利用者として、複数回線の期限と活動を一画面で追いたい。なぜなら、見落としを減らしたいから。

## 9. 非機能要件（任意）
- セキュリティ:
  - 機密情報は外部送信しない
- プライバシー:
  - local-first を維持する
- 性能:
  - 長い一覧でも操作性を落としすぎない
- 可用性:
  - 破損した表示や cache 依存を避ける
- 保守性:
  - 既存 route と drilldown を壊さず、小さい PR で進める

## 10. 未決事項（Open questions）
- [ ] 未来フェーズの `devices / tasks / secret vault / calendar / ROI` を、どの順で separate issue 化するか