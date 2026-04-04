# 要件（Requirements）

## 1. プロジェクト種別（どれか1つ）
- [x] Webアプリ
- [ ] CLIツール（コマンド実行型）
- [ ] 自動化スクリプト（バッチ）
- [ ] その他（具体的に）

## 2. 入力（Input）
- 画面フォーム入力
  - 回線情報
  - 履歴・活動ログ
  - 特典 / 残債 / 予定情報
  - 通知設定
- ファイル入力
  - JSON バックアップ
- URL 入力
  - `openDraft`
  - `focusSection`
  - `contractActiveOnly`
  - `usagePriority`
  - `quickActivity`
- ローカル保存
  - versioned envelope 形式の localStorage データ

## 3. 出力（Output）
- 画面表示
  - dashboard
  - 回線一覧
  - 履歴・タイムライン
  - settings
- ファイル出力
  - JSON バックアップ
- 将来出力候補
  - ICS / calendar 連携
  - event list の外部共有

## 4. 制約（Constraints）
- 実行環境（Windows/Mac、ブラウザ、社内PC制限など）
  - CodexDesktop / Windows / PowerShell を優先
  - ブラウザで動作確認できること
- 使えないもの（外部API禁止など）
  - 現フェーズではキャリア API 自動連携を前提にしない
  - 画面単位で外部サービス依存を増やしすぎない
- 予算（従量課金の上限）
  - 当面は追加コストなしで維持する

## 5. データの機密度（Security）
- 扱う情報
  - 電話番号、契約先、契約条件、活動履歴、特典条件、将来的には秘匿情報
- 外部サービスに送ってよい情報の範囲
  - 現フェーズでは原則として送らない
- 要件
  - 秘匿情報を平文 localStorage に保存しない
  - バックアップ時に秘匿情報を含める / 含めないを将来選択可能にする
  - 入力・import 時にバリデーションをかける

## 6. 受け入れ条件（Acceptance Criteria）
- `main` を壊さずに PR ベースで機能を追加できる
- ダッシュボードの command center 構成が維持される
- `/lines/history` の quick logging、候補管理、下書き復元が回帰しない
- 既存 drilldown が壊れない
- 0 件データとサンプルデータの両方で最低限の導線が機能する
- バックアップ / 復元で主要データが再現できる
- 一意 ID と日付整合性の検証方針を保てる

## 7. 確認手順（How to verify）
- `npm run check`
- `npm run build`
- ブラウザで確認
  - `/`
  - `/lines`
  - `/lines/history`
  - `/settings/storage`
  - `/settings/backup`
  - `/settings/notifications`
  - `/settings/activity-types`
- 期待結果
  - command center の 3 層表示が崩れない
  - drilldown が遷移先で機能する
  - import / export が失敗時に明確なメッセージを出す

## 8. ユーザーストーリー（任意）
- 利用者として、解約可能日や期限を 1 画面で確認したい。なぜなら、期限失念による損失を避けたいから。
- 利用者として、活動ログを短時間で残したい。なぜなら、後から履歴を追いやすくしたいから。
- 利用者として、バックアップを安全に取りたい。なぜなら、local-first で運用する以上、復元性が重要だから。

## 9. 非機能要件（任意）
- セキュリティ:
  - 秘匿情報はマスク表示を基本とし、保存方針を明確にする
- プライバシー:
  - 個人契約情報の外部送信を前提にしない
- 性能:
  - localStorage とブラウザ UI で実用的に動くこと
- 可用性:
  - オフライン寄りの local-first 運用を継続できること
- 保守性:
  - UI / ドメイン / 永続化 / 秘匿情報の責務を分けること

## 10. 未決事項（Open questions）
- [ ] devices / tasks / ROI / secret vault を現在の line-centric product にどの順で取り込むか
- [ ] 秘匿情報を本当に保持する必要があるか、保持するならどこまでか
- [ ] ICS / calendar をいつ正式な画面として導入するか
- [ ] 収支予測の時間軸定義をどこまで細分化するか
- [ ] 単独利用から家族 / 小規模チーム利用へ広げるか
