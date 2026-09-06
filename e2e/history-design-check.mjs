import { chromium } from '@playwright/test';
import { installHistoryFixture } from './history-fixture.js';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
const { runDesignQa } = await import(pathToFileURL(process.argv[2]).href);
import { mkdir, writeFile } from 'node:fs/promises';
await mkdir('design/history-review', { recursive: true });
for (const target of ['history', 'tabs', 'pager']) {
    const adapter = { chromium: { launch: async options => {
        const browser = await chromium.launch(options);
        const newPage = browser.newPage.bind(browser);
        browser.newPage = async options => {
            const page = await newPage(options);
            await page.addInitScript(installHistoryFixture, { layout: target === 'pager' ? 'pager' : 'tabs' });
            const goto = page.goto.bind(page);
            page.goto = async (...args) => {
                const result = await goto(...args);
                await page.locator('.mode-navigation').waitFor();
                if (target === 'history') {
                    await page.locator('.mode-navigation [data-history-game]').click();
                    await page.locator('.history-events li').first().waitFor();
                }
                return result;
            };
            return page;
        };
        return browser;
    } } };
    const result = await runDesignQa({ url: 'http://localhost:5199', screenshotDir: `design/history-review/${target}`, playwrightModule: adapter });
    await writeFile(`design/history-review/${target}.json`, JSON.stringify(result, null, 2));
    console.log(target, JSON.stringify(result.summary));
}
