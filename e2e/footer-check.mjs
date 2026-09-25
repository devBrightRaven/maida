import { chromium } from '@playwright/test';
import { installHistoryFixture } from './history-fixture.js';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const dir = 'design/footer-review';
await mkdir(dir, { recursive: true });
const browser = await chromium.launch();
const records = [];
try {
 for (const locale of ['zh-TW', 'zh-CN', 'en', 'ja']) {
 for (const theme of ['light', 'dark']) {
  for (const width of [320, 768, 1024, 1280, 1440, 1742, 1920]) {
   const page = await browser.newPage({ viewport: { width, height: 800 }, colorScheme: theme });
   await page.addInitScript(installHistoryFixture, { locale });
   await page.goto('http://127.0.0.1:5197');
   for (const face of ['maida2', 'rin', 'kamae']) {
    await page.locator(`[data-face="${face}"]`).click();
    await page.locator('main > .app-footer').waitFor();
    const scrollPositions = [];
    for (const fraction of [0, 0.5, 1]) {
     await page.locator('main:has(> .mode-navigation)').evaluate((el, amount) => { el.scrollTop = (el.scrollHeight - el.clientHeight) * amount; }, fraction);
     const box = await page.locator('main > .app-footer').boundingBox();
     assert(box.y >= 0 && box.y + box.height <= 800, `Footer visible: ${locale}/${face}/${width}/${fraction}`);
     scrollPositions.push(box.y + box.height);
     const contentBox = await page.locator('main:has(> .mode-navigation)').boundingBox();
     assert(contentBox.y + contentBox.height <= box.y + 1, `Content clears footer: ${face}/${width}`);
    }
    assert(Math.max(...scrollPositions) - Math.min(...scrollPositions) <= 1, `Sticky footer: ${locale}/${face}/${width}`);
    await page.locator('main:has(> .mode-navigation)').evaluate(el => { el.scrollTop = el.scrollHeight; });
    const metrics = await page.evaluate(() => {
     const footer = document.querySelector('main > .app-footer');
     const root = document.querySelector('.app-root');
     const r = footer.getBoundingClientRect();
     const s = window.getComputedStyle(footer);
     return { width: root.clientWidth, center: (r.left + r.right) / 2, bottom: r.bottom,
      bg: s.backgroundColor, filter: s.backdropFilter, position: s.position,
      overflow: root.scrollWidth > root.clientWidth,
      mainOverflow: document.querySelector('main').scrollWidth > document.querySelector('main').clientWidth,
      footerOverflow: footer.scrollWidth > footer.clientWidth,
      rowCenters: [...footer.children].map(el => { const box = el.getBoundingClientRect(); return (box.top + box.bottom) / 2; }),
      fontSizes: ['.app-footer-links button', '.app-footer-copyright', '.version-number'].map(selector => window.getComputedStyle(footer.querySelector(selector)).fontSize),
      versionHeight: footer.querySelector('.footer-version-tag').getBoundingClientRect().height };
    });
    records.push({ face, theme, locale, width, ...metrics });
    assert.equal(new Set(metrics.fontSizes).size, 1);
    assert(metrics.versionHeight > 0);
    if (width >= 1280) assert(Math.max(...metrics.rowCenters) - Math.min(...metrics.rowCenters) <= 1, JSON.stringify(records.at(-1)));
    assert(Math.abs(metrics.center - metrics.width / 2) <= 1, JSON.stringify(records.at(-1)));
    assert.equal(metrics.bg, 'rgba(0, 0, 0, 0)');
    assert.equal(metrics.filter, 'none');
    assert.equal(metrics.position, 'fixed');
    assert(!metrics.overflow && !metrics.mainOverflow && !metrics.footerOverflow);
    await page.screenshot({ path: `${dir}/${locale}-${theme}-${face}-${width}.png` });
    await page.locator('.app-footer button').first().click();
    await page.locator('main.legal-page').waitFor();
    await page.locator('.legal-page-back').click();
    await page.locator('main > .app-footer').waitFor();
   }
   await page.close();
  }
 }
 }
 await writeFile(`${dir}/metrics.json`, JSON.stringify(records, null, 2));
 for (const record of records) {
  const peers = records.filter(r => r.width === record.width && r.theme === record.theme && r.locale === record.locale);
  assert(Math.max(...peers.map(r => r.bottom)) - Math.min(...peers.map(r => r.bottom)) <= 1, `Footer alignment: ${record.width}`);
 }
 console.log(`${records.length} footer layouts: centered, equal bottom, transparent, no overflow; legal open/return passed`);
} finally { await browser.close(); }
