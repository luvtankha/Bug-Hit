import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';

const pwd = 'bug-hit-local-test-password';
const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+kvioAAAAASUVORK5CYII=', 'base64');

async function signUp(page, name, email) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Create an account' }).click();
  await page.getByLabel('Name', { exact: true }).fill(name);
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password').fill(pwd);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: 'Projects', exact: true })).toBeVisible();
}

test('projects, team, live board, comments, screenshots, and retained workflow', async ({ page, browser, request }, testInfo) => {
  const key = 'B' + randomUUID().slice(0, 7).toUpperCase();
  const email = `${key.toLowerCase()}@example.com`;
  const developerEmail = `dev-${email}`;
  const title = 'Checkout button appears twice';
  const person = await request.post('/api/auth/signup', { data: { name: 'Sam Developer', email: developerEmail, password: pwd } });
  expect(person.status()).toBe(201);
  await signUp(page, 'Alex Owner', email);
  await page.getByRole('button', { name: 'Create project', exact: true }).click();
  let form = page.getByRole('dialog');
  await form.getByLabel('Project name').fill('Release Checklist');
  await form.getByLabel('Project key').fill(key);
  await form.getByLabel('Description').fill('Issues for the next release.');
  await form.getByRole('button', { name: 'Create project', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Release Checklist' })).toBeVisible();
  await expect(page.getByText('Live updates', { exact: true })).toBeVisible();
  const projectUrl = page.url();
  await page.getByRole('link', { name: 'Team', exact: true }).click();
  await page.getByRole('button', { name: 'Add member' }).click();
  form = page.getByRole('dialog');
  await form.getByLabel('Email address').fill(developerEmail);
  await form.getByLabel('Project role').selectOption('DEVELOPER');
  await form.getByRole('button', { name: 'Add member' }).click();
  await expect(page.getByText('Sam Developer', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Issues', exact: true }).click();

  let viewer;
  let secondContext;
  if (testInfo.project.name === 'chromium-desktop') {
    secondContext = await browser.newContext();
    viewer = await secondContext.newPage();
    await viewer.goto(projectUrl);
    await viewer.getByLabel('Email address').fill(developerEmail);
    await viewer.getByLabel('Password').fill(pwd);
    await viewer.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(viewer.getByText('Live updates', { exact: true })).toBeVisible();
  }
  try {
    await page.getByRole('button', { name: 'New issue', exact: true }).click();
    form = page.getByRole('dialog');
    await form.getByLabel('Title').fill(title);
    await form.getByLabel('Description').fill('Open the cart on a small screen.');
    await form.getByLabel('Issue priority').selectOption('HIGH');
    await form.getByLabel('Issue assignee').selectOption({ label: 'Sam Developer' });
    await form.getByRole('button', { name: 'Create issue', exact: true }).click();
    let detail = page.getByRole('dialog', { name: `${key}-1`, exact: true });
    await expect(detail.getByRole('heading', { name: title })).toBeVisible();
    if (viewer) {
      await expect(viewer.getByRole('button', { name: title, exact: true })).toBeVisible();
      await viewer.getByRole('button', { name: title, exact: true }).click();
      await expect(viewer.getByRole('combobox', { name: 'Move issue to status' })).toBeEnabled();
      await expect(viewer.getByRole('button', { name: 'Delete issue' })).toHaveCount(0);
    }
    await detail.getByRole('textbox', { name: 'Write a comment' }).fill('Reproduced on mobile.');
    await detail.getByRole('button', { name: 'Post comment' }).click();
    await expect(detail.getByText('Reproduced on mobile.', { exact: true })).toBeVisible();
    const screenshot = detail.getByLabel('Add screenshot');
    await expect(screenshot).toBeEnabled();
    await screenshot.setInputFiles({ name: 'checkout.png', mimeType: 'image/png', buffer: image });
    await expect(detail.getByRole('button', { name: /checkout.png/ })).toBeVisible();

    if (testInfo.project.name === 'webkit-mobile') {
      await detail.getByLabel('Move issue to status').selectOption('IN_PROGRESS');
      await expect(detail.getByLabel('Move issue to status')).toHaveValue('IN_PROGRESS');
      await detail.getByRole('button', { name: 'Close dialog' }).click();
    } else {
      await detail.getByRole('button', { name: 'Close dialog' }).click();
      const drag = page.getByRole('button', { name: `Drag ${key}-1` });
      const start = await drag.boundingBox();
      const end = await page.getByTestId('column-IN_PROGRESS').boundingBox();
      expect(start).toBeTruthy(); expect(end).toBeTruthy();
      await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
      await page.mouse.down();
      await page.mouse.move(end.x + end.width - 32, end.y + 100, { steps: 14 });
      await page.mouse.up();
    }
    await expect(page.getByTestId('column-IN_PROGRESS').getByRole('button', { name: title, exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'List view' }).click();
    await page.getByLabel('Search issues').fill('missing ticket');
    await expect(page.getByText('No matching issues.', { exact: true })).toBeVisible();
    await page.getByLabel('Search issues').fill('checkout');
    await expect(page.getByRole('table').getByRole('button', { name: title, exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByTestId('column-IN_PROGRESS').getByRole('button', { name: title, exact: true })).toBeVisible();
    await page.getByRole('button', { name: title, exact: true }).click();
    detail = page.getByRole('dialog', { name: `${key}-1`, exact: true });
    await expect(detail.getByText('Reproduced on mobile.', { exact: true })).toBeVisible();
    await detail.getByRole('button', { name: 'Edit issue' }).click();
    form = page.getByRole('dialog', { name: `Edit ${key}-1` });
    await form.getByLabel('Title').fill('Fix duplicate checkout button');
    await form.getByRole('button', { name: 'Save issue' }).click();
    await expect(detail.getByRole('heading', { name: 'Fix duplicate checkout button' })).toBeVisible();
    await detail.getByRole('button', { name: 'Delete issue' }).click();
    await page.getByRole('dialog', { name: `Delete ${key}-1?` }).getByRole('button', { name: 'Confirm delete' }).click();
    await expect(detail).toBeHidden();
    await expect(page.getByRole('button', { name: 'Fix duplicate checkout button' })).toHaveCount(0);
    expect(await page.locator('body').evaluate((body) => body.scrollWidth <= window.innerWidth)).toBe(true);
  } finally { await secondContext?.close(); }
});
