import { test, expect, type Page } from '@playwright/test';

const routes = ['/', '/lines', '/lines/history', '/settings/storage', '/settings/backup', '/settings/notifications', '/settings/activity-types'];
const navLinks = ['/', '/lines', '/lines/history', '/settings/storage', '/settings/backup', '/settings/notifications', '/settings/activity-types'];
const draftStorageKey = 'line-ops-ledger.line-drafts';
const historyStorageKey = 'line-ops-ledger.line-history';
const notificationSettingsStorageKey = 'line-ops-ledger.notification-settings';
const themeStorageKey = 'line-ops-ledger.ui-theme';
const sidebarStorageKey = 'line-ops-ledger.sidebar-collapsed';
const seededDraftSeed = [
  {
    id: 'draft-test-1',
    lineName: '導線テスト回線',
    carrier: 'docomo',
    phoneNumber: '090-1111-2222',
    status: '利用中',
  },
];
const intentHistoryMatrix = [
  { intent: 'plannedAction', label: '今後のアクション' },
  { intent: 'contractEnd', label: '契約終了' },
  { intent: 'mnpDeadline', label: 'MNP期限' },
  { intent: 'freeOptionDeadline', label: '無料オプション期限' },
  { intent: 'benefitDeadline', label: '特典期限' },
  { intent: 'fiberDebt', label: '光回線残債' },
  { intent: 'notificationTarget', label: '次回確認日' },
  { intent: 'usageShortage', label: '利用実績不足' },
  { intent: 'inactiveLine', label: '長期未活動' },
];

async function seedDraftLocalStorage(page: Page) {
  await page.evaluate(
    ({ key, value }) => {
      window.localStorage.setItem(key, JSON.stringify(value));
    },
    { key: draftStorageKey, value: seededDraftSeed },
  );
}

async function clearDraftLocalStorage(page: Page) {
  await page.evaluate((key) => {
    window.localStorage.removeItem(key);
  }, draftStorageKey);
}

async function seedDraftLocalStorageWithPhoneFormats(page: Page, phoneNumber: string) {
  await page.evaluate(
    ({ key, value }) => {
      window.localStorage.setItem(key, JSON.stringify(value));
    },
    {
      key: draftStorageKey,
      value: [
        {
          id: 'draft-test-1',
          lineName: '導線テスト回線',
          carrier: 'docomo',
          phoneNumber,
          status: '利用中',
        },
      ],
    },
  );
}

for (const route of routes) {
  test(`side panel reachable on ${route} (360x812)`, async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 812 });
    await page.goto(route, { waitUntil: 'domcontentloaded' });

    await expect(page.locator('#side-nav-メイン')).toBeVisible();
    await expect(page.locator('#side-nav-履歴')).toBeVisible();
    await expect(page.locator('#side-nav-設定')).toBeVisible();

    for (const href of navLinks) {
      const anchor = page.locator(`nav a[href="${href}"]`).first();
      await expect(anchor, `missing link ${href}`).toBeAttached();
      await anchor.scrollIntoViewIfNeeded();
      await expect(anchor).toBeVisible();

      if (route === href) {
        await expect(anchor).toHaveClass(/nav__item--active/);
      }

      if (route !== href) {
        await anchor.click();
        const path = new URL(page.url()).pathname;
        expect(path).toBe(href);

        const clicked = page.locator(`nav a[href="${href}"]`).first();
        await expect(clicked).toHaveClass(/nav__item--active/);
      }

      await expect(page.locator('main')).toBeVisible();

      if (route !== href) {
        await page.goto(route, { waitUntil: 'domcontentloaded' });
      }
    }
  });
}

test('display theme, collapsible sidebar, and lines filter toggles remain usable', async ({ page }) => {
  await page.addInitScript(
    ({ themeKey, sidebarKey }) => {
      if (window.sessionStorage.getItem('display-controls-test-initialized') === 'true') {
        return;
      }

      window.localStorage.setItem(themeKey, 'light');
      window.localStorage.removeItem(sidebarKey);
      window.sessionStorage.setItem('display-controls-test-initialized', 'true');
    },
    { themeKey: themeStorageKey, sidebarKey: sidebarStorageKey },
  );
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/lines', { waitUntil: 'domcontentloaded' });

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('button', { name: 'ダーク表示' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect.poll(() => page.evaluate((key) => window.localStorage.getItem(key), themeStorageKey)).toBe('dark');

  await page.getByRole('button', { name: 'ライト表示' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

  const navItemHeights = await page.locator('.nav__item').evaluateAll((items) => items.map((item) => item.getBoundingClientRect().height));
  expect(Math.max(...navItemHeights)).toBeLessThanOrEqual(48);

  await page.getByRole('button', { name: 'ナビを閉じる' }).click();
  await expect(page.getByRole('button', { name: 'ナビを開く' })).toBeVisible();
  await expect(page.locator('.sidebar')).toBeHidden();
  await expect.poll(() => page.evaluate((key) => window.localStorage.getItem(key), sidebarStorageKey)).toBe('true');

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('button', { name: 'ナビを開く' })).toBeVisible();
  await expect(page.locator('.sidebar')).toBeHidden();

  await page.getByRole('button', { name: 'ナビを開く' }).click();
  await expect(page.getByRole('navigation', { name: 'サイドナビゲーション' })).toBeVisible();

  const filterToggleGeometry = await page.locator('.filter-toggle-row').evaluate((container) => {
    const labels = Array.from(container.querySelectorAll('.checkbox-row--switch'));
    return labels.map((label) => {
      const input = label.querySelector('input[type="checkbox"]');
      const labelRect = label.getBoundingClientRect();
      const inputRect = input?.getBoundingClientRect();

      return {
        labelHeight: labelRect.height,
        labelTop: labelRect.top,
        inputCenterOffset: inputRect ? Math.abs((inputRect.top + inputRect.height / 2) - (labelRect.top + labelRect.height / 2)) : null,
      };
    });
  });
  expect(filterToggleGeometry).toHaveLength(2);
  for (const geometry of filterToggleGeometry) {
    expect(geometry.labelHeight).toBeLessThanOrEqual(46);
    expect(geometry.inputCenterOffset).not.toBeNull();
    expect(geometry.inputCenterOffset ?? 99).toBeLessThanOrEqual(2);
  }
  expect(Math.abs(filterToggleGeometry[0].labelTop - filterToggleGeometry[1].labelTop)).toBeLessThanOrEqual(2);
});

test('history deep link with quickActivity seeds history context and phone input', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 812 });
  await page.goto('/');
  await seedDraftLocalStorage(page);

  await page.goto('/lines/history?quickActivity=090-1111-2222', { waitUntil: 'domcontentloaded' });

  await expect(page.locator('h3:has-text("開いている文脈")')).toBeVisible();
  await expect(page.locator('input[placeholder="例: 09012345678"]')).toHaveValue('09011112222');
});

test.describe('Asia/Tokyo local date boundary', () => {
  test.use({ timezoneId: 'Asia/Tokyo' });

  test('history deep link with quickActivity uses local date for activity date near midnight', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-06-09T15:30:00.000Z'));
    await page.setViewportSize({ width: 360, height: 812 });
    await page.goto('/');
    await seedDraftLocalStorage(page);

    await page.goto('/lines/history?quickActivity=090-1111-2222', { waitUntil: 'domcontentloaded' });

    await expect(page.locator('h3:has-text("開いている文脈")')).toBeVisible();
    await expect(page.locator('article#history-form label:has-text("活動日") input')).toHaveValue('2026-06-10');
  });

  test('received benefit without received date is normalized to local date near midnight', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-06-09T15:30:00.000Z'));
    await page.setViewportSize({ width: 360, height: 812 });
    await page.goto('/');
    await page.evaluate((key) => {
      window.localStorage.setItem(key, JSON.stringify([
        {
          id: 'draft-benefit-local-date',
          lineName: '特典受領日境界テスト',
          carrier: 'docomo',
          lineType: '音声SIM',
          status: '利用中',
          benefits: [
            {
              id: 'benefit-local-date',
              benefitType: '現金',
              amount: 16000,
              receivedFlag: true,
            },
          ],
        },
      ]));
    }, draftStorageKey);

    await page.goto('/lines', { waitUntil: 'domcontentloaded' });
    await page.locator('li', { hasText: '特典受領日境界テスト' }).first().getByRole('button', { name: '詳細を開く' }).click();

    await expect(page.locator('#draft-draft-benefit-local-date-benefits')).toContainText('受取日: 2026/06/10');
  });

  test('dashboard inactive line threshold uses local today near midnight', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-06-09T15:30:00.000Z'));
    await page.setViewportSize({ width: 360, height: 812 });
    await page.goto('/');
    await page.evaluate(
      ({ draftKey, historyKey }) => {
        window.localStorage.setItem(draftKey, JSON.stringify([
          {
            id: 'draft-dashboard-inactive-local-date',
            lineName: 'Dashboard未活動境界テスト',
            carrier: 'docomo',
            lineType: '音声SIM',
            phoneNumber: '090-3333-4444',
            status: '利用中',
          },
        ]));
        window.localStorage.setItem(historyKey, JSON.stringify([
          {
            id: 'history-dashboard-inactive-local-date',
            phoneNumber: '090-3333-4444',
            carrier: 'docomo',
            status: '利用中',
            contractStartDate: '2025-01-01',
            activityLogs: [
              {
                id: 'activity-dashboard-inactive-local-date',
                activityDate: '2026-03-12',
                activityType: '通信実施',
                activityMemo: '90日前境界',
              },
            ],
          },
        ]));
      },
      { draftKey: draftStorageKey, historyKey: historyStorageKey },
    );

    await page.goto('/', { waitUntil: 'domcontentloaded' });

    await expect(page.locator('.dashboard-ring-card', { hasText: '実績不足' })).toContainText('未活動あり');
    await expect(page.locator('.dashboard-ring-card', { hasText: '実績不足' })).toContainText('1/1件');
  });
});

test('history deep link with unformatted stored phone still normalizes against formatted quickActivity', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 812 });
  await page.goto('/');
  await seedDraftLocalStorageWithPhoneFormats(page, '09011112222');

  await page.goto('/lines/history?quickActivity=090-1111-2222', { waitUntil: 'domcontentloaded' });

  await expect(page.locator('h3:has-text("開いている文脈")')).toBeVisible();
  await expect(page.locator('input[placeholder="例: 09012345678"]')).toHaveValue('09011112222');
});

test('lines with invalid notificationReason keeps notification target filter as all reasons', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 812 });
  await page.goto('/');
  await page.evaluate(
    ({ draftKey, settingsKey }) => {
      window.localStorage.setItem(draftKey, JSON.stringify([
        {
          id: 'draft-invalid-notification-reason',
          lineName: '通知理由不正query境界テスト',
          carrier: 'docomo',
          lineType: '音声SIM',
          status: '利用中',
          nextReviewDate: '2026-01-01',
        },
      ]));
      window.localStorage.setItem(settingsKey, JSON.stringify({
        enabled: true,
        reminderWindow: 'within-7-days',
        relaunchPolicy: 'on-app-launch',
        reviewIntervalDays: 30,
      }));
    },
    { draftKey: draftStorageKey, settingsKey: notificationSettingsStorageKey },
  );

  await page.goto('/lines?notificationTargetOnly=true&notificationReason=invalid', { waitUntil: 'domcontentloaded' });

  await expect(page.getByRole('button', { name: '通知対象のみ: ON' })).toBeVisible();
  await expect(page.getByRole('button', { name: '通知対象合計 1' })).toHaveClass(/button--primary/);
  await expect(page.getByRole('button', { name: '期限超過 1' })).not.toHaveClass(/button--primary/);
  await expect(page.locator('li', { hasText: '通知理由不正query境界テスト' })).toContainText('通知理由: 期限超過');
});

test('history deep link with quickActivity + historyIntent shows context label', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 812 });
  await page.goto('/');
  await seedDraftLocalStorage(page);

  await page.goto('/lines/history?quickActivity=090-1111-2222&historyIntent=safeExit', { waitUntil: 'domcontentloaded' });

  await expect(page.locator('h3:has-text("開いている文脈")')).toBeVisible();
  await expect(
    page.locator('h3:has-text("開いている文脈")')
      .locator('..')
      .locator('span.badge', { hasText: '解約可能推奨日' }),
  ).toBeVisible();
  await expect(page.locator('input[placeholder="例: 09012345678"]')).toHaveValue('09011112222');
});

for (const item of intentHistoryMatrix) {
  test(`history deep link with quickActivity + historyIntent=${item.intent} shows intent label`, async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 812 });
    await page.goto('/');
    await seedDraftLocalStorage(page);

    await page.goto(`/lines/history?quickActivity=090-1111-2222&historyIntent=${item.intent}`, { waitUntil: 'domcontentloaded' });

    await expect(page.locator('h3:has-text("開いている文脈")')).toBeVisible();
    await expect(
      page
        .locator('h3:has-text("開いている文脈")')
        .locator('..')
        .locator('span.badge', { hasText: item.label }),
    ).toBeVisible();
    await expect(page.locator('input[placeholder="例: 09012345678"]')).toHaveValue('09011112222');
  });
}

test('history deep link with unknown quickActivity and historyIntent keeps context with empty draft form', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 812 });
  await page.goto('/');
  await clearDraftLocalStorage(page);

  await page.goto('/lines/history?quickActivity=090-9999-0000&historyIntent=plannedAction', { waitUntil: 'domcontentloaded' });

  await expect(page.locator('h3:has-text("開いている文脈")')).toBeVisible();
  await expect(page.locator('input[placeholder="例: 09012345678"]')).toHaveValue('');
  await expect(
    page
      .locator('h3:has-text("開いている文脈")')
      .locator('..')
      .locator('span.badge', { hasText: '今後のアクション' }),
  ).toBeVisible();
});

test('history deep link with invalid historyIntent falls back to default context label', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 812 });
  await page.goto('/');
  await seedDraftLocalStorage(page);

  await page.goto('/lines/history?quickActivity=090-1111-2222&historyIntent=invalidValue', { waitUntil: 'domcontentloaded' });

  await expect(page.locator('h3:has-text("開いている文脈")')).toBeVisible();
  await expect(
    page
      .locator('h3:has-text("開いている文脈")')
      .locator('..')
      .locator('span.badge', { hasText: '履歴記録' }),
  ).toBeVisible();
  await expect(page.locator('input[placeholder="例: 09012345678"]')).toHaveValue('09011112222');
});

test('history deep link with unknown quickActivity and no historyIntent does not show context card', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 812 });
  await page.goto('/');
  await clearDraftLocalStorage(page);

  await page.goto('/lines/history?quickActivity=090-9999-0000', { waitUntil: 'domcontentloaded' });

  await expect(page.locator('h3:has-text("開いている文脈")')).toHaveCount(0);
  await expect(page.locator('input[placeholder="例: 09012345678"]')).toHaveValue('');
});

test('history deep link with historyIntent only shows context without phone preset', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 812 });
  await page.goto('/');

  await page.goto('/lines/history?historyIntent=usageShortage', { waitUntil: 'domcontentloaded' });

  await expect(page.locator('h3:has-text("開いている文脈")')).toBeVisible();
  await expect(
    page
      .locator('h3:has-text("開いている文脈")')
      .locator('..')
      .locator('span.badge', { hasText: '利用実績不足' }),
  ).toBeVisible();
  await expect(page.locator('input[placeholder="例: 09012345678"]')).toHaveValue('');
});

test('history deep link with malformed quickActivity falls back to intent-only context', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 812 });
  await page.goto('/');

  await page.goto('/lines/history?quickActivity=%20-%20&historyIntent=benefitDeadline', { waitUntil: 'domcontentloaded' });

  await expect(page.locator('h3:has-text("開いている文脈")')).toBeVisible();
  await expect(
    page
      .locator('h3:has-text("開いている文脈")')
      .locator('..')
      .locator('span.badge', { hasText: '特典期限' }),
  ).toBeVisible();
  await expect(page.locator('input[placeholder="例: 09012345678"]')).toHaveValue('');
});

test('history deep link with malformed quickActivity and no intent shows only empty context', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 812 });
  await page.goto('/');

  await page.goto('/lines/history?quickActivity=%20-%20', { waitUntil: 'domcontentloaded' });

  await expect(page.locator('h3:has-text("開いている文脈")')).toHaveCount(0);
  await expect(page.locator('input[placeholder="例: 09012345678"]')).toHaveValue('');
});

test('history deep link with unknown quickActivity and invalid historyIntent does not show context card', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 812 });
  await page.goto('/');
  await clearDraftLocalStorage(page);

  await page.goto('/lines/history?quickActivity=090-9999-0000&historyIntent=invalidValue', { waitUntil: 'domcontentloaded' });

  await expect(page.locator('h3:has-text("開いている文脈")')).toHaveCount(0);
  await expect(page.locator('input[placeholder="例: 09012345678"]')).toHaveValue('');
});

test('history deep link with spaced quickActivity normalizes to digits and seeds phone input', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 812 });
  await page.goto('/');
  await seedDraftLocalStorage(page);

  await page.goto('/lines/history?quickActivity=090%201111%202222', { waitUntil: 'domcontentloaded' });

  await expect(page.locator('h3:has-text("開いている文脈")')).toBeVisible();
  await expect(page.locator('input[placeholder="例: 09012345678"]')).toHaveValue('09011112222');
});

test('history page without deep-link parameters does not show context card', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 812 });
  await page.goto('/lines/history');

  await expect(page.locator('h3:has-text("開いている文脈")')).toHaveCount(0);
  await expect(page.locator('input[placeholder="例: 09012345678"]')).toHaveValue('');
});

test('history page without deep-link parameters does not show context card even when draft exists', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 812 });
  await page.goto('/');
  await seedDraftLocalStorage(page);

  await page.goto('/lines/history');

  await expect(page.locator('h3:has-text("開いている文脈")')).toHaveCount(0);
  await expect(page.locator('input[placeholder="例: 09012345678"]')).toHaveValue('');
});
