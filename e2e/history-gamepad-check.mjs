import { chromium } from '@playwright/test';
import { installHistoryFixture } from './history-fixture.js';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
await mkdir('design/history-review', { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage();
await page.addInitScript(installHistoryFixture);
await page.addInitScript(() => {
    window.__pad = { id: 'test-pad', index: 0, connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
    Object.defineProperty(navigator, 'getGamepads', { value: () => [window.__pad] });
});
const press = async index => {
    await page.evaluate(i => { window.__pad.buttons[i] = { pressed: true, value: 1 }; }, index);
    await page.waitForTimeout(90);
    await page.evaluate(i => { window.__pad.buttons[i] = { pressed: false, value: 0 }; }, index);
    await page.waitForTimeout(90);
};
try {
    await page.goto('http://localhost:5199'); await page.bringToFront();
    await page.locator('.mode-navigation').waitFor();
    await press(5);
    assert.match(await page.locator('.mode-navigation [aria-current="page"]').textContent(), /Rin/);
    await press(5);
    assert.match(await page.locator('.mode-navigation [aria-current="page"]').textContent(), /Kamae/);
    await press(4);
    assert.match(await page.locator('.mode-navigation [aria-current="page"]').textContent(), /Rin/);
    await page.locator('.mode-navigation [data-history-game]').focus(); await press(0);
    await page.locator('.decision-history').waitFor(); await press(5);
    assert.equal(await page.locator('.decision-history').count(), 1);
    await press(13); assert(await page.locator('.decision-history').evaluate(el => el.contains(document.activeElement)));
    await press(1); await page.locator('.mode-navigation').waitFor();
    await page.waitForFunction(() => document.activeElement?.hasAttribute('data-history-game'));
    assert.match(await page.locator('.mode-navigation [aria-current="page"]').textContent(), /Rin/);
    await page.evaluate(() => { window.__historyFixture.failWrite = true; });
    await page.locator('.not-today').click();
    await page.locator('.trace-save-warning').waitFor();
    await page.locator('.mode-navigation [data-history-game]').click();
    await page.locator('.decision-history').waitFor();
    for (let i = 0; i < 6; i++) {
        if (await page.locator('.trace-save-warning button').evaluate(el => el === document.activeElement)) break;
        await press(13);
    }
    assert(await page.locator('.trace-save-warning button').evaluate(el => el === document.activeElement));
    await page.evaluate(() => { window.__historyFixture.failWrite = false; });
    await press(0); await page.locator('.trace-save-warning').waitFor({ state: 'detached' });
    console.log('Simulated standard gamepad: shoulders, D-pad, A, B and History modal guard passed');
    await writeFile('design/history-review/gamepad.json', JSON.stringify({ simulated: 'passed', physical: 'not tested' }, null, 2));
} finally { await browser.close(); }
