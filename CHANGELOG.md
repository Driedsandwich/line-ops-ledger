# Changelog

## 1.0.14 (2026-06-10)
- Fix: `HistoryPage` の `quickActivity` 受け口を厳密化し、`quickActivity` が `090-1111-2222` のような整形済みでも `09011112222` の主台帳下書きと一致するよう、受け側の電話番号照合を正規化して統一
- Test: `tests/sidepanel-check.spec.ts` に「未整形ローカルストレージ番号照合ケース」を追加し、`npm run test:sidepanel` を 29 ケースで常設化
- Stability: `npm run test:sidepanel`, `npm run check`, `npm run build` を再実行

## 1.0.13 (2026-06-10)
- Chore: `test:sidepanel` スクリプトを追加し、`tests/sidepanel-check.spec.ts` で低 viewport 360x812 のサイドパネル到達性を常設化
- Chore: `playwright.config.ts` を追加し、`webServer`/`baseURL` を設定して `test:sidepanel` を単一コマンドで実行できるようにした
- Chore: `test-results/`, `playwright-report/`, `blob-report/` を `.gitignore` に追加し、Playwright 実行ログの誤混入を抑制
- Stability: `npm run check` / `npm run build` を再実行

## 1.0.12 (2026-06-10)
- Test tooling: `@playwright/test` を devDependencies へ追加し、低 viewport のサイドパネル到達確認を Playwright で自動実行可能にする準備を追加
- Verification: `npx playwright test .tmp-playwright/sidepanel-check.spec.mts --reporter=line` で 7ケース（`/`, `/lines`, `/lines/history`, `/settings/*`）を実機相当の 360x812 で確認

## 1.0.11 (2026-06-10)
- Chore: サイドパネル標準を `メイン / 履歴 / 設定` とし、低 viewport 到達性を回帰条件へ追加（`docs/08_testing.md`, `docs/02_runbook.md`）
- Chore: PR テンプレートを追加し、`check-and-build` / 主要ルート 200 / サイドパネル検証チェックを PR 前提へ明文化
- Stability: `npm run check` / `npm run build` を再実行

## 1.0.10 (2026-06-10)
- Chore: サイドパネル（左ナビ）を `メイン` / `履歴` / `設定` のセクション構造へ統一し、見出し+リンクで標準表示を明確化
- Stability: `npm run check` / `npm run build` / 主要ルート 200 応答を再確認

## 1.0.9 (2026-06-10)
- Security: `npm audit fix` を実施し、`picomatch` / `postcss` の high/moderate 脆弱性を解消
- Stability: `npm run check` / `npm run build` / `history` 手動リンク監査を再実行

## 1.0.8 (2026-06-10)
- Chore: 主要依存を `patch/minor` で更新（`@types/node` / `@types/react` / `@vitejs/plugin-react` / `vite` / `react-router-dom`）
- Stability: `npm run check` / `npm run build` を更新後に再実施

## 1.0.7 (2026-06-10)
- Chore: `Repo sanity` を `historyIntent` 付き `lines/history` 手動リンクでも検知するよう拡張
- Chore: `docs/08_testing.md` に主要導線（行為 / 履歴 / バックアップ）回帰観点を追加

## 1.0.6 (2026-06-10)
- Chore: `Repo sanity` に `quickActivity` 遷移の手動URL生成検知を追加し、手動 `/lines/history?quickActivity=...` の再発を PR 入口で防ぐ

## 1.0.5 (2026-06-10)
- Chore: `quickActivity` の生成を共通化し、`LinesPage` / `DashboardPage` / `HistoryPage` の導線を `buildHistoryLink` 経由で揃えて生成フォーマット差異を除去

## 1.0.4 (2026-06-10)
- Chore: `quickActivity` / `historyIntent` の遷移で電話番号を正規化して、記録導線の取り違え（記号付き番号の受け取り）に対する `Dashboard → History` 回帰を抑制

## 1.0.3 (2026-06-10)
- Chore: `tsc --build` / Vite ビルドで発生するローカル生成物（`*.tsbuildinfo`, `vite.config.js`, `vite.config.d.ts`）を `.gitignore` へ追加して `git` のノイズを抑制

## 1.0.2 (2026-06-10)
- Tuning: Repo sanity に「.env / .env.*」の tracked 監査を追加し、機密ファイル混入を早期検知

## 1.0.1 (2026-06-10)
- Tuning: Repo sanity の必須チェック対象を実運用ドキュメント（AGENTS/CLAUDE/docs/02〜09/prompts）へ拡張
- Tuning: bootstrap 運用で参照する docs/02_runbook と docs/03_status の存在チェックを明示

## 1.0.0 (2026-01-25)
- Tuning: Repo sanity で `.env` と `.env.*` が追跡されていないことを検知する（`.env.example` は除外）
- Tuning: Bug Issueテンプレに「機密情報を貼り付けない」注意書きを追加

## 0.2.4 (2026-01-25)
- Enhancement: Bootstrap Issueフォームに「制約（必須）」「非目的（任意）」「想定ユーザー（任意）」を追加（仮定での暴走を減らす）
- Enhancement: Bootstrap時は「最初のPRで docs を初期化して台帳を確定」することを 00_START_HERE / README / ルールに明文化
- Tuning: 中断時は prompts/40_stop.md に従うことをルール化
- Tuning: PRテンプレに「人間が見るポイント（非エンジニア向け）」を追加
- Tuning: docs/00_goal.md をテンプレ運用に合わせて整理（次の一手の記述を削除）

## 0.2.3 (2026-01-25)
- Enhancement: AIの初動を固定する 00_START_HERE.md を追加
- Enhancement: README/ルール/台帳を「AIのみがファイルを読む・書く」運用に合わせて明確化
- Enhancement: prompts/README.md を追加し、promptsをAI自己参照テンプレとして位置付け
- Tuning: docs/05_ai_log.md を1PR=1行〜数行の要約に簡略化（機密貼り付け防止）
- Tuning: Repo sanity に 00_START_HERE.md と prompts/README.md の存在チェックを追加

## 0.2.2 (2026-01-25)
- Enhancement: Repo sanity に prompts/40_stop.md の存在チェックを追加（中断手順の欠落を検知）

## 0.2.1 (2026-01-25)
- Fix: AGENTS.md と CLAUDE.md を同一内容にし、Repo sanity の同期チェックが通るようにした

## 0.2.0
- Initial scaffold
