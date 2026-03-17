# Status

## 現在地
- private repo 作成済み
- Bootstrap Issue: #1
- Context Hub Issue: #2
- Merged PR: #3
- Merged PR: #5
- Merged PR: #7
- Merged PR: #9
- Issue #10 の実装として、保存データの versioned envelope 化と settings 可視化を追加中

## 次の3つ
1. Issue #10 の PR をレビュー可能な状態で作成する
2. 表示確認後、次Issueを「正式スキーマ整理と保存層の段階移行」に固定する
3. workflow 実行状況を見て required checks を最小構成で検討する

## 確認方法
- `/settings` で schema version、保存件数、最終更新時刻が見える
- `/lines` と `/` の既存機能が壊れていない
- リロード後も保存内容が残る
