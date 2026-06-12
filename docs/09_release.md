# リリース（Release）

公開・配布が必要な場合にのみ使う。

## バージョニング（例）
- `MAJOR.MINOR.PATCH`
  - MAJOR: 互換性が壊れる変更
  - MINOR: 後方互換の機能追加
  - PATCH: 後方互換の修正

## リリース手順（例）
1. CHANGELOG.md へ該当変更を記録する
2. セマンティックバージョンを決める
3. 必要なら Git タグ（`vX.Y.Z`）を付ける
4. 主要チェック項目（`docs/02_runbook.md`, `docs/03_status.md`, `docs/08_testing.md`）を最新にする
5. `check-and-build` を通過していることを確認する
6. 必要ならリリースノートを作成し、配布・デプロイする
