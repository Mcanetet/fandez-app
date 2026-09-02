/**
 * Smoke E2E móvil — iPhone 13 viewport contra BASE_URL
 */
const { test, expect } = require('@playwright/test');

const CLIENT = { email: 'cliente@fandez.cl', password: 'cliente123' };

test.describe('Mobile iPhone — cliente', () => {
  test('login y dashboard visible', async ({ page }) => {
    await page.goto('/login');
    await page.locator('#email').fill(CLIENT.email);
    await page.locator('#password').fill(CLIENT.password);
    await page.locator('form[action="/login"] button[type="submit"]').click();
    await page.waitForURL(/\/(cliente|verificar-email)/, { timeout: 25000 });
    if (page.url().includes('verificar-email')) {
      await expect(page.getByRole('heading', { name: /verifica/i })).toBeVisible();
      return;
    }
    await expect(page.locator('#clientDashboard')).toBeVisible();
    await expect(page.locator('.nav-client-bar')).toBeVisible();
  });

  test('health remoto responde', async ({ request }) => {
    const res = await request.get('/health?go=1');
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data.app).toBe('fandez');
    expect(data.ok).toBe(true);
    if (data.goLive) {
      expect(typeof data.goLive.softLaunchReady).toBe('boolean');
    }
  });
});
