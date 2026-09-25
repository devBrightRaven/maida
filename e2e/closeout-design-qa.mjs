import { chromium } from '@playwright/test';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
import { installHistoryFixture } from './history-fixture.js';

if (!process.env.BEACON_DESIGN_QA) throw new Error('Set BEACON_DESIGN_QA to the installed Beacon scripts/design-qa.mjs');
const { runDesignQa } = await import(pathToFileURL(process.env.BEACON_DESIGN_QA).href);
const baseUrl = process.env.MAIDA_TEST_URL || 'http://127.0.0.1:5197';
const results = [];
for (const face of ['maida2', 'rin', 'kamae']) {
    // Supply fixture setup to Beacon without replacing its snapshot checks.
    const playwrightModule = { chromium: { launch: async options => {
        const browser = await chromium.launch(options);
        const newPage = browser.newPage.bind(browser);
        browser.newPage = async pageOptions => {
            const page = await newPage(pageOptions);
            await page.addInitScript(installHistoryFixture, { locale: 'zh-TW' });
            const goto = page.goto.bind(page);
            page.goto = async (...args) => {
                const response = await goto(...args);
                await page.locator(`[data-face="${face}"]`).click();
                await page.locator('main > .app-footer').waitFor();
                return response;
            };
            return page;
        };
        return browser;
    } } };
    const result = await runDesignQa({ url: baseUrl, playwrightModule, screenshotDir: `design/closeout-review/beacon-${face}` });
    await mkdir('design/closeout-review', { recursive: true });
    await writeFile(`design/closeout-review/beacon-${face}.json`, JSON.stringify(result, null, 2));
    results.push({ face, ...result.summary });
    console.log(face, result.summary.machine_verdict, result.summary.blocking_checks);
}
process.exitCode = results.some(r => r.machine_verdict !== 'pass') ? 2 : 0;
