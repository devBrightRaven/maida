import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { installHistoryFixture } from './history-fixture.js';

const browser = await chromium.launch();
const records = [];
try {
    for (const theme of ['light', 'dark']) {
        const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, colorScheme: theme });
        await page.addInitScript(installHistoryFixture);
        await page.addInitScript(() => {
            const invoke = window.__TAURI_INTERNALS__.invoke;
            let clip;
            const createClip = () => new Promise(resolve => {
                const canvas = document.createElement('canvas');
                canvas.width = 320;
                canvas.height = 180;
                const context = canvas.getContext('2d');
                const stream = canvas.captureStream(20);
                const recorder = new window.MediaRecorder(stream, { mimeType: 'video/webm' });
                const chunks = [];
                recorder.ondataavailable = event => chunks.push(event.data);
                recorder.onstop = () => {
                    stream.getTracks().forEach(track => track.stop());
                    resolve(window.URL.createObjectURL(new window.Blob(chunks, { type: 'video/webm' })));
                };
                let frame = 0;
                const timer = setInterval(() => {
                    context.fillStyle = frame++ % 2 ? '#38536e' : '#658b5b';
                    context.fillRect(0, 0, 320, 180);
                }, 50);
                recorder.start();
                setTimeout(() => { clearInterval(timer); recorder.stop(); }, 600);
            });
            window.__TAURI_INTERNALS__.invoke = async (cmd, args) => {
                if (cmd === 'get_game_media') {
                    clip ??= createClip();
                    return { movie: { mp4_480: await clip }, screenshots: [] };
                }
                return invoke(cmd, args);
            };
        });
        await page.goto('http://127.0.0.1:5197');
        await page.locator('[data-face="maida2"]').click();
        await page.locator('.m2-card').first().focus();
        await page.waitForFunction(() => {
            const video = document.querySelector('.m2-backdrop-media video');
            return video && !video.paused && video.readyState >= 2 && video.currentTime > 0;
        });
        const evidence = await page.evaluate(() => {
            const footer = document.querySelector('.app-footer');
            const video = document.querySelector('.m2-backdrop-media video');
            const s = window.getComputedStyle(footer);
            return { background: s.backgroundColor, backdropFilter: s.backdropFilter, videoPlaying: !video.paused, videoReadyState: video.readyState, footer: footer.getBoundingClientRect().toJSON(), video: video.getBoundingClientRect().toJSON() };
        });
        assert.equal(evidence.background, 'rgba(0, 0, 0, 0)');
        assert.equal(evidence.backdropFilter, 'none');
        assert(evidence.videoPlaying);
        assert(evidence.footer.bottom <= 800);
        await page.screenshot({ path: `design/closeout-review/footer-video-${theme}.png` });
        records.push({ theme, ...evidence });
        await page.close();
    }
    await writeFile('design/closeout-review/footer-video.json', JSON.stringify(records, null, 2));
    console.log('Background video plays with a transparent fixed footer in both themes');
} finally { await browser.close(); }
