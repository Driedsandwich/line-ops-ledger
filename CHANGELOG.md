# Changelog

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
