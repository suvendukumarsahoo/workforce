---
name: run-workforce
description: Build, run, and drive the WorkForce app (React+Vite, Supabase backend). Use when asked to start WorkForce, run it, take a screenshot of its UI, log in and click through a flow, or verify a change actually works in the browser.
---

WorkForce is a React+Vite SPA over a live Supabase backend (no local DB — every environment,
including this one, talks to the same real Supabase project). There is no `chromium-cli` in this
environment, so it's driven via a custom Playwright driver at
`.claude/skills/run-workforce/driver.mjs` — start the dev server, then use the driver (CLI or as a
library) to log in and click through the app headlessly. All paths below are relative to the repo
root (`c:/Users/workforce`).

## Prerequisites

Node/npm already on PATH (checked via `node -v` — this repo needs no OS packages, it's pure
JS/Vite). Playwright is a committed **devDependency** (not a throwaway scratchpad install) so
`npm install` restores it from `package-lock.json` instead of re-resolving from the registry every
session:

```bash
npm install
npx playwright install chromium
```

The Chromium binary downloaded by `playwright install` is cached at
`%USERPROFILE%\AppData\Local\ms-playwright` — **outside** any per-session scratchpad, so once
downloaded it persists across sessions on the same machine. The second command above is near-instant
on a repeat run (it detects the cache and does nothing) — don't skip it, but don't expect it to be
slow every time either.

## Setup

Nothing beyond the two commands above. `.env.local` (gitignored, `*.local`) already has
`VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` — the app is fully configured out of the box.

**Test login credentials are NOT stored anywhere in this repo** (it's a public GitHub repo — see
CLAUDE.md's own flagged risk about that). Ask the user for a test account's email/password each
time; never hardcode or commit credentials into this skill, the driver, or a throwaway script.

## Run (agent path)

1. **Start the dev server and capture its real port.** Vite defaults to 5173 but auto-increments if
   that port is already bound by a stale process from an earlier session — always read the actual
   `Local:` line rather than assuming 5173.

```bash
npm run dev > /tmp/wf-dev.log 2>&1 &
timeout 30 bash -c 'until grep -q "Local:" /tmp/wf-dev.log; do sleep 1; done'
grep "Local:" /tmp/wf-dev.log   # → http://localhost:5173/ (or 5174, 5175, ...)
```

2. **Run the driver.** As a one-shot CLI smoke test:

```bash
DEV_URL=http://localhost:5173 WF_EMAIL=<test-admin-email> WF_PASSWORD=<test-admin-password> \
  node .claude/skills/run-workforce/driver.mjs [optional-menu-label]
```

This logs in, clears the attendance PunchInGate (see Gotchas), screenshots the home screen, and —
if a menu label is given (e.g. `Products`, exact sidebar/bottom-tab text) — navigates there and
screenshots that too. Screenshots land in `.claude/skills/run-workforce/shots/`. Prints any
console errors that aren't the known pre-existing `400`s (see Gotchas).

3. **For anything beyond a single screen** (filling a form, clicking through a multi-step flow,
   verifying a specific change), write a throwaway script that imports the driver's exported
   helpers rather than re-deriving selectors from scratch — this is the main payoff of this skill.
   Put the script in your scratchpad, not the repo:

```js
import { launch, login, handlePunchGate, gotoMenu, openMoreMenu, fieldInput, fieldSelect,
         rowByText, clickableCard, closeAllSheets, shot }
  from 'file:///c:/Users/workforce/.claude/skills/run-workforce/driver.mjs';

const { browser, page, consoleErrors } = await launch();
await login(page, 'http://localhost:5173', WF_EMAIL, WF_PASSWORD);
await handlePunchGate(page);
await gotoMenu(page, 'Products');           // sidebar (Admin/Manager/etc) or bottom tab (Driver/Team)
// or, Sales Team only: await openMoreMenu(page, 'Distributor Secondary');

await fieldInput(page, 'Product name').fill('Test Product');
await fieldSelect(page, 'Category').selectOption({ index: 1 });
await page.getByText('Save', { exact: true }).click();
await shot(page, 'result');
await browser.close();
```

Note the `file:///` prefix on the import path — a bare Windows path (`c:/...`) is rejected by
Node's ESM loader (`ERR_UNSUPPORTED_ESM_URL_SCHEME`).

| export | what it does |
|---|---|
| `launch()` | headless Chromium, geolocation pre-granted (Bhubaneswar coords) so the PunchInGate's location prompt resolves instead of hanging |
| `login(page, baseUrl, email, password)` | fills the login form, submits |
| `handlePunchGate(page)` | clears the once-a-day attendance gate if it's showing (no-op if already punched in today) |
| `gotoMenu(page, label)` | clicks a sidebar (desktop shells) or bottom-tab (Driver/Team) menu item by its exact label text |
| `openMoreMenu(page, itemLabel)` | Sales Team only — opens the "More" sheet, taps the named item |
| `fieldInput(page, labelText)` / `fieldSelect(page, labelText)` | locates this app's un-bound `<label>`+`<input>`/`<select>` form fields (see Gotchas) |
| `clickableCard(page, index)` | nth clickable list-row `Card` (beats/outlets/orders/etc) |
| `rowByText(page, text, ancestorLevels)` | finds a list row containing given text, climbing N ancestor `<div>`s — read the component once to get the right N (see Gotchas) |
| `closeAllSheets(page, max)` | closes stacked/auto-reopening modal Sheets |
| `shot(page, name)` | full-page screenshot to `.claude/skills/run-workforce/shots/<name>.png` |

Stop the dev server when done:

```bash
pid=$(netstat -ano | grep ":5173 " | grep LISTENING | awk '{print $NF}' | head -1)
[ -n "$pid" ] && powershell.exe -NoProfile -Command "Stop-Process -Id $pid -Force"
```

## Run (human path)

`npm run dev`, open the printed `localhost:` URL in a real browser, Ctrl+C to stop. Nothing
headless-specific to worry about — same app, same Supabase backend.

## Test

```bash
npm run build   # vite build — catches type/syntax/bundling errors
npm run lint    # eslint . — repo has ~66 pre-existing errors unrelated to any one change;
                # scope to touched files instead: npx eslint <changed-file-1> <changed-file-2>
```

No unit/integration test suite exists in this repo — `vite build` + scoped `eslint` + the driver
above (actually clicking through the change) is the full verification loop.

## Gotchas

- **Every page is gated behind a once-a-day attendance punch-in** (`PunchInGate.jsx`) for every
  role. A script that doesn't call `handlePunchGate()` right after `login()` will hang waiting for
  elements that are actually rendering behind the gate. It's a no-op if the test user already
  punched in today (real day, real DB) — safe to always call.
- **Form fields have no `id`/`name`/`htmlFor`/`aria-label` binding label to input** (`ui.jsx`'s
  `Inp`/`EntitySheet`) — Playwright's `getByLabel()` will never find them. Use `fieldInput`/
  `fieldSelect` (CSS `label:has-text(...) + input`) instead.
- **List rows (`Card`) are plain `<div onClick>` with no role/testid.** `clickableCard` matches on
  the literal `cursor: pointer` inline style Card sets when given an `onClick`. For a *specific*
  row (not just "the first one"), use `rowByText` — but note `div:has-text(X)` matches every
  ancestor div containing that text too, and ancestors appear *before* descendants in DOM order, so
  `.last()` (already inside `rowByText`) is what picks the innermost/deepest match. The number of
  `ancestor::div[N]` levels to climb from there to the actual row container is NOT consistent
  across screens — read the component once (row markup depth varies) rather than guessing.
- **Some flows auto-advance into a brand-new Sheet right after an action** (e.g. Distributor
  Secondary's cart auto-opens the next unvisited outlet immediately after checkout). A single
  close-button click can leave a *different* sheet open and blocking the next click with an
  "intercepts pointer events" error — use `closeAllSheets()` (loops until none remain), not one
  click.
- **The Vite dev port drifts.** A stale process from an earlier session can still hold 5173, Vite
  silently increments to 5174/5175/etc. Always read the actual `Local:` line from the dev server's
  own log, never hardcode the port.
- **Two pre-existing `400` console errors are expected noise, not a regression:** the legacy
  `attendance` table (superseded by `attendance_punches`, columns not queryable, still called
  unconditionally on every page load — see CLAUDE.md "Deferred/Known Issues") and occasionally the
  `notifications` poll. The driver's CLI smoke test already filters `400`s out of what it reports;
  do the same in any ad hoc script rather than chasing these as new bugs.
- **On Windows, a naive `import.meta.url === 'file://' + process.argv[1]` "is this the CLI
  entrypoint" check silently never matches** (backslashes / drive-letter format mismatch) — the
  script loads, exports resolve fine, but `main()` never runs and the process exits 0 with zero
  output, which looks exactly like "nothing went wrong" instead of an error. `driver.mjs` uses
  `pathToFileURL(process.argv[1]).href` instead. Copy that pattern if you add your own CLI entry
  point to a new script.
- **Credentials are never in this repo.** Ask the user each session; pass them via `WF_EMAIL`/
  `WF_PASSWORD` env vars or inline in a scratchpad-only script, never a committed one.

## Troubleshooting

- **Script exits `0` immediately, no screenshots, no console output**: the Windows ESM
  entrypoint-detection bug above. Check whatever script you're running uses `pathToFileURL`, not a
  raw string comparison.
- **`locator.click: Timeout 30000ms exceeded` waiting for a button/label that should be on-screen
  after clicking a list row**: the row click probably didn't register — `Card` rows aren't links or
  buttons, `page.getByText(rowText).click()` can resolve to a text node that doesn't receive the
  click the way the wrapping `onClick` div does. Use `clickableCard`/`rowByText` instead.
- **`strict mode violation: ... resolved to N elements`** on a locator built from
  `div:has-text(...)`: you matched every ancestor div containing that text, not just the row. Add
  `.last()` (innermost match) before climbing ancestors, or scope more tightly.
- **`<div>… intercepts pointer events` / retrying click action, eventually times out**: something
  else (usually a Sheet, sometimes a toast) is still visually on top. Call `closeAllSheets()` before
  the click, or `{ force: true }` if it's a toast that will disappear on its own but Playwright's
  actionability check is being overly cautious about it.
- **`ERR_UNSUPPORTED_ESM_URL_SCHEME` importing the driver from a scratchpad script**: the import
  specifier is a bare Windows path (`c:/Users/...`). Prefix it `file:///c:/Users/...`.
