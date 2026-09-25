// Adjudicate Beacon's reported overflow without changing its raw verdicts.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { installHistoryFixture } from './history-fixture.js';

const browser = await chromium.launch();
const records = [];
try {
    for (const face of ['rin', 'kamae']) {
        const report = JSON.parse(await readFile(`design/closeout-review/beacon-${face}.json`, 'utf8'));
        for (const run of report.runs) {
            const blocked = run.checks.filter(check => check.status === 'blocked');
            assert(blocked.length > 0, 'Expected the recorded finding to remain available');
            const page = await browser.newPage({ viewport: { width: parseInt(run.viewport, 10), height: 800 }, colorScheme: run.scheme });
            await page.addInitScript(installHistoryFixture, { locale: 'zh-TW' });
            await page.goto('http://127.0.0.1:5197');
            await page.locator(`[data-face="${face}"]`).click();
            for (const check of blocked) {
                assert.equal(check.id, 'element-horizontal-overflow', 'Unexpected blocker requires separate review');
                for (const finding of check.evidence) {
                    assert.match(finding.selector, /\.sr-only$/);
                    const elements = await page.locator(finding.selector).evaluateAll(nodes => nodes.filter(el => el.scrollWidth > el.clientWidth).map(el => {
                        const s = window.getComputedStyle(el);
                        return { position: s.position, width: s.width, height: s.height, overflow: s.overflow, clipPath: s.clipPath, textPresent: Boolean(el.textContent.trim()), ariaHidden: el.getAttribute('aria-hidden') };
                    }));
                    assert(elements.length > 0);
                    for (const element of elements) {
                        assert.equal(element.position, 'absolute');
                        assert.equal(element.width, '1px');
                        assert.equal(element.height, '1px');
                        assert.equal(element.overflow, 'hidden');
                        assert.equal(element.clipPath, 'inset(50%)');
                        assert(element.textPresent);
                        assert.notEqual(element.ariaHidden, 'true');
                    }
                    records.push({ face, viewport: run.viewport, scheme: run.scheme, finding, elements, disposition: 'Intentional clipped screen-reader text; not a visible horizontal scrollbar. Raw Beacon finding retained.' });
                }
            }
            await page.close();
        }
    }
    await writeFile('design/closeout-review/sr-overflow-adjudication.json', JSON.stringify(records, null, 2));
    console.log(`${records.length} recorded sr-only findings verified; raw Beacon reports unchanged`);
} finally {
    await browser.close();
}
