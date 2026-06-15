import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const lineDraftStorageKey = 'line-ops-ledger.line-drafts';
const historyFormDraftStorageKey = 'line-ops-ledger.history-form-draft';
const customActivityMemoTemplatesStorageKey = 'line-ops-ledger.custom-activity-memo-templates';
const pinnedActivityMemoTemplatesStorageKey = 'line-ops-ledger.pinned-activity-memo-templates';
const hiddenActivityMemoTemplatesStorageKey = 'line-ops-ledger.hidden-activity-memo-templates';
const collapsedActivityMemoSectionsStorageKey = 'line-ops-ledger.collapsed-activity-memo-sections';

const viewports = [
  { name: 'mobile', width: 360, height: 812 },
  { name: 'desktop', width: 1366, height: 768 },
] as const;

async function clearAllStorage(page: Page): Promise<void> {
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
}

async function openLineFormIfCollapsed(page: Page): Promise<void> {
  const openButton = page.getByRole('button', { name: 'フォームを開く' });
  if (await openButton.isVisible().catch(() => false)) {
    await openButton.click();
  }
}

async function createDraft(page: Page, lineName: string, phoneNumber: string): Promise<void> {
  await page.goto('/lines');
  await openLineFormIfCollapsed(page);

  await page.getByLabel('回線名 *').fill(lineName);
  await page.getByLabel('キャリア *').selectOption('NTTドコモ');
  await page.getByLabel('回線種別 *').selectOption('音声SIM');
  await page.getByLabel('契約状態 *').selectOption('利用中');
  await page.getByLabel('電話番号').fill(phoneNumber);

  await page.getByRole('button', { name: '保存する' }).click();
  await expect(page.locator('li', { hasText: lineName })).toBeVisible();
}

async function createHistoryEntry(page: Page, lineName: string, phoneNumber: string, memo: string): Promise<void> {
  const draftRow = page.locator('li', { hasText: lineName }).first();
  await draftRow.getByRole('button', { name: '活動を記録' }).click();

  await expect(page).toHaveURL(/\/lines\/history\?quickActivity=/);
  await expect(page.getByLabel('電話番号 *')).toHaveValue(phoneNumber);
  await page.getByLabel('契約開始日 *').fill('2025-01-01');
  await page.locator('article#history-form label:has-text("活動種別") select').selectOption('利用実績確認');
  await page.locator('article#history-form label:has-text("活動日") input').fill('2026-06-10');
  await page.locator('article#history-form label:has-text("活動メモ") textarea').fill(memo);

  await page.getByRole('button', { name: '履歴を保存する' }).click();
  await expect(page.getByText('契約履歴を保存しました。')).toBeVisible();
  await expect(page.locator('article#history-timeline')).toContainText(memo);
}

async function loadSampleDataFromEmptyDashboard(page: Page): Promise<void> {
  await page.goto('/');
  await clearAllStorage(page);
  await page.reload();

  await expect(page.getByText('最初の1件を登録する')).toBeVisible();
  await page.getByRole('button', { name: '確認用サンプルデータを読み込む' }).click();
  await expect(page.getByText(/確認用サンプルデータを読み込みました/)).toBeVisible();
}

async function enableNotificationSettings(page: Page): Promise<void> {
  await page.goto('/settings/notifications');
  await page.getByLabel('通知を使うか').selectOption('enabled');
  await page.getByLabel('通知対象の期限').selectOption('within-7-days');
  await page.getByLabel('再通知の扱い').selectOption('on-app-launch');
  await page.getByLabel('活動後の次回確認日サジェスト（日数）').fill('21');
}

for (const viewport of viewports) {
  test.describe(`core flow (${viewport.name})`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test('line + history CRUD path', async ({ page }) => {
      await page.goto('/');
      await clearAllStorage(page);

      const lineName = `E2E-${viewport.name}-${Date.now().toString().slice(-5)}`;
      const phoneNumber = '09011112222';
      const historyMemo = `導通確認-${Date.now().toString().slice(-5)}`;

      await createDraft(page, lineName, phoneNumber);

      await createHistoryEntry(page, lineName, phoneNumber, historyMemo);

      const timelineCard = page.locator('article#history-timeline .button-row.button-row--tight button', { hasText: '編集する' }).first();
      await timelineCard.click();
      const editedMemo = `${historyMemo}-updated`;
      await page.locator('article#history-form label:has-text("活動メモ") textarea').fill(editedMemo);
      await page.getByRole('button', { name: '履歴を更新する' }).click();
      await expect(page.getByText('契約履歴を更新しました。')).toBeVisible();
      await expect(page.locator('article#history-timeline')).toContainText(editedMemo);
      await page.reload();
      await expect(page.locator('article#history-timeline')).toContainText(editedMemo);

      await page
        .locator('article#history-timeline .button-row.button-row--tight button', { hasText: '削除する' })
        .first()
        .click();
      await expect(page.getByText('契約履歴を削除しました。')).toBeVisible();
      await expect(page.locator('article#history-timeline .detail-panel').filter({ hasText: editedMemo })).toHaveCount(0);

      await page.goto('/lines');
      await expect(page.locator('li', { hasText: lineName })).toBeVisible();
      const lineItem = page.locator('li', { hasText: lineName }).first();
      await lineItem.locator('input[type="checkbox"]').check();
      await page.getByRole('button', { name: '選択中を解約予定へ' }).click();
      await expect(page.getByText('1件の契約状態を更新しました。')).toBeVisible();
      await expect(lineItem.locator('.list__row')).toContainText('解約予定');
      await page.getByRole('button', { name: '操作を戻す' }).click();
      await expect(page.getByText('直前の操作（一括ステータス変更）を元に戻しました。')).toBeVisible();
      await expect(lineItem.locator('.list__row')).toContainText('利用中');
      await page.locator('li', { hasText: lineName }).first().locator('input[type="checkbox"]').check();
      await page.getByRole('button', { name: '選択中を削除' }).click();
      await expect(page.getByText('1件の回線を削除しました。')).toBeVisible();
      await expect(page.locator('li', { hasText: lineName })).toHaveCount(0);
      await page.getByRole('button', { name: '操作を戻す' }).click();
      await expect(page.getByText('直前の操作（一括削除）を元に戻しました。')).toBeVisible();
      await expect(page.locator('li', { hasText: lineName })).toBeVisible();
      await page.locator('li', { hasText: lineName }).first().getByRole('button', { name: '削除する' }).click();
      await expect(page.locator('li', { hasText: lineName })).toHaveCount(0);
    });

    test('history draft discard persistence path', async ({ page }) => {
      await page.goto('/');
      await clearAllStorage(page);

      const draftMemo = `未保存履歴下書き-${viewport.name}-${Date.now().toString().slice(-5)}`;

      await page.goto('/lines/history');
      await page.getByLabel('電話番号 *').fill('09033334444');
      await page.getByLabel('契約開始日 *').fill('2025-02-01');
      await page.locator('article#history-form label:has-text("活動種別") select').selectOption('利用実績確認');
      await page.locator('article#history-form label:has-text("活動日") input').fill('2026-06-11');
      await page.locator('article#history-form label:has-text("活動メモ") textarea').fill(draftMemo);
      await page.waitForFunction(
        ({ key, memo }) => window.localStorage.getItem(key)?.includes(memo) === true,
        { key: historyFormDraftStorageKey, memo: draftMemo },
      );

      await page.reload();
      await expect(page.getByText('前回の履歴入力下書きを復元しました。')).toBeVisible();
      await expect(page.locator('article#history-form label:has-text("活動メモ") textarea')).toHaveValue(draftMemo);

      await page.getByRole('button', { name: '破棄して新規入力' }).click();
      await expect(page.getByText('復元した履歴入力下書きを破棄し、新規入力に戻しました。')).toBeVisible();
      await expect(page.locator('article#history-form label:has-text("活動メモ") textarea')).toHaveValue('');
      await expect
        .poll(() => page.evaluate((key) => window.localStorage.getItem(key), historyFormDraftStorageKey))
        .toBeNull();

      await page.reload();
      await expect(page.getByText('前回の履歴入力下書きを復元しました。')).toHaveCount(0);
      await expect(page.locator('article#history-form label:has-text("活動メモ") textarea')).toHaveValue('');
      const afterReloadDraft = await page.evaluate((key) => window.localStorage.getItem(key), historyFormDraftStorageKey);
      expect(afterReloadDraft).toBeNull();
    });

    test('history draft reset and save cleanup path', async ({ page }) => {
      await page.goto('/');
      await clearAllStorage(page);

      const resetMemo = `リセット前下書き-${viewport.name}-${Date.now().toString().slice(-5)}`;
      const savedMemo = `保存後下書き削除-${viewport.name}-${Date.now().toString().slice(-5)}`;

      await page.goto('/lines/history');
      await page.getByLabel('電話番号 *').fill('09055556666');
      await page.getByLabel('キャリア *').fill('NTTドコモ');
      await page.getByLabel('契約開始日 *').fill('2025-03-01');
      await page.locator('article#history-form label:has-text("活動種別") select').selectOption('利用実績確認');
      await page.locator('article#history-form label:has-text("活動日") input').fill('2026-06-12');
      await page.locator('article#history-form label:has-text("活動メモ") textarea').fill(resetMemo);
      await page.waitForFunction(
        ({ key, memo }) => window.localStorage.getItem(key)?.includes(memo) === true,
        { key: historyFormDraftStorageKey, memo: resetMemo },
      );

      await page.getByRole('button', { name: '入力をリセット' }).click();
      await expect(page.locator('article#history-form label:has-text("活動メモ") textarea')).toHaveValue('');
      await expect
        .poll(() => page.evaluate((key) => window.localStorage.getItem(key), historyFormDraftStorageKey))
        .toBeNull();
      await page.reload();
      await expect(page.getByText('前回の履歴入力下書きを復元しました。')).toHaveCount(0);
      await expect(page.locator('article#history-form label:has-text("活動メモ") textarea')).toHaveValue('');

      await page.getByLabel('電話番号 *').fill('09055556666');
      await page.getByLabel('キャリア *').fill('NTTドコモ');
      await page.getByLabel('契約開始日 *').fill('2025-03-01');
      await page.locator('article#history-form label:has-text("活動種別") select').selectOption('利用実績確認');
      await page.locator('article#history-form label:has-text("活動日") input').fill('2026-06-12');
      await page.locator('article#history-form label:has-text("活動メモ") textarea').fill(savedMemo);
      await page.waitForFunction(
        ({ key, memo }) => window.localStorage.getItem(key)?.includes(memo) === true,
        { key: historyFormDraftStorageKey, memo: savedMemo },
      );

      await page.getByRole('button', { name: '履歴を保存する' }).click();
      await expect(page.getByText('契約履歴を保存しました。')).toBeVisible();
      await expect(page.locator('article#history-timeline')).toContainText(savedMemo);
      await expect
        .poll(() => page.evaluate((key) => window.localStorage.getItem(key), historyFormDraftStorageKey))
        .toBeNull();

      await page.reload();
      await expect(page.getByText('前回の履歴入力下書きを復元しました。')).toHaveCount(0);
      await expect(page.locator('article#history-timeline')).toContainText(savedMemo);
    });

    test('custom activity memo template persistence path', async ({ page }) => {
      await page.goto('/');
      await clearAllStorage(page);

      const customMemoTemplate = `追加候補-${viewport.name}-${Date.now().toString().slice(-5)}`;
      const historyForm = page.locator('article#history-form');

      await page.goto('/lines/history');
      await historyForm.locator('label:has-text("活動メモ") textarea').fill(customMemoTemplate);
      await historyForm.getByRole('button', { name: 'この文言を候補に追加' }).click();
      await expect(page.getByText(`活動メモ候補「${customMemoTemplate}」を追加しました。`)).toBeVisible();
      await page.waitForFunction(
        ({ key, memo }) => window.localStorage.getItem(key)?.includes(memo) === true,
        { key: customActivityMemoTemplatesStorageKey, memo: customMemoTemplate },
      );

      await page.getByRole('button', { name: '入力をリセット' }).click();
      await expect(historyForm.locator('label:has-text("活動メモ") textarea')).toHaveValue('');
      await expect
        .poll(() => page.evaluate((key) => window.localStorage.getItem(key), historyFormDraftStorageKey))
        .toBeNull();

      await page.reload();
      await expect(page.getByText('前回の履歴入力下書きを復元しました。')).toHaveCount(0);
      await expect(historyForm.getByText('追加した候補（1件）')).toBeVisible();
      await expect(historyForm.getByRole('button', { name: customMemoTemplate })).toBeVisible();
      const storedTemplates = await page.evaluate((key) => window.localStorage.getItem(key), customActivityMemoTemplatesStorageKey);
      expect(storedTemplates).toContain(customMemoTemplate);
    });

    test('activity memo template pin and hide persistence path', async ({ page }) => {
      await page.goto('/');
      await clearAllStorage(page);

      const customMemoTemplate = `候補管理-${viewport.name}-${Date.now().toString().slice(-5)}`;
      const historyForm = page.locator('article#history-form');

      await page.goto('/lines/history');
      await historyForm.locator('label:has-text("活動メモ") textarea').fill(customMemoTemplate);
      await historyForm.getByRole('button', { name: 'この文言を候補に追加' }).click();
      await expect(page.getByText(`活動メモ候補「${customMemoTemplate}」を追加しました。`)).toBeVisible();
      await historyForm
        .locator('.button-row.button-row--tight', { has: page.getByRole('button', { name: customMemoTemplate }) })
        .getByRole('button', { name: '固定' })
        .click();
      await expect(page.getByText(`活動メモ候補「${customMemoTemplate}」を固定しました。`)).toBeVisible();
      await page.waitForFunction(
        ({ key, memo }) => window.localStorage.getItem(key)?.includes(memo) === true,
        { key: pinnedActivityMemoTemplatesStorageKey, memo: customMemoTemplate },
      );

      await page.reload();
      await expect(historyForm.getByText('固定候補（1件）')).toBeVisible();
      await expect(historyForm.getByRole('button', { name: customMemoTemplate })).toBeVisible();
      await historyForm
        .locator('.button-row.button-row--tight', { has: page.getByRole('button', { name: customMemoTemplate }) })
        .getByRole('button', { name: '非表示' })
        .first()
        .click();
      await expect(page.getByText(`活動メモ候補「${customMemoTemplate}」を非表示にしました。`)).toBeVisible();
      await page.waitForFunction(
        ({ key, memo }) => window.localStorage.getItem(key)?.includes(memo) === true,
        { key: hiddenActivityMemoTemplatesStorageKey, memo: customMemoTemplate },
      );

      await page.reload();
      await expect(historyForm.getByText('非表示候補（1件）')).toBeVisible();
      await expect(historyForm.locator('.badge', { hasText: customMemoTemplate })).toBeVisible();
      await historyForm
        .locator('.button-row.button-row--tight', { hasText: customMemoTemplate })
        .getByRole('button', { name: '戻す' })
        .click();
      await expect(page.getByText(`活動メモ候補「${customMemoTemplate}」を表示に戻しました。`)).toBeVisible();
      await expect
        .poll(() => page.evaluate((key) => window.localStorage.getItem(key), hiddenActivityMemoTemplatesStorageKey))
        .toBe('[]');

      await page.reload();
      await expect(historyForm.getByText('非表示候補（1件）')).toHaveCount(0);
      await expect(historyForm.getByText('固定候補（1件）')).toBeVisible();
      await expect(historyForm.getByRole('button', { name: customMemoTemplate })).toBeVisible();
    });

    test('custom activity memo template update and reorder persistence path', async ({ page }) => {
      await page.goto('/');
      await clearAllStorage(page);

      const firstTemplate = `並び替えA-${viewport.name}-${Date.now().toString().slice(-5)}`;
      const secondTemplate = `並び替えB-${viewport.name}-${Date.now().toString().slice(-5)}`;
      const updatedSecondTemplate = `更新済みB-${viewport.name}-${Date.now().toString().slice(-5)}`;
      const historyForm = page.locator('article#history-form');

      await page.goto('/lines/history');
      await historyForm.locator('label:has-text("活動メモ") textarea').fill(firstTemplate);
      await historyForm.getByRole('button', { name: 'この文言を候補に追加' }).click();
      await expect(page.getByText(`活動メモ候補「${firstTemplate}」を追加しました。`)).toBeVisible();
      await historyForm.locator('label:has-text("活動メモ") textarea').fill(secondTemplate);
      await historyForm.getByRole('button', { name: 'この文言を候補に追加' }).click();
      await expect(page.getByText(`活動メモ候補「${secondTemplate}」を追加しました。`)).toBeVisible();

      await historyForm
        .locator('.button-row.button-row--tight', { has: page.getByRole('button', { name: firstTemplate }) })
        .getByRole('button', { name: '上へ' })
        .click();
      await expect(page.getByText(`活動メモ候補「${firstTemplate}」を上へ移動しました。`)).toBeVisible();
      await page.waitForFunction(
        ({ key, first, second }) => {
          const raw = window.localStorage.getItem(key);
          if (!raw) {
            return false;
          }

          try {
            return JSON.stringify(JSON.parse(raw)) === JSON.stringify([first, second]);
          } catch {
            return false;
          }
        },
        { key: customActivityMemoTemplatesStorageKey, first: firstTemplate, second: secondTemplate },
      );

      await historyForm.locator('label:has-text("活動メモ") textarea').fill(updatedSecondTemplate);
      await historyForm
        .locator('.button-row.button-row--tight', { has: page.getByRole('button', { name: secondTemplate }) })
        .getByRole('button', { name: '現在の文言で更新' })
        .click();
      await expect(page.getByText(`活動メモ候補「${secondTemplate}」を「${updatedSecondTemplate}」に更新しました。`)).toBeVisible();
      await page.waitForFunction(
        ({ key, first, second }) => {
          const raw = window.localStorage.getItem(key);
          if (!raw) {
            return false;
          }

          try {
            return JSON.stringify(JSON.parse(raw)) === JSON.stringify([first, second]);
          } catch {
            return false;
          }
        },
        { key: customActivityMemoTemplatesStorageKey, first: firstTemplate, second: updatedSecondTemplate },
      );

      await page.reload();
      await expect(historyForm.getByText('追加した候補（2件）')).toBeVisible();
      await expect(historyForm.getByRole('button', { name: firstTemplate })).toBeVisible();
      await expect(historyForm.getByRole('button', { name: updatedSecondTemplate })).toBeVisible();
      await expect(historyForm.getByRole('button', { name: secondTemplate })).toHaveCount(0);
      const storedTemplates = await page.evaluate((key) => window.localStorage.getItem(key), customActivityMemoTemplatesStorageKey);
      expect(storedTemplates).toBe(JSON.stringify([firstTemplate, updatedSecondTemplate]));
    });

    test('activity memo section collapse persistence path', async ({ page }) => {
      await page.goto('/');
      await clearAllStorage(page);

      const customMemoTemplate = `折りたたみ候補-${viewport.name}-${Date.now().toString().slice(-5)}`;
      const historyForm = page.locator('article#history-form');

      await page.goto('/lines/history');
      await historyForm.locator('label:has-text("活動メモ") textarea').fill(customMemoTemplate);
      await historyForm.getByRole('button', { name: 'この文言を候補に追加' }).click();
      await expect(page.getByText(`活動メモ候補「${customMemoTemplate}」を追加しました。`)).toBeVisible();
      await expect(historyForm.getByText('追加した候補（1件）')).toBeVisible();
      await expect(historyForm.getByRole('button', { name: customMemoTemplate })).toBeVisible();

      await historyForm
        .locator('.button-row.button-row--tight', { hasText: '追加した候補（1件）' })
        .getByRole('button', { name: '折りたたむ' })
        .click();
      await page.waitForFunction(
        ({ key }) => window.localStorage.getItem(key) === JSON.stringify(['custom']),
        { key: collapsedActivityMemoSectionsStorageKey },
      );
      await expect(historyForm.getByRole('button', { name: customMemoTemplate })).toHaveCount(0);
      await expect(historyForm.locator('.button-row.button-row--tight', { hasText: '追加した候補（1件）' }).getByRole('button', { name: '展開' })).toBeVisible();

      await page.reload();
      await expect(historyForm.getByText('追加した候補（1件）')).toBeVisible();
      await expect(historyForm.getByRole('button', { name: customMemoTemplate })).toHaveCount(0);
      await historyForm
        .locator('.button-row.button-row--tight', { hasText: '追加した候補（1件）' })
        .getByRole('button', { name: '展開' })
        .click();
      await expect(historyForm.getByRole('button', { name: customMemoTemplate })).toBeVisible();
      await expect
        .poll(() => page.evaluate((key) => window.localStorage.getItem(key), collapsedActivityMemoSectionsStorageKey))
        .toBe('[]');
    });

    test('settings flows', async ({ page }) => {
      await page.goto('/');
      await clearAllStorage(page);

      const lineName = `E2E-${viewport.name}-SET-${Date.now().toString().slice(-5)}`;
      const phoneNumber = '09099998888';
      const historyMemo = `バックアップ復元確認-${Date.now().toString().slice(-5)}`;
      const backupCustomMemoTemplate = `バックアップ候補-${viewport.name}-${Date.now().toString().slice(-5)}`;
      const backupHiddenMemoTemplate = `非表示候補-${viewport.name}-${Date.now().toString().slice(-5)}`;
      const backupDir = '/tmp/line-ops-ledger-e2e';
      const backupPath = path.join(backupDir, `backup-${viewport.name}-${Date.now()}.json`);
      const invalidBackupPath = path.join(backupDir, `invalid-backup-${viewport.name}-${Date.now()}.json`);

      await createDraft(page, lineName, phoneNumber);
      await createHistoryEntry(page, lineName, phoneNumber, historyMemo);

      await page.goto('/settings/activity-types');
      const customType = `カスタム-${Date.now().toString().slice(-5)}`;
      await page.getByPlaceholder('例: データ速度確認').fill(customType);
      await page.getByRole('button', { name: '追加する' }).click();
      await expect(page.locator('ul.list li', { hasText: customType })).toBeVisible();
      await page.reload();
      await expect(page.locator('ul.list li', { hasText: customType })).toBeVisible();
      await page.locator('ul.list li', { hasText: customType }).getByRole('button', { name: '削除' }).click();
      await expect(page.getByText(customType)).toHaveCount(0);

      await page.goto('/settings/notifications');
      await enableNotificationSettings(page);

      await expect(page.getByLabel('通知を使うか')).toHaveValue('enabled');
      await expect(page.getByLabel('通知対象の期限')).toHaveValue('within-7-days');
      await expect(page.getByLabel('再通知の扱い')).toHaveValue('on-app-launch');
      await expect(page.getByLabel('活動後の次回確認日サジェスト（日数）')).toHaveValue('21');
      await page.reload();
      await expect(page.getByLabel('通知を使うか')).toHaveValue('enabled');
      await expect(page.getByLabel('通知対象の期限')).toHaveValue('within-7-days');
      await expect(page.getByLabel('再通知の扱い')).toHaveValue('on-app-launch');
      await expect(page.getByLabel('活動後の次回確認日サジェスト（日数）')).toHaveValue('21');

      await page.evaluate(
        ({ customKey, pinnedKey, hiddenKey, collapsedKey, customMemo, hiddenMemo }) => {
          window.localStorage.setItem(customKey, JSON.stringify([customMemo]));
          window.localStorage.setItem(pinnedKey, JSON.stringify([customMemo]));
          window.localStorage.setItem(hiddenKey, JSON.stringify([hiddenMemo]));
          window.localStorage.setItem(collapsedKey, JSON.stringify(['custom']));
        },
        {
          customKey: customActivityMemoTemplatesStorageKey,
          pinnedKey: pinnedActivityMemoTemplatesStorageKey,
          hiddenKey: hiddenActivityMemoTemplatesStorageKey,
          collapsedKey: collapsedActivityMemoSectionsStorageKey,
          customMemo: backupCustomMemoTemplate,
          hiddenMemo: backupHiddenMemoTemplate,
        },
      );
      await page.goto('/settings/backup');
      fs.mkdirSync(backupDir, { recursive: true });
      const downloadPromise = page.waitForEvent('download');
      await Promise.all([
        downloadPromise,
        page.getByRole('button', { name: 'バックアップをエクスポート' }).click(),
      ]);
      const download = await downloadPromise;
      await download.saveAs(backupPath);
      expect(fs.existsSync(backupPath)).toBe(true);
      expect(fs.statSync(backupPath).size).toBeGreaterThan(20);
      const exportedBackup = JSON.parse(fs.readFileSync(backupPath, 'utf8')) as {
        activityMemoPreferences?: {
          customTemplates?: string[];
          pinnedTemplates?: string[];
          hiddenTemplates?: string[];
          collapsedSections?: string[];
        };
      };
      expect(exportedBackup.activityMemoPreferences?.customTemplates).toEqual([backupCustomMemoTemplate]);
      expect(exportedBackup.activityMemoPreferences?.pinnedTemplates).toEqual([backupCustomMemoTemplate]);
      expect(exportedBackup.activityMemoPreferences?.hiddenTemplates).toEqual([backupHiddenMemoTemplate]);
      expect(exportedBackup.activityMemoPreferences?.collapsedSections).toEqual(['custom']);

      fs.writeFileSync(invalidBackupPath, '{}', 'utf8');
      await page.getByRole('button', { name: 'バックアップを復元' }).click();
      await page.locator('input.hidden-file-input').setInputFiles(invalidBackupPath);
      await expect(page.getByText('JSON バックアップの形式が不正です。')).toBeVisible();

      await clearAllStorage(page);
      await page.getByRole('button', { name: 'バックアップを復元' }).click();
      await page.locator('input.hidden-file-input').setInputFiles(backupPath);
      await expect(page.getByText('統合バックアップを復元しました（主台帳 1 件 / 履歴 1 件 / 活動メモ候補設定）。')).toBeVisible();
      await expect
        .poll(() => page.evaluate((key) => window.localStorage.getItem(key), customActivityMemoTemplatesStorageKey))
        .toBe(JSON.stringify([backupCustomMemoTemplate]));
      await expect
        .poll(() => page.evaluate((key) => window.localStorage.getItem(key), pinnedActivityMemoTemplatesStorageKey))
        .toBe(JSON.stringify([backupCustomMemoTemplate]));
      await expect
        .poll(() => page.evaluate((key) => window.localStorage.getItem(key), hiddenActivityMemoTemplatesStorageKey))
        .toBe(JSON.stringify([backupHiddenMemoTemplate]));
      await expect
        .poll(() => page.evaluate((key) => window.localStorage.getItem(key), collapsedActivityMemoSectionsStorageKey))
        .toBe(JSON.stringify(['custom']));
      await page.waitForFunction(
        ({ key, name }) => {
          const raw = window.localStorage.getItem(key);
          if (!raw) {
            return false;
          }

          try {
            const parsed = JSON.parse(raw) as unknown;
            if (!parsed || typeof parsed !== 'object') {
              return false;
            }
            const envelope = parsed as { items?: unknown };
            const items = Array.isArray(envelope.items)
              ? envelope.items
              : Array.isArray(parsed)
                ? parsed
                : [];
            return items.some((item) => typeof item === 'object' && item !== null && item !== undefined && 'lineName' in item && (item as { lineName?: string }).lineName === name);
          } catch {
            return false;
          }
        },
        { key: lineDraftStorageKey, name: lineName },
      );

      await page.goto('/lines');
      await expect(page.getByText(lineName)).toBeVisible();
      const restoredMemo = `復元後編集-${Date.now().toString().slice(-5)}`;
      await page.locator('li', { hasText: lineName }).first().getByRole('button', { name: '編集する' }).click();
      await page.locator('form label:has-text("メモ") textarea').fill(restoredMemo);
      await page.getByRole('button', { name: '更新する' }).click();
      await expect(page.getByText('回線を更新しました。')).toBeVisible();
      await page.reload();
      await page.locator('li', { hasText: lineName }).first().getByRole('button', { name: '詳細を開く' }).click();
      await expect(page.locator('li', { hasText: lineName })).toContainText(restoredMemo);
      await page.goto('/lines/history');
      await expect(page.locator('article#history-timeline')).toContainText(historyMemo);
      await expect(page.locator('article#history-timeline')).toContainText('090-****-8888');
      const restoredHistoryMemo = `${historyMemo}-restored-edit`;
      await page.locator('article#history-timeline .button-row.button-row--tight button', { hasText: '編集する' }).first().click();
      await page.locator('article#history-form label:has-text("活動メモ") textarea').fill(restoredHistoryMemo);
      await page.getByRole('button', { name: '履歴を更新する' }).click();
      await expect(page.getByText('契約履歴を更新しました。')).toBeVisible();
      await page.reload();
      await expect(page.locator('article#history-timeline')).toContainText(restoredHistoryMemo);

      await page.goto('/lines');
      await page.locator('li', { hasText: lineName }).first().getByRole('button', { name: '削除する' }).click();
      await expect(page.locator('li', { hasText: lineName })).toHaveCount(0);
    });

    test('sample data dashboard path', async ({ page }) => {
      await loadSampleDataFromEmptyDashboard(page);

      const summaryKpi = page.locator('section[aria-label="Summary KPI"]');
      const hoppingHealth = page.locator('section[aria-label="Hopping Health"]');
      const actionableAlerts = page.locator('section[aria-label="Actionable Alerts"]');

      await expect(summaryKpi).toBeVisible();
      await expect(hoppingHealth).toBeVisible();
      await expect(actionableAlerts).toBeVisible();
      await expect(summaryKpi.locator('.dashboard-kpi-card__label', { hasText: 'Danger Alerts' })).toBeVisible();
      await expect(actionableAlerts.locator('.badge--danger', { hasText: 'Critical' }).first()).toBeVisible();

      await actionableAlerts.locator('a', { hasText: '履歴で記録' }).first().click();
      await expect(page).toHaveURL(/\/lines\/history\?.*historyIntent=/);
      await expect(page.locator('h3:has-text("開いている文脈")')).toBeVisible();
    });

    test('sample data lines drilldown path', async ({ page }) => {
      await loadSampleDataFromEmptyDashboard(page);

      await page.getByRole('link', { name: '利用実績を確認' }).click();
      await expect(page).toHaveURL(/\/lines\?.*sort=latestActivityAsc.*contractActiveOnly=true/);
      await expect(page.getByRole('button', { name: '契約中のみ: ON' })).toBeVisible();

      await page.goto('/lines?openDraft=d-003&focusSection=benefits');
      await expect(page.locator('#draft-d-003-benefits')).toBeVisible();
      await expect(page.locator('#draft-d-003-benefits').getByRole('heading', { name: '特典 / キャッシュバック' })).toBeVisible();

      await page.goto('/lines?openDraft=d-005&focusSection=fiber');
      await expect(page.locator('#draft-d-005-fiber')).toBeVisible();
      await expect(page.getByText('光回線の移行種別')).toBeVisible();

      await page.goto('/lines?sort=latestActivityAsc&contractActiveOnly=true&usagePriority=sms');
      await expect(page).toHaveURL(/\/lines\?.*contractActiveOnly=true.*usagePriority=sms/);
      await expect(page.getByRole('button', { name: '契約中のみ: ON' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'S不足優先: ON' })).toBeVisible();
      await expect(page.locator('.list__item--priority .badge--info').first()).toBeVisible();
    });

    test('sample data visible bulk selection path', async ({ page }) => {
      await loadSampleDataFromEmptyDashboard(page);

      await page.goto('/lines?sort=latestActivityAsc&contractActiveOnly=true&usagePriority=sms');
      await expect(page).toHaveURL(/\/lines\?.*contractActiveOnly=true.*usagePriority=sms/);
      await expect(page.getByRole('button', { name: '契約中のみ: ON' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'S不足優先: ON' })).toBeVisible();

      const visibleItems = page.locator('ul.list--drafts > li');
      const visibleCount = await visibleItems.count();
      expect(visibleCount).toBeGreaterThan(0);
      await expect(visibleItems.first()).toBeVisible();

      await page.getByRole('button', { name: '表示中をすべて選択' }).click();
      await expect(page.getByRole('button', { name: '表示中の選択を解除' })).toBeVisible();
      await expect(page.locator('ul.list--drafts > li.list__item--selected')).toHaveCount(visibleCount);
      for (let index = 0; index < visibleCount; index += 1) {
        await expect(visibleItems.nth(index).locator('input[type="checkbox"]')).toBeChecked();
      }

      await page.getByRole('button', { name: '表示中の選択を解除' }).click();
      await expect(page.getByRole('button', { name: '表示中をすべて選択' })).toBeVisible();
      await expect(page.locator('ul.list--drafts > li.list__item--selected')).toHaveCount(0);
      for (let index = 0; index < visibleCount; index += 1) {
        await expect(visibleItems.nth(index).locator('input[type="checkbox"]')).not.toBeChecked();
      }
    });

    test('sample data notification filter path', async ({ page }) => {
      await loadSampleDataFromEmptyDashboard(page);
      await enableNotificationSettings(page);

      await page.goto('/lines?notificationTargetOnly=true&notificationReason=overdue');
      await expect(page).toHaveURL(/\/lines\?.*notificationTargetOnly=true.*notificationReason=overdue/);
      await expect(page.getByRole('button', { name: '通知対象のみ: ON' })).toBeVisible();
      await expect(page.getByRole('button', { name: /期限超過 \d+/ })).toHaveClass(/button--primary/);
      await expect(page.locator('li', { hasText: '通知理由: 期限超過' }).first()).toBeVisible();
    });
  });
}
