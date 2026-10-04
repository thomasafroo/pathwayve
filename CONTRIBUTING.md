# Contributing to PathWayve

Contributions should make planning easier to understand, adjust, or trust.
Focused fixes, accessible interface improvements, clearer documentation, and
reproducible issue reports are all useful.

## Get set up

Follow the [local setup guide](docs/GETTING-STARTED.md). Use Node.js 22.14+ and npm;
run `npm ci` after pulling dependency changes. Keep credentials in ignored local
environment files.

Start a short-lived branch from an up-to-date `main`, with a clean or safely saved
working tree:

```sh
git switch main
git pull --ff-only
git switch -c feature/your-change
```

For larger changes, open an issue describing the user problem and proposed scope
before investing in implementation.

## Make a focused change

- Keep UI, API, and documentation changes aligned with the resulting behavior.
- Validate external input at the boundary; preserve server-only provider modules.
- Coordinate changes to shared contracts in `src/types/` with their consumers.
- Keep live and demo data distinguishable. Provider failures must not silently
  become successful sample responses.
- Preserve schedule ownership and pending-save behavior when changing auth flows.
- Include keyboard operation, small screens, and reduced motion in UI review.
- Commit `package-lock.json` when intentionally changing dependencies.

## Verify the behavior

```sh
npm run check
npm run build
npm run format:check
```

For interaction changes, install Chromium with `npx playwright install chromium`
and run the relevant Playwright tests, or the full suite with `npm run test:e2e`.
Cover observable behavior and meaningful failure cases. Explain which checks ran
and which checks require unavailable provider credentials.

Format changed files with Prettier; avoid unrelated repository-wide formatting.
CI checks formatting, lint, types, tests, build, and browser workflows.

## Submit for review

Use the pull-request template to explain the user-visible change, validation,
and setup or migration requirements. Include before/after screenshots for visible
UI changes. Keep unrelated refactors separate so the change is easy to review and
revert. Request review before merging.

## Report a problem

Use the bug report form for failures and the feature request form for ideas.
Include browser, device, demo/live mode, and a minimal example. Remove credentials,
personal locations, and private calendar details from logs and screenshots.
Do not post exploitable security details in public issues; use GitHub's private
vulnerability reporting if enabled, or contact a maintainer privately.
