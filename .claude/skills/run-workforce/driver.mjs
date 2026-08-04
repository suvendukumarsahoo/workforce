// Playwright driver for the WorkForce app (React+Vite, Supabase backend, no chromium-cli in this
// environment). Exports reusable helpers for logging in, clearing the PunchInGate, navigating,
// and locating this app's un-labeled form fields/rows/sheets — plus a CLI smoke test.
//
// CLI usage (from repo root):
//   DEV_URL=http://localhost:5173 WF_EMAIL=you@co.com WF_PASSWORD=... \
//     node .claude/skills/run-workforce/driver.mjs [menuLabel]
//
// Library usage (import into a one-off test script — see SKILL.md "Writing a new flow"):
//   import { launch, login, handlePunchGate, gotoMenu, fieldInput, fieldSelect, rowByText,
//            closeSheet, shot } from './driver.mjs'

import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SHOT_DIR = fileURLToPath(new URL('./shots', import.meta.url));
mkdirSync(SHOT_DIR, { recursive: true });

export async function shot(page, name) {
  const path = `${SHOT_DIR}/${name}.png`;
  await page.screenshot({ path, fullPage: true });
  console.log('SCREENSHOT:', path);
  return path;
}

export async function launch({ headless = true } = {}) {
  const browser = await chromium.launch({ headless, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  // PunchInGate calls getCurrentPosition — grant + fake a location so it resolves instead of
  // timing out. Coordinates don't need to be real; a real HQ mismatch just triggers the
  // "Outside Approved Range" confirm step, which handlePunchGate() already clicks through.
  await ctx.grantPermissions(['geolocation']);
  await ctx.setGeolocation({ latitude: 20.2961, longitude: 85.8245 });
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  return { browser, ctx, page, consoleErrors };
}

export async function login(page, baseUrl, email, password) {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.getByPlaceholder('you@company.com').waitFor({ timeout: 15000 });
  await page.getByPlaceholder('you@company.com').fill(email);
  await page.getByPlaceholder('••••••••').fill(password);
  await page.getByText('Sign in').click();
  await page.waitForTimeout(2500);
}

// PunchInGate (src/components/PunchInGate.jsx) blocks every page behind an attendance punch-in,
// once per calendar day per user. If the test user already punched in today (real day, real DB),
// this is a no-op. Otherwise it walks: Punch In -> [Outside Range -> Confirm & Punch In] ->
// [Late/On-time -> Continue] -> app.
export async function handlePunchGate(page) {
  for (let i = 0; i < 4; i++) {
    const continueBtn = page.getByText('Continue', { exact: true });
    const confirmBtn = page.getByText('Confirm & Punch In');
    const punchBtn = page.getByText('Punch In', { exact: true });
    const withoutLoc = page.getByText('Punch In Without Location');

    if (await continueBtn.isVisible().catch(() => false)) {
      await continueBtn.click(); await page.waitForTimeout(800); continue;
    }
    if (await confirmBtn.isVisible().catch(() => false)) {
      await confirmBtn.click(); await page.waitForTimeout(1200); continue;
    }
    if (await punchBtn.isVisible().catch(() => false)) {
      await punchBtn.click(); await page.waitForTimeout(1500);
      if (await withoutLoc.isVisible().catch(() => false)) {
        await withoutLoc.click(); await page.waitForTimeout(1200);
      }
      continue;
    }
    break; // gate not present (already punched in today, or not this role) — app loaded
  }
}

// Sidebar (Admin/Manager/etc, WebApp.jsx) or bottom tab bar (Driver/Sales Team) — both render
// menu items as <button> with the menu's plain-text label. Works for either shell.
// .first() matters: the top bar repeats the *current* page's label as its title, so navigating to
// a label that's already active elsewhere on screen (or clicking Products right after landing on
// Products) can otherwise hit a strict-mode "resolved to 2 elements" error.
export async function gotoMenu(page, label) {
  await page.getByText(label, { exact: true }).first().click();
  await page.waitForTimeout(1000);
}

// Sales Team only: menu items beyond the 5 pinned bottom tabs live behind a "More" sheet
// (src/pages/team/TeamApp.jsx MORE_ITEMS). Opens it and taps the named item.
export async function openMoreMenu(page, itemLabel) {
  await page.getByText('More', { exact: true }).first().click();
  await page.waitForTimeout(500);
  await page.getByText(itemLabel, { exact: true }).first().click();
  await page.waitForTimeout(1000);
}

// This app's form fields (src/components/ui.jsx Inp/EntitySheet) render a <label> immediately
// followed by a sibling <input>/<select> with NO id/name/htmlFor/aria-label binding them — so
// Playwright's getByLabel() cannot find them. Use these instead, matching on the visible label
// text (substring match via Playwright's :has-text()).
export function fieldInput(page, labelText) {
  return page.locator(`label:has-text("${labelText}") + input`);
}
export function fieldSelect(page, labelText) {
  return page.locator(`label:has-text("${labelText}") + select`);
}

// Card rows (ui.jsx Card, used for beats/outlets/orders/etc lists) are plain <div onClick>
// with no role/testid — Playwright resolves cursor:pointer as a literal inline style substring.
export function clickableCard(page, index = 0) {
  return page.locator('div[style*="cursor: pointer"]').nth(index);
}

// Finds a table/list ROW by text inside it, not just the text node itself. `div:has-text(text)`
// matches every ancestor div containing that text too (all the way up to the page body), and in
// DOM/document order ancestors come BEFORE descendants — so .last() picks the innermost (deepest)
// matching div, e.g. the product-name <div>. `ancestorLevels` climbs from there to the actual row
// container. Get this number by reading the component once (see SKILL.md Gotchas) — it is NOT
// generic across every list in the app, each screen's markup depth differs.
export function rowByText(page, text, ancestorLevels) {
  const inner = page.locator(`div:has-text("${text}")`).last();
  return ancestorLevels > 0 ? inner.locator(`xpath=ancestor::div[${ancestorLevels}]`) : inner;
}

// ui.jsx Sheet's close button is a bare "×" glyph button (no aria-label). Sheets can stack
// (z-index prop, e.g. Admin dashboard drill-downs) and some flows auto-advance into a NEW sheet
// right after an action (e.g. Distributor Secondary auto-opens the next unvisited outlet after
// checkout) — loop until none remain rather than assuming one close is enough.
export async function closeAllSheets(page, max = 5) {
  for (let i = 0; i < max; i++) {
    const closeBtn = page.getByRole('button', { name: '×' });
    if (!(await closeBtn.isVisible().catch(() => false))) break;
    await closeBtn.click({ force: true });
    await page.waitForTimeout(500);
  }
}

// --- CLI smoke test: login, clear the punch gate, land on the home screen, screenshot it. ---
async function main() {
  const baseUrl = process.env.DEV_URL || 'http://localhost:5173';
  const email = process.env.WF_EMAIL;
  const password = process.env.WF_PASSWORD;
  const menuLabel = process.argv[2]; // optional: also navigate to a menu and screenshot it

  if (!email || !password) {
    console.error('Set WF_EMAIL and WF_PASSWORD (ask the user for test credentials — never');
    console.error('hardcode them here or commit them anywhere in this repo).');
    process.exit(1);
  }

  const { browser, page, consoleErrors } = await launch();
  await login(page, baseUrl, email, password);
  await handlePunchGate(page);
  await shot(page, '00-home');

  if (menuLabel) {
    await gotoMenu(page, menuLabel);
    await shot(page, '01-' + menuLabel.toLowerCase().replace(/\s+/g, '-'));
  }

  const realErrors = consoleErrors.filter(e => !e.includes('400')); // see SKILL.md Gotchas
  console.log('CONSOLE_ERRORS (non-400):', JSON.stringify(realErrors));
  await browser.close();
  console.log('DONE');
}

// Windows paths (backslashes, drive letters) don't string-match a file:// URL directly —
// pathToFileURL() normalizes both sides before comparing. A naive `file://${argv[1]}` check
// silently never matches on Windows, so main() never runs and the script exits 0 with no output.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(e => { console.error('DRIVER_ERROR:', e); process.exit(1); });
}
