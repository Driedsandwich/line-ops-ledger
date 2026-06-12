import { test, expect, type Page } from '@playwright/test';

const routes = ['/', '/lines', '/lines/history', '/settings/storage', '/settings/backup', '/settings/notifications', '/settings/activity-types'];
const navLinks = ['/', '/lines', '/lines/history', '/settings/storage', '/settings/backup', '/settings/notifications', '/settings/activity-types'];
const draftStorageKey = 'line-ops-ledger.line-drafts';
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

test('history deep link with quickActivity seeds history context and phone input', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 812 });
  await page.goto('/');
  await seedDraftLocalStorage(page);

  await page.goto('/lines/history?quickActivity=090-1111-2222', { waitUntil: 'domcontentloaded' });

  await expect(page.locator('h3:has-text("開いている文脈")')).toBeVisible();
  await expect(page.locator('input[placeholder="例: 09012345678"]')).toHaveValue('09011112222');
});

test('history deep link with unformatted stored phone still normalizes against formatted quickActivity', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 812 });
  await page.goto('/');
  await seedDraftLocalStorageWithPhoneFormats(page, '09011112222');

  await page.goto('/lines/history?quickActivity=090-1111-2222', { waitUntil: 'domcontentloaded' });

  await expect(page.locator('h3:has-text("開いている文脈")')).toBeVisible();
  await expect(page.locator('input[placeholder="例: 09012345678"]')).toHaveValue('09011112222');
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
