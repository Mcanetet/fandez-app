/**
 * E2E — Cliente: landing emergencia y checkout accesible
 */
const { test, expect } = require('@playwright/test');

test.describe('Flujo cliente público', () => {
  test('landing muestra CTA de emergencia', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('link', { name: /emergencia|emergency/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /emergencia|emergency/i })).toHaveAttribute('href', /emergency=1/);
  });

  test('login demo abre dashboard cliente', async ({ page }) => {
    await page.goto('/login');
    await page.locator('#email').fill('cliente@fandez.cl');
    await page.locator('#password').fill('cliente123');
    await page.locator('form[action="/login"] button[type="submit"]').click();
    await page.waitForURL(/\/(cliente|verificar-email)(\/|$|\?)/);
    if (page.url().includes('/verificar-email')) {
      await expect(page.getByRole('heading', { name: /verifica tu correo/i })).toBeVisible();
      return;
    }
    await expect(page.locator('#clientDashboard')).toBeVisible();
    await expect(page.locator('.nav-client-bar')).toBeVisible();
  });
});
