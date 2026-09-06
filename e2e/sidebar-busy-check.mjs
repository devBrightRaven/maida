import { chromium } from '@playwright/test';
import { installHistoryFixture } from './history-fixture.js';
import assert from 'node:assert/strict';
const browser = await chromium.launch();
try {
 const page = await browser.newPage();
 await page.addInitScript(installHistoryFixture);
 await page.addInitScript(() => {
  const invoke = window.__TAURI_INTERNALS__.invoke;
  window.__TAURI_INTERNALS__.invoke = async (cmd, args) => {
   if (cmd === 'save_data' && args.dataType === 'hooks') await new Promise((resolve, reject) => { window.__rejectHookSave = () => reject(new Error('fixture delayed failure')); });
   return invoke(cmd, args);
  };
  window.__pad = { id: 'test-pad', index: 0, connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
  Object.defineProperty(navigator, 'getGamepads', { value: () => [window.__pad] });
 });
 await page.goto('http://localhost:5199');
 await page.locator('.m2-hook-retract').click();
 await page.locator('.maida2-view[aria-busy="true"]').waitFor();
 await page.getByRole('button', { name: '設定', exact: true }).click();
 await page.keyboard.press('F10');
 await page.evaluate(() => { window.__pad.buttons[9] = { pressed: true, value: 1 }; });
 await page.waitForTimeout(120);
 await page.evaluate(() => { window.__pad.buttons[9] = { pressed: false, value: 0 }; });
 assert.equal(await page.locator('.kamae-settings').count(), 0);
 assert.equal(await page.locator('.maida2-view[aria-busy="true"]').count(), 1);
 await page.evaluate(() => window.__rejectHookSave());
 await page.locator('.m2-save-error').waitFor();
 assert.equal(await page.locator('.m2-hook-retract:enabled').count(), 1);
 console.log('Pending retract cannot be abandoned via Settings click, F10 or gamepad Menu; failure stays visible and retry remains enabled');
} finally { await browser.close(); }
