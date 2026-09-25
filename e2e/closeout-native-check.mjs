import { chromium } from '@playwright/test';
import { Buffer } from 'node:buffer';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const browser = await chromium.connectOverCDP('http://127.0.0.1:9227');
try {
    const page = browser.contexts().flatMap(context => context.pages()).find(page => page.url().includes('127.0.0.1:5197'));
    assert(page, 'Isolated WebView2 app must be connected to the closeout dev server');
    await page.waitForSelector('#root > *');
    const evidence = await page.evaluate(async () => {
        const { invoke } = window.__TAURI_INTERNALS__;
        const config = await invoke('get_data', { dataType: 'config' });
        const nav = performance.getEntriesByType('navigation')[0];
        return {
            userAgent: navigator.userAgent,
            nativeIPC: !!window.__TAURI_INTERNALS__,
            telemetryDisabled: config?.telemetry?.enabled === false,
            readyState: document.readyState,
            paint: performance.getEntriesByType('paint').map(({ name, startTime }) => ({ name, startTime })),
            navigation: nav ? { responseEnd: nav.responseEnd, domContentLoaded: nav.domContentLoadedEventEnd, load: nav.loadEventEnd } : null,
            htmlBackground: window.getComputedStyle(document.documentElement).backgroundColor,
            bodyBackground: window.getComputedStyle(document.body).backgroundColor,
            rendered: !!document.querySelector('#root > *'),
            scope: 'Windows WebView2 dev, isolated app identifier; navigation timings exclude native process startup and compilation',
        };
    });
    assert(evidence.nativeIPC && evidence.rendered && evidence.telemetryDisabled);
    await mkdir('design/closeout-review', { recursive: true });
    const cdp = await page.context().newCDPSession(page);
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    await writeFile('design/closeout-review/native-webview2.png', Buffer.from(shot.data, 'base64'));
    await writeFile('design/closeout-review/native-webview2.json', JSON.stringify(evidence, null, 2));
    console.log(JSON.stringify(evidence));
} finally { await browser.close(); }
