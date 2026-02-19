import { test, expect } from '@playwright/test';
import { injectAxe, checkA11y } from '@axe-core/playwright';

const url = 'https://reclameaqui-tst.obviostaging.com.br/reclamar/zppV3ACXY-sNoIYc/minha-historia/';

test.describe('Accessibility Audit', () => {
  test('Full Accessibility Check with Axe', async ({ page }) => {
    await page.goto(url);
    await injectAxe(page);
    await checkA11y(page, undefined, {
      detailedReport: true,
      detailedReportOptions: { html: true }
    });
  });

  // Additional specific checks can be added here
});