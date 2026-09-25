import { chromium } from '@playwright/test';
import { Buffer } from 'node:buffer';
import { installHistoryFixture } from './history-fixture.js';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
await mkdir('design/footer-review', { recursive: true });
const context = await chromium.launchPersistentContext('design/footer-review/zoom-profile', { headless: false, viewport: null, args: ['--window-size=1440,1000'] });
let settings;
try {
 settings = await context.newPage();
 await settings.goto('chrome://settings/appearance');
 await settings.locator('#zoomLevel').selectOption({ label: '200%' });
 const page = await context.newPage();
 await page.addInitScript(installHistoryFixture, { locale: 'ja' });
 await page.goto('http://127.0.0.1:5197');
 const cdp = await context.newCDPSession(page);
 const records = [];
 for (const face of ['maida2', 'rin', 'kamae']) {
  await page.locator(`[data-face="${face}"]`).click();
  await page.locator('main > .app-footer').waitFor();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(500);
  await page.locator('main:has(> .mode-navigation)').evaluate(el => { el.scrollTop = el.scrollHeight; });
  const m = await page.locator('main > .app-footer').evaluate(el => {
   const r = el.getBoundingClientRect();
   const root = document.querySelector('.app-root');
   return { innerWidth: window.innerWidth, bottom: r.bottom, center: (r.left + r.right) / 2, width: root.clientWidth, overflow: root.scrollWidth > root.clientWidth, background: window.getComputedStyle(el).backgroundColor,
    rootHeight: root.clientHeight, scrollHeight: root.scrollHeight, scrollTop: root.scrollTop,
    mainBottom: document.querySelector('main').getBoundingClientRect().bottom,
    overflowing: [...document.querySelector('main').children].filter(child => child.getBoundingClientRect().bottom > r.bottom + 8).map(child => [child.className, child.getBoundingClientRect().bottom]) };
  });
  assert(!m.overflow && Math.abs(m.center - m.width / 2) < 1);
  assert.equal(m.background, 'rgba(0, 0, 0, 0)');
  assert(m.innerWidth < 800, 'Browser must actually be zoomed to 200%');
  assert(m.mainBottom <= m.bottom - 20, 'Scroll area must leave room for footer');
  records.push({ face, ...m });
  // Capture the native zoomed surface without Playwright viewport resizing.
  const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  await writeFile(`design/footer-review/zoom-${face}.png`, Buffer.from(shot.data, 'base64'));
 }
 await writeFile('design/footer-review/zoom.json', JSON.stringify({ zoom: '200%', method: 'Chromium Appearance setting', records }, null, 2));
 assert(Math.max(...records.map(r => r.bottom)) - Math.min(...records.map(r => r.bottom)) <= 1, JSON.stringify(records));
 console.log('Actual 200% zoom: three footers align, stay transparent, no horizontal overflow');
} finally {
 if (settings) await settings.locator('#zoomLevel').selectOption({ label: '100%' });
 await context.close();
}
