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
