import { test, expect, type Page } from '@playwright/test';

const recipient = 'custodian@castalia.institute';
const endpoint = 'https://rsvp.example.test/submit';
async function openEvent(page: Page, config: Record<string, unknown>) {
  await page.route('**/MSS.ics*', route => route.fulfill({
    contentType: 'text/calendar',
    body: ['BEGIN:VCALENDAR', 'VERSION:2.0', 'BEGIN:VEVENT',
      'UID:martinstag-rsvp-fixture@example.test', 'DTSTART;VALUE=DATE:20261110',
      'DTEND;VALUE=DATE:20261111', 'SUMMARY:Martinstag Lantern Evening',
      'DESCRIPTION:Lantern walk and stories.\\n\\nIcon: 🏮\\nCategory: cultural',
      'END:VEVENT', 'END:VCALENDAR'].join('\r\n'),
  }));
  await page.route('**/rsvp.json', route => route.fulfill({ json: config }));
  await page.goto('/2026/11?kiosk=1&presence=0');
  await page.getByText('Martinstag Lantern Evening', { exact: true }).click();
}
async function fill(page: Page) {
  await page.getByRole('button', { name: 'RSVP to our gathering' }).click();
  await page.getByLabel('Your name', { exact: true }).fill('Guest & Family');
  await page.getByLabel('Your email', { exact: true }).fill('guest@example.test');
  await page.getByLabel('Party size, including you').fill('3');
  await page.getByLabel('Note to the host (optional)').fill('We will bring lanterns & cider.');
}

test('email mode prepares the correct occurrence without claiming delivery', async ({ page }) => {
  await openEvent(page, { mode: 'email', recipient });
  await fill(page);
  await page.getByRole('button', { name: 'Open email RSVP' }).click();
  const link = page.getByRole('link', { name: 'open the RSVP email', exact: true });
  const href = await link.getAttribute('href');
  expect(href).toBeTruthy();
  const url = new URL(href!);
  expect(url.pathname).toBe(recipient);
  expect(url.searchParams.get('subject')).toContain('Martinstag Lantern Evening — 2026-11-10');
  expect(url.searchParams.get('body')).toContain('Party size (including me): 3');
  expect(url.searchParams.get('body')).toContain('Guest & Family');
  expect(url.searchParams.get('body')).toContain('We will bring lanterns & cider.');
  await expect(page.getByText('Your RSVP was received. Thank you!')).toHaveCount(0);
  await expect(page.getByRole('status')).toContainText('Send it in your email app to finish');
});

test('endpoint mode sends one RSVP and disables edits until acknowledged', async ({ page }) => {
  let requests = 0;
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route(endpoint, async route => {
    requests++;
    const data = route.request().postDataJSON();
    expect(data.event).toBe('Martinstag Lantern Evening');
    expect(data.date).toBe('2026-11-10');
    expect(data.event_uid).toBeTruthy();
    expect(data.email).toBe('guest@example.test');
    expect(data.guests).toBe(3);
    await pending;
    await route.fulfill({ json: { ok: true } });
  });
  await openEvent(page, { mode: 'endpoint', recipient, endpoint });
  await fill(page);
  await page.getByRole('button', { name: 'Send RSVP', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sending…' })).toBeDisabled();
  await expect(page.getByLabel('Your email', { exact: true })).toBeDisabled();
  await expect(page.getByText('Your RSVP was received. Thank you!')).toHaveCount(0);
  release();
  await expect(page.getByRole('status')).toHaveText('Your RSVP was received. Thank you!');
  expect(requests).toBe(1);
});

test('unacknowledged submission shows an error and permits an explicit retry', async ({ page }) => {
  let requests = 0;
  await page.route(endpoint, async route => {
    requests++;
    await route.fulfill({ status: requests === 1 ? 500 : 200, json: { ok: requests !== 1 } });
  });
  await openEvent(page, { mode: 'endpoint', recipient, endpoint });
  await fill(page);
  await page.getByRole('button', { name: 'Send RSVP', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('We couldn’t confirm');
  await expect(page.getByText('Your RSVP was received. Thank you!')).toHaveCount(0);
  await expect(page.getByLabel('Your name', { exact: true })).toHaveValue('Guest & Family');
  expect(requests).toBe(1);
  await page.getByRole('button', { name: 'Send RSVP', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Your RSVP was received. Thank you!');
  expect(requests).toBe(2);
});

test('declining sends zero guests and invalid fields prevent submission', async ({ page }) => {
  let requests = 0;
  await page.route(endpoint, async route => {
    requests++;
    expect(route.request().postDataJSON().guests).toBe(0);
    expect(route.request().postDataJSON().response).toBe('Not going');
    await route.fulfill({ json: { ok: true } });
  });
  await openEvent(page, { mode: 'endpoint', recipient, endpoint });
  await page.getByRole('button', { name: 'RSVP to our gathering' }).click();
  await page.getByRole('button', { name: 'Send RSVP', exact: true }).click();
  expect(requests).toBe(0);
  await page.getByLabel('Your name', { exact: true }).fill('Guest');
  await page.getByLabel('Your email', { exact: true }).fill('guest@example.test');
  await page.getByRole('combobox', { name: 'Your response', exact: true }).selectOption('no');
  await expect(page.getByLabel('Party size, including you')).toHaveCount(0);
  await page.getByRole('button', { name: 'Send RSVP', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Your RSVP was received. Thank you!');
  expect(requests).toBe(1);
});

test('RSVP is absent when the event is not enabled', async ({ page }) => {
  await openEvent(page, { mode: 'email', recipient, eventTitles: [] });
  await expect(page.getByRole('button', { name: 'RSVP to our gathering' })).toHaveCount(0);
});

test('an insecure endpoint is not enabled', async ({ page }) => {
  await openEvent(page, { mode: 'endpoint', recipient, endpoint: 'http://rsvp.example.test/submit' });
  await expect(page.getByRole('button', { name: 'RSVP to our gathering' })).toHaveCount(0);
});

test('sharing opens the exact event occurrence in a regular calendar', async ({ page }) => {
  await openEvent(page, { mode: 'email', recipient });
  const link = page.getByRole('link', { name: 'Link to this event', exact: true });
  const href = await link.getAttribute('href');
  expect(href).toBeTruthy();
  const url = new URL(href!);
  expect(url.pathname).toBe('/2026/11');
  expect(url.searchParams.get('event')).toBe('martinstag-rsvp-fixture@example.test');
  expect(url.searchParams.get('date')).toBe('2026-11-10');
  expect(url.searchParams.has('kiosk')).toBe(false);
  await page.goto(href!);
  await expect(page.getByRole('dialog').getByText('Martinstag Lantern Evening', { exact: true })).toBeVisible();
  await expect(page.getByRole('dialog').getByText('November 10, 2026', { exact: false })).toBeVisible();
  // Clipboard failure still exposes a selectable link.
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true }));
  await page.getByRole('button', { name: 'Copy event link' }).click();
  await expect(page.getByLabel('Event sharing link')).toHaveValue(href!);
});
