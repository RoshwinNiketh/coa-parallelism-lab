import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('default metrics, comparisons and diagrams match the scheduler', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await expect(page.getByRole('heading', { name: 'See parallelism at work.' })).toBeVisible();
  await expect(page.locator('.metric').first()).toContainText('10');
  await expect(page.locator('.metric').nth(1)).toContainText('1.8');
  await expect(page.locator('.metric').nth(2)).toContainText('90%');
  await expect(page.locator('.metric').nth(3)).toContainText('90%');
  await expect(page.getByRole('img', { name: /^Execution timeline:/ })).toBeVisible();
  await expect(page.getByRole('img', { name: /^Dependency graph/ })).toBeVisible();
  await expect(page.locator('.results-table tbody tr')).toHaveCount(5);
  await expect(page.locator('.results-table tbody tr').nth(0)).toContainText('18 tu');
  await expect(page.locator('.results-table tbody tr').nth(1)).toContainText('18 tu');
  await expect(page.locator('.results-table tbody tr').nth(2)).toContainText('18 tu');
  await expect(page.locator('.results-table tbody tr').nth(3)).toContainText('10 tu');
  await expect(page.getByRole('img', { name: /^Speedup:/ })).toBeVisible();
  expect(errors).toEqual([]);
});

test('playback can step, run, pause, resume, finish, and reset', async ({ page }) => {
  await page.getByRole('button', { name: 'Step to event' }).click();
  await expect(page.locator('.playback-time')).toHaveText('3 / 10 tu');
  await expect(page.getByRole('status', { name: 'Simulation status' })).toHaveText('Paused');
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  const pausedTime = await page.locator('.playback-time').textContent();
  await page.waitForTimeout(150);
  expect(await page.locator('.playback-time').textContent()).toBe(pausedTime);
  await page.getByLabel('Playback speed').selectOption('4');
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await expect(page.getByRole('status', { name: 'Simulation status' })).toHaveText('Complete', {
    timeout: 10000,
  });
  await expect(page.locator('.playback-time')).toHaveText('10 / 10 tu');
  await expect(page.locator('.event-list')).toContainText('F complete');
  await page.getByRole('button', { name: 'Reset playback' }).click();
  await expect(page.locator('.playback-time')).toHaveText('0 / 10 tu');
  await expect(page.getByRole('status', { name: 'Simulation status' })).toHaveText('Ready');
});

test('input edits cancel playback and invalid graphs cannot simulate', async ({ page }) => {
  await page.getByRole('button', { name: 'Run simulation', exact: true }).click();
  await page.getByLabel('Task 1 ID', { exact: true }).fill('B');
  await expect(page.getByRole('alert')).toContainText('Duplicate task ID');
  await expect(page.getByRole('button', { name: 'Run simulation', exact: true })).toBeDisabled();
  await expect(page.locator('.playback-time')).toHaveText('0 / — tu');
  await page.getByRole('button', { name: 'Load default' }).click();
  await page.getByLabel('Task 1 prerequisites', { exact: true }).fill('F');
  await expect(page.getByRole('alert')).toContainText('cycle');
  await page.getByLabel('Task 1 prerequisites', { exact: true }).fill('Z');
  await expect(page.getByRole('alert')).toContainText('unknown prerequisite');
  await page.getByLabel('Task 1 prerequisites', { exact: true }).fill('A');
  await expect(page.getByRole('alert')).toContainText('itself');
  await page.getByRole('button', { name: 'Load default' }).click();
  await page.getByLabel('Task 1 duration', { exact: true }).fill('0');
  await expect(page.getByRole('alert')).toContainText('positive number');
  await page.getByLabel('Task 1 duration', { exact: true }).fill('');
  await expect(page.getByRole('alert')).toContainText('positive number');
  await page.getByRole('button', { name: 'Load default' }).click();
  await expect(page.getByRole('button', { name: 'Run simulation', exact: true })).toBeEnabled();
});

test('scenario switching and custom resource changes reset the simulation', async ({ page }) => {
  await page.getByRole('button', { name: /More hardware/ }).click();
  await expect(page.locator('.metric').first()).toContainText('18');
  await expect(page.locator('.metric').nth(3)).toContainText('50%');
  await page.getByRole('button', { name: /More software/ }).click();
  await expect(page.locator('.metric').first()).toContainText('18');
  await page.getByRole('button', { name: /Together/ }).click();
  await page.getByRole('button', { name: 'Step to event' }).click();
  await page.getByRole('button', { name: /Select custom/ }).click();
  await expect(page.locator('.playback-time')).toHaveText('0 / 10 tu');
  const cores = page.getByRole('slider', { name: 'Custom CPU cores' });
  await cores.focus();
  await cores.press('Home');
  await expect(page.locator('.metric').first()).toContainText('18');
  await expect(page.locator('.core-card')).toHaveCount(1);
  await expect(page.locator('.results-table .selected-row')).toContainText('Custom configuration');
});

test('add, remove, empty workload and restore work correctly', async ({ page }) => {
  await page.getByRole('button', { name: 'Add task', exact: true }).click();
  await expect(page.getByLabel('Task 7 ID', { exact: true })).toHaveValue('G');
  await expect(page.locator('.metric').first()).toContainText('10');
  await expect(page.locator('.metric').nth(3)).toContainText('95%');
  await page.getByRole('button', { name: 'Remove task G', exact: true }).click();
  for (const id of ['F', 'E', 'D', 'C', 'B', 'A'])
    await page.getByRole('button', { name: `Remove task ${id}`, exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Add at least one task');
  await expect(page.getByRole('button', { name: 'Run simulation', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Load default' }).click();
  await expect(page.locator('.editor-table tbody tr')).toHaveCount(6);
});

test('CSV export contains calculated values and event filtering works', async ({ page }) => {
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export CSV' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('parallelism-lab-results.csv');
  const stream = await download.createReadStream();
  let text = '';
  for await (const chunk of stream!) text += chunk.toString();
  expect(text).toContain('2,2,10,1.8,0.9,0.9');
  await page.getByLabel('Filter events').selectOption('complete');
  await expect(page.locator('.event-list')).toContainText('No matching events');
  await page.getByRole('button', { name: 'Step to event' }).click();
  await expect(page.locator('.event-list')).toContainText('B complete');
  await expect(page.locator('.event-list')).not.toContainText('started');
});

test('responsive layout and reduced motion remain usable', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.getByRole('heading', { name: 'Simulation workspace' })).toBeVisible();
  await expect(page.getByRole('img', { name: /^Speedup:/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({
    path: `test-results/${testInfo.project.name}-dashboard.png`,
    fullPage: true,
  });
  await page.screenshot({ path: `test-results/${testInfo.project.name}-viewport.png` });
  if (testInfo.project.name === 'mobile') {
    await page.setViewportSize({ width: 844, height: 390 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.setViewportSize({ width: 375, height: 812 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  }
});

test('dashboard has no serious accessibility violations', async ({ page }) => {
  await expect(page.getByRole('img', { name: /^Speedup:/ })).toBeVisible();
  const audit = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(
    audit.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      nodes: v.nodes.map((n) => ({ target: n.target, summary: n.failureSummary })),
    })),
  ).toEqual([]);
});
