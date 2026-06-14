# 判断ログ（Decisions）

大きな判断（採用/不採用）と理由を残す。
後から読み返して「なぜこうなったか」を復元できる状態を作る。

## 記載フォーマット（例）
- 日付: 2026-01-25
- 判断: 例）外部DBは使わず、ローカルファイル保存にする
- 理由: 例）社内PC制限でDB接続が難しいため
- 代替案: 例）SQLite / Google Sheets
- 影響: 例）同時編集は不可

## 2026-04-05
- 日付: 2026-04-05
- 判断: 現行製品は `line-centric / local-first` の command center として維持し、`devices / tasks / secret vault / calendar / ROI` は future roadmap として分離する
- 理由: 既存の `/`、`/lines`、`/lines/history`、`/settings/*` の導線と event feed がすでに機能しており、別ドメインを混ぜると UI/IA とデータ構造が崩れるため
- 代替案: 本格版仕様に合わせてドメイン統合する案
- 影響: 仕様の基準点が固定され、以後の PR は既存 route と drilldown を壊さずに小さく進める

## 2026-06-10
- 日付: 2026-06-10
- 判断: 今回の更新では、`localStorage` 前提の実装実態と運用手順をドキュメントで明確化する
- 理由: 既存実装と説明の乖離（暗号化前提表現、sanity チェック範囲）が確認されたため、先に運用台帳を一致させる方が安全な更新経路になるため
- 代替案: 同時に依存更新とコード修正を行い、回帰検知を広い範囲で対応する
- 影響: 復旧性を重視した PR 分割となり、次 PR はドキュメント整合済みの状態で最小機能追加へ進める

- 日付: 2026-06-10
- 判断: `Repo sanity` に `tracked .env` 検知を追加し、秘密情報混入リスクを CI 入口で検知する
- 理由: `.gitignore` 依存ではなく、コードリポジトリ状態自体の監査を明文化・自動化する必要があるため
- 代替案: .env 未含有の現状は維持したまま、README/CLAUDE 側ルールを人手チェックに留める
- 影響: `sanity` が `.env` / `.env.*` の tracked 状態を検知しやすくなる一方、例外ファイルが増える場合は同時更新が必要になる

- 日付: 2026-06-10
- 判断: `tsc --build` / Vite build のローカル生成物 (`*.tsbuildinfo`, `vite.config.js`, `vite.config.d.ts`) を `.gitignore` に追加し、誤ってコミットされるリスクを下げる
- 理由: `npm run build` 実行時に上記ファイルが作業ツリーに現れ、手元で差分ノイズが増加するため
- 代替案: 生成物を都度 `git clean` で明示削除し運用する
- 影響: 監査時に実害がない範囲のローカル生成物は自動で無視される

- 日付: 2026-06-10
- 判断: `quickActivity`（および `historyIntent`）遷移時の電話番号を `normalizePhoneNumber` で正規化し、`buildHistoryLink` と `HistoryPage` 受け口を一致させる
- 理由: ダッシュボード→履歴の導線で表記ゆれ（ハイフン/空白/国番号有無）が混在すると `?quickActivity` の一致判定が外れ、フォーム自動設定が効かなくなるため
- 代替案: リンク生成側のみ固定フォーマットを採用し、受け口は文字列生値で保持する
- 影響: 既存の文字列比較が同一基準に統一され、`quickActivity` 経由の履歴導線が安定する一方、非正規化番号のままの保存・表示仕様は維持される

- 日付: 2026-06-10
- 判断: `quickActivity` 遷移を `buildHistoryLink` で統一し、`LinesPage` と `DashboardPage` の手動URL生成を廃止する
- 理由: 生成ロジック分散により `quickActivity` のフォーマット差・将来の historyIntent 追加漏れが起きる余地があるため
- 代替案: 各ページ個別で `encodeURIComponent(phoneNumber)` を使い続け、受け口側で補正を強める
- 影響: 共通ヘルパーに依存することで導線の一貫性が上がる一方、`buildHistoryLink` のインターフェース変更範囲が増えるため他呼び出し箇所の型見直しが必要になる

- 日付: 2026-06-10
- 判断: `quickActivity` 導線の手動 URL 生成を CI サニティで検知し、将来の回帰を早期阻止する
- 理由: PRの都度手作業でリンク文字列を追加しやすく、レビュー漏れで `buildHistoryLink` から逸脱しやすいため
- 代替案: レビュー時の手作業チェックだけで運用する（CI では検知しない）
- 影響: `src` 内で `quickActivity` ハードコーディングがあると PR 時点で fail し、修正コストを導線段階で吸収できる

- 日付: 2026-06-10
- 判断: サイドパネルの導線表示を「メイン / 履歴 / 設定」セクションに再編し、見出し付きの標準構造にする
- 理由: `履歴・タイムライン` を設定配下扱いで表示した実装は、導線確認時の見取り図として一貫性が低いため
- 代替案: 既存リンク順序のみ修正して `履歴` 見出しを追加しない
- 影響: 画面内ナビの可読性とレビュー効率が上がる一方、導線仕様そのものは変更せず最小差分に収まる

- 日付: 2026-06-10
- 判断: サイドパネル標準（`メイン` / `履歴` / `設定`）の低 viewport 到達性を確認項目として PR テンプレートに固定し、手動実行で再現する
- 理由: 低い viewport では nav 自体の存在は見えるだけで、リンク到達が確認できない場合があり、導線回帰を見逃しやすいため
- 代替案: レビュー時口頭確認だけで運用し、docs は現状維持
- 影響: 変更量を増やさずドキュメントと PR 運用で回帰検知を強化できる

- 日付: 2026-06-10
- 判断: `@playwright/test` を devDependencies に追加し、低 viewport の導線確認を自動化可能にする
- 理由: 360x812 相当の実画面確認は手動運用だと再現性が落ちやすく、今後の回帰検知で同一手順を保ちやすくするため
- 代替案: `@playwright/test` の代わりに手作業チェックのみ継続（今回の検証再現性は運用者依存）
- 影響: 開発依存にブラウザ自動化分が増え、ローカルでの Playwright ブラウザインストールが必要になる

- 日付: 2026-06-10
- 判断: 低 viewport サイドパネル回帰テストを `tests/sidepanel-check.spec.ts` と `npm run test:sidepanel` で常設する
- 理由: 回帰テストを実行コマンド一本で実施可能にし、確認抜けと再現差を減らすため
- 代替案: `docs` の手順のみを維持し、毎回ローカル手検証に依存
- 影響: Playwright 実行成果物の除外（`.gitignore`）が必要。テスト環境に `chromium` の初回インストールが必要

## 2026-06-15
- 日付: 2026-06-15
- 判断: React Router 7 は単独 PR で更新する。React 19 / TypeScript 6 は同じ PR に混ぜない
- 理由: 公式移行手順では React Router 7 が Node 20 / React 18 / React DOM 18 以上を要求し、future flag を段階適用してから v7 へ進むことを推奨している。現行環境は CI Node.js 22、React 18.3.1、React DOM 18.3.1 で前提を満たすが、v7 では `react-router-dom` から `react-router` への依存整理と `RouterProvider` の `react-router/dom` deep import が必要になるため、依存更新 PR として分離する
- 代替案: React Router 7 / React 19 / TypeScript 6 をまとめて更新する案
- 影響: 破壊的変更の原因を PR 単位で切り分けられる。次 PR では `react-router-dom@6.30.4` から React Router 7 へ移行し、import 差し替え、ルーティング、deep link、サイドパネル、バックアップ復元後遷移を重点確認する

- 日付: 2026-06-15
- 判断: React Router 7 移行前の追加実装変更は不要とする
- 理由: 現行コード検索では、React Router 利用は `Link` / `NavLink` / `Navigate` / `Outlet` / `useNavigate` / `useSearchParams` / `createBrowserRouter` / `RouterProvider` に限られる。`v7_startTransition` はすでに opt-in 済みで、multi-segment splat route、`useFetcher` / `useFetchers`、Router の `loader` / `action`、`React.lazy`、SSR hydration、`fallbackElement` は見つからなかったため、残る影響は主にパッケージ名と import 変更に限定される見込み
- 代替案: v6 の全 future flag を追加で opt-in してから依存更新する案
- 影響: `createBrowserRouter` の future flag 追加は現行機能に対する実益が薄いため保留する。React Router 7 更新 PR ではコード検索と E2E でこの前提を再確認する

- 日付: 2026-06-15
- 判断: React 19 は単独 PR で更新し、TypeScript 6 は同じ PR に混ぜない
- 理由: React 19 公式 upgrade guide では React 18.3 経由で警告を確認してから 19 へ進む流れが示されている。現行はすでに React 18.3.1 で、コード検索でも `ReactDOM.render` / `findDOMNode` / `defaultProps` / `propTypes` / 引数なし `useRef()` は見つからなかった。一方、React 19 型定義では global `JSX` namespace 依存が崩れるため、型注釈の修正は React 19 PR 内で扱う
- 代替案: React 19 と TypeScript 6 をまとめて更新する案
- 影響: React 19 固有の runtime/型変更と TypeScript 6 固有の compiler 変更を分離できる。次の major 更新は TypeScript 6 単独調査/更新 PR とする

- 日付: 2026-06-15
- 判断: TypeScript 6 は単独 PR で更新し、追加の機能変更は混ぜない
- 理由: React 19 と React Router 7 の更新が分離済みで、残る major は TypeScript のみだったため、compiler 更新だけを切り出すと原因切り分けが容易になる。`tsc --noEmit` と Vite build は追加修正なしで通過した
- 代替案: TypeScript 6 更新とあわせて型リファクタやテスト追加を行う案
- 影響: 依存 major 更新フェーズを小さく閉じられる。次の改善は依存更新ではなく、E2E カバレッジや運用導線の強化として別 PR で扱う
