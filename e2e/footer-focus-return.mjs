import { chromium, expect } from '@playwright/test';
import { installHistoryFixture } from './history-fixture.js';
const browser = await chromium.launch();
try {
    const page = await browser.newPage();
    await page.addInitScript(installHistoryFixture);
    await page.goto('http://127.0.0.1:5197');
    for (const face of ['maida2', 'rin', 'kamae']) {
        await page.locator(`[data-face="${face}"]`).click();
        for (const legal of ['accessibility', 'privacy', 'terms']) {
            const opener = page.locator(`[data-legal-page="${legal}"]`);
            await opener.click();
            await page.locator('.legal-page-back').click();
            await expect(opener).toBeFocused();
            await page.waitForTimeout(250);
            await expect(opener).toBeFocused();
        }
    }
    console.log('All nine footer legal-page journeys restore and retain opener focus');
} finally { await browser.close(); }
