import { chromium } from '@playwright/test';
import { installHistoryFixture } from './history-fixture.js';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const dir = 'design/history-review/sidebar';
await mkdir(dir, { recursive: true });
const browser = await chromium.launch();
const records = [];
try {
 for (const layout of ['tabs', 'pager']) {
  for (const locale of ['en', 'zh-TW', 'ja', 'zh-CN']) {
   for (const theme of ['dark', 'light']) {
    const page = await browser.newPage({ colorScheme: theme });
    await page.addInitScript(installHistoryFixture, { layout, locale });
    await page.goto('http://localhost:5199');
    await page.locator('.mode-navigation').waitFor();
    for (const face of ['maida2', 'rin', 'kamae']) {
     if (face !== 'maida2') {
      if (layout === 'tabs') await page.locator(`[data-face="${face}"]`).click();
      else await page.locator('.mode-navigation__pager-button--next').click();
     }
     for (const width of [320, 768, 960, 1024, 1280, 1440, 1742, 1920]) {
      await page.setViewportSize({ width, height: width === 960 ? 540 : width === 1280 ? 720 : 800 });
      await page.waitForTimeout(50);
      const metrics = await page.evaluate(() => ({
       overflow: [...document.querySelectorAll('body *')].filter(el => {
        const s = window.getComputedStyle(el); return s.display !== 'none' && s.position !== 'absolute' && s.position !== 'fixed' && el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 1;
       }).map(el => ({ tag: el.tagName, cls: el.className, w: el.clientWidth, sw: el.scrollWidth })),
       pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
       overlaps: [...document.querySelectorAll('.theme-toggle,.help-tour-btn')].flatMap(control => {
        const a = control.getBoundingClientRect();
        return [...document.querySelectorAll('.mode-navigation button,.m2-card,.kata-item,.mvp-btn:not(.is-hidden)')].filter(target => {
         const b = target.getBoundingClientRect();
         return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
        }).map(target => `${control.className}:${target.className}`);
       }),
       actionBottom: document.querySelector('.primary-actions')?.getBoundingClientRect().bottom,
       rail: document.querySelector('.mode-navigation').getBoundingClientRect().toJSON(),
      }));
      records.push({ layout, locale, theme, face, width, ...metrics });
      if (locale === 'en') await page.screenshot({ path: `${dir}/${layout}-${theme}-${face}-${width}.png`, fullPage: true });
     }
    }
    await page.emulateMedia({ reducedMotion: 'reduce' });
    assert.equal(await page.locator('.mode-navigation').evaluate(el => el.getAnimations({ subtree: true }).length), 0);
    await page.close();
   }
  }
 }
 await writeFile(`${dir}/metrics.json`, JSON.stringify(records, null, 2));
 const failures = records.filter(r => r.pageOverflow || r.overflow.length || r.overlaps.length);
 console.log(JSON.stringify({ cases: records.length, failures: failures.slice(0, 10), totalFailures: failures.length }));
 assert.equal(failures.length, 0);
} finally { await browser.close(); }
