import { chromium } from '@playwright/test';
import { installHistoryFixture } from './history-fixture.js';
import assert from 'node:assert/strict';
const browser = await chromium.launch();
try {
 const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
 await page.addInitScript(installHistoryFixture, { locale: 'en' });
 await page.addInitScript(() => {
  for (const game of window.__historyFixture.data.games.games) game.title = 'Clair Obscur: Expedition 33 — A very long game title for handheld layout verification';
 });
 await page.goto('http://localhost:5199');
 for (const [face, animation] of [['rin', 'mode-mark'], ['kamae', 'mode-settle'], ['maida2', 'mode-open']]) {
  await page.locator(`[data-face="${face}"]`).click();
  const name = await page.locator(`[data-face="${face}"] .mode-navigation__symbol`).evaluate(el => window.getComputedStyle(el).animationName);
  assert.equal(name, animation);
 }
 await page.locator('[data-face="rin"]').click();
 for (const [width, height] of [[1280, 800], [1280, 720], [960, 540]]) {
  await page.setViewportSize({ width, height });
  const bottom = await page.locator('.primary-actions').evaluate(el => el.getBoundingClientRect().bottom);
  assert(bottom < height, `Rin actions below ${width}x${height}: ${bottom}`);
  await page.screenshot({ path: `design/history-review/sidebar/long-title-${width}-${height}.png`, fullPage: true });
 }
 await page.emulateMedia({ reducedMotion: 'reduce' });
 assert.equal(await page.locator('.mode-navigation').evaluate(el => el.getAnimations({ subtree: true }).length), 0);
 await page.locator('[data-face="rin"]').focus();
 assert.notEqual(await page.locator('[data-face="rin"]').evaluate(el => window.getComputedStyle(el).outlineStyle), 'none');
 console.log('Three distinct finite animations, reduced motion, focus outline and long-title handheld actions passed');
} finally { await browser.close(); }
