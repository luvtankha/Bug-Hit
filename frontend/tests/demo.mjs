import { chromium, request } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';

const origin = process.env.BUG_HIT_DEMO_URL || 'http://127.0.0.1:5177';
if (!['127.0.0.1', 'localhost'].includes(new URL(origin).hostname)) throw new Error('Record the demo against a local Bug Hit instance.');
const destination = resolve(process.argv[2] || '../docs/bug-hit-demo.webm');
const scratch = await mkdtemp(resolve(tmpdir(), 'bug-hit-demo-'));
await mkdir(dirname(destination), { recursive: true });
const client = await request.newContext({ baseURL: origin });
async function post(path, data, token) {
  const response = await client.post(`/api${path}`, { data, headers: token ? { Authorization: `Bearer ${token}` } : undefined });
  if (!response.ok()) throw new Error(`${path} returned HTTP ${response.status()}: ${await response.text()}`);
  return response.json();
}

const run = randomUUID().slice(0, 6);
const owner = await post('/auth/signup', { name: 'Alex Morgan', email: `demo-${run}@example.com`, password: 'synthetic-demo-password' });
const teammate = await post('/auth/signup', { name: 'Jamie Park', email: `team-${run}@example.com`, password: 'synthetic-demo-password' });
const { token } = owner;
const project = await post('/projects', { key: `AU${run.toUpperCase()}`, name: 'Aurora storefront', description: 'Track fixes and improvements for the next storefront release.' }, token);
await post(`/projects/${project.id}/members`, { email: teammate.user.email, role: 'DEVELOPER' }, token);
const issues = [
  ['Checkout button appears twice', 'BUG', 'HIGH', 'TODO', teammate.user.id, 'On mobile, reopening the cart after a failed payment renders a second checkout button.'],
  ['Add empty-state copy for orders', 'TASK', 'MEDIUM', 'TODO', owner.user.id, 'Give returning customers a clear next step when the order list is empty.'],
  ['Tighten search focus order', 'BUG', 'LOW', 'TODO', null, 'Review keyboard focus when search results update.'],
  ['Update product image layout', 'STORY', 'MEDIUM', 'IN_PROGRESS', owner.user.id, 'Keep image blocks stable while the larger image downloads.'],
  ['Handle expired checkout sessions', 'BUG', 'URGENT', 'IN_PROGRESS', teammate.user.id, 'Show a retry path after a payment session expires.'],
  ['Restore mobile filter button', 'BUG', 'HIGH', 'DONE', teammate.user.id, 'The filter control is visible at the smallest supported viewport.'],
  ['Add order summary links', 'TASK', 'LOW', 'DONE', owner.user.id, 'Link the confirmation panel to the order details page.']
];
for (const [title, type, priority, status, assigneeId, description] of issues.reverse()) {
  await post(`/projects/${project.id}/issues`, { title, type, priority, status, assigneeId, description }, token);
}
await client.dispose();

const browser = await chromium.launch();
const viewport = { width: 1200, height: 720 };
const context = await browser.newContext({ viewport, recordVideo: { dir: scratch, size: viewport } });
await context.addInitScript((session) => sessionStorage.setItem('bug-hit-session', session), token);
const page = await context.newPage();
const video = page.video();
const pause = (ms) => new Promise((done) => setTimeout(done, ms));
try {
  await page.goto(`${origin}/projects/${project.id}`);
  const title = 'Checkout button appears twice';
  const originalColumn = page.getByTestId('column-TODO');
  const workingColumn = page.getByTestId('column-IN_PROGRESS');
  await originalColumn.getByRole('button', { name: title }).waitFor();
  await page.getByText('Live updates', { exact: true }).waitFor();
  await page.screenshot({ path: resolve(scratch, 'bug-hit-board.png') });
  await pause(2100);
  const card = originalColumn.locator('article').filter({ hasText: title });
  const handle = await card.getByRole('button', { name: /^Drag / }).boundingBox();
  const target = await workingColumn.boundingBox();
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  for (let step = 1; step <= 16; step++) {
    await page.mouse.move(handle.x + (target.x + target.width - 35 - handle.x) * step / 16, handle.y + 14);
    await pause(47);
  }
  await page.mouse.up();
  await workingColumn.getByRole('button', { name: title }).waitFor();
  await pause(1200);
  await workingColumn.getByRole('button', { name: title }).click();
  await page.getByRole('dialog').getByRole('heading', { name: title }).waitFor();
  await pause(950);
  await page.getByRole('textbox', { name: 'Write a comment' }).pressSequentially('Reproduced on a narrow viewport. I’ll check the cart retry path.', { delay: 31 });
  await page.getByRole('button', { name: 'Post comment' }).click();
  await page.getByText('Reproduced on a narrow viewport. I’ll check the cart retry path.', { exact: true }).waitFor();
  await pause(1400);
  await page.getByRole('dialog').getByRole('button', { name: 'Close dialog' }).click();
  await page.getByRole('link', { name: 'Team', exact: true }).click();
  await page.getByText('Jamie Park', { exact: true }).waitFor();
  await pause(1600);
  await context.close();
  await video.saveAs(destination);
} finally { await browser.close(); }
console.log(`Demo: ${destination}\nBoard screenshot: ${resolve(scratch, 'bug-hit-board.png')}`);
