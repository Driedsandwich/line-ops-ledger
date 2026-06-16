## 変更内容
- 変更概要:
- 変更対象:

## 検証
- [ ] `npm run check`
- [ ] `npm run build`
- [ ] `npm run test:sidepanel` または GitHub Actions `check-and-build`
- [ ] 該当時のみ: `npm run test:e2e`
- [ ] 該当時のみ: `npm audit --audit-level=low`
- [ ] 該当時のみ: `npm outdated --depth=0`

## 受け入れチェック
- [ ] 主要ルートの 200 応答（/ /lines /lines/history /settings/storage /settings/backup /settings/notifications /settings/activity-types）
- [ ] サイドパネル標準: `メイン / 履歴 / 設定` の見出しと配下リンクが重複なく表示される
- [ ] 低 viewport（スマホ想定）でサイドパネルが縦スクロール可能で、主要リンクへ到達できる
- [ ] docs / runbook / testing docs の更新要否を確認した

## Workflow Changes
- [ ] なし
- [ ] あり（内容と影響範囲を記載）

## リスクとロールバック
- 既知のリスク:
- リスク緩和:
- ロールバック:

## 追加情報
- 関連 PR/Issue:
