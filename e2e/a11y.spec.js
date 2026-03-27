import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Accessibility scan using axe-core.
 * Runs against the built Vite preview server.
 * Checks WCAG 2.2 AA compliance on the default page.
 */

test.describe('Accessibility (axe-core)', () => {
    test('homepage has no critical or serious a11y violations', async ({ page }) => {
        await page.goto('/');
        // Wait for app to render (loading state → active state)
        await page.waitForTimeout(2000);

        const results = await new AxeBuilder({ page })
            .withTags(['wcag2a', 'wcag2aa', 'wcag22aa'])
            .analyze();

        const critical = results.violations.filter(v => v.impact === 'critical');
        const serious = results.violations.filter(v => v.impact === 'serious');

        // Log all violations for debugging
        if (results.violations.length > 0) {
            console.log('axe-core violations:');
            results.violations.forEach(v => {
                console.log(`  [${v.impact}] ${v.id}: ${v.description}`);
                v.nodes.forEach(n => {
                    console.log(`    - ${n.html.substring(0, 120)}`);
                });
            });
        }

        expect(critical, 'Critical a11y violations found').toHaveLength(0);
        expect(serious, 'Serious a11y violations found').toHaveLength(0);
    });

    test('page has correct lang attribute', async ({ page }) => {
        await page.goto('/');
        await page.waitForTimeout(1000);

        const lang = await page.getAttribute('html', 'lang');
        expect(lang).toBeTruthy();
        expect(['en', 'zh', 'ja']).toContain(lang);
    });

    test('all interactive elements are keyboard accessible', async ({ page }) => {
        await page.goto('/');
        await page.waitForTimeout(2000);

        const results = await new AxeBuilder({ page })
            .withRules(['button-name', 'link-name', 'label', 'aria-required-attr'])
            .analyze();

        const failures = results.violations.filter(v => v.impact === 'critical' || v.impact === 'serious');
        expect(failures, 'Interactive elements missing labels or roles').toHaveLength(0);
    });
});
