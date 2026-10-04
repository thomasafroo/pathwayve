# PathWayve progress

Last updated: **October 3, 2026** (America/Vancouver).
Baseline: **`09cd4da`**, plus the current uncommitted Gemini/SQL implementation.

## Current checkpoint

Map integration corrected: generated runs now persist a display-only `map_trip`
snapshot with endpoint coordinates, scheduled stops and actual route polylines.
The map uses this snapshot when a timed/task schedule has no editable workspace,
including when reopening SQL saves. Older saves lack this geometry and need a
new generation; the UI explains this. Appointment constraints remain in saved
items and are not passed into manual editing controls.

Clarification fix: subsequent prompts now include Gemini's clarification question,
so a reply such as "yes" retains its meaning. SDK AbortError/TimeoutError now
receive one bounded retry and a specific timeout message instead of an invalid-JSON
message. Lint/types, **50 tests**, and both chat browser scenarios passed, including
"schedule for tomorrow?" → "yes". This does not establish live model reliability.

Routing correction: the shared `computeLeg` implementation was unchanged apart
from its export. Live Google testing returned zero routes for SFU → SFU and six
routes for SFU → UBC. Added a schedule-specific wrapper that treats identical
locations as zero travel, so endpoint activities do not fail the entire run.
Known route errors now retain their code/message. Gemini instructions explicitly
preserve named venues and prioritize the current prompt over older context.
Lint, TypeScript, **49 tests**, and production build passed after this correction.

Latest provider check: Google returned `503 UNAVAILABLE` with an explicit
high-demand message even for a tiny structured request on the configured model.
An alternate model diagnostic timed out; the configured model was kept unchanged.
Added one bounded automatic retry for 503/504 and a separate quota message for 429. After this fix, lint, TypeScript and all **46 tests** passed. The seven
browser tests and production build below refer to the preceding implementation.

**The desktop trip workspace and geographic provider integration are implemented.**
Users can search for endpoints and places, choose their own stops, plan routes,
edit their itinerary, attach activities, undo changes, and export JSON.

The new bottom-centered chat calls **Gemini → validated JSON → Places/Routes → SQL**.
It saves schedule intentions and calculated runs, including unscheduled activities,
and reopens snapshots in the same browser. The existing manual planner remains available.
Local persistence uses file-backed PostgreSQL through PGlite; remote PostgreSQL is
supported through an environment URL and migration. See [AI schedules](docs/AI-SCHEDULES.md).

Live Gemini verification is partial: a small structured response succeeded with
`gemini-3.8-flash`, but full schedule requests returned service-unavailable errors.
The complete live generation/save flow is not yet verified. Real Places search
succeeded; a complete live map/route scenario remains outstanding.

## Completed

### Foundation

- [x] Next.js App Router, React, strict TypeScript, and Tailwind setup.
- [x] Shared Zod schemas for trip requests, places, routes, and trip state.
- [x] Versioned workspace, activities, and atomic modification batch contracts.
- [x] Environment template, secret exclusions, ESLint, Prettier, and test tooling.
- [x] GitHub Actions workflow, PR template, architecture notes, and team guide.
- [x] Frontend/geography changes merged through PR #1 (`09cd4da`).

### Desktop planning and discovery

- [x] Desktop map workspace with selected markers and itinerary synchronization.
- [x] Arbitrary endpoint and stop search through `/api/search`; fixed endpoint dropdowns replaced.
- [x] Explicit search submission rather than paid requests on every keystroke.
- [x] Up to six user-selected stops with durations and required inclusion by default.
- [x] Optional suggestions with best-match, highest-rated, and closest sorting.
- [x] Session favourites, budget, interest tags, and free-text preference fields.
- [x] Transport selection and routing priorities, including less walking/fewer transfers.
- [x] Timezone-aware date defaults, DST handling, and explicit windows up to 31 days.
- [x] Direct routes when the user explicitly selects no stops.
- [x] Separate Maps provider mode so geography can run without Gemini.
- [x] Route geometry, directions, transit line details, distances, and durations.
- [x] Clearly labeled sample data; live provider failures do not silently use fixtures.

### Editing and adaptation

- [x] Add, remove, move, and change the duration of stops; lock/unlock controls.
- [x] Atomic JSON modification batches with trip/version validation.
- [x] `/api/trip-edit` recalculates live route legs for route-affecting edits.
- [x] Deadline validation and required/locked-stop conflict handling.
- [x] Attach user activities to stops, enforce duration capacity, and mark completion.
- [x] Activities move with their stop; AI-task JSON is renderable without an executor.
- [x] Undo through workspace snapshots and download trip JSON.
- [x] Demo rain, delay, and earlier-finish event handling through `/api/replan`.

## Verification record

Current implementation checks are recorded below. Browser provider responses are
mocked; SQL tests run real PostgreSQL through PGlite.

| Check                              | Current evidence                                                                                                  |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Unit/API/provider tests            | 42 passed across five files; includes Gemini validation, constraints, SQL rollback, ownership and deduplication   |
| Covered invariants                 | Dates/DST, explicit selections, required/locked stops, atomic edits, activity capacity, and mocked search/routing |
| Production build                   | Passed for the Gemini/SQL implementation                                                                          |
| ESLint / TypeScript                | Passed for the Gemini/SQL implementation                                                                          |
| Desktop browser suite              | Seven passed, including two chat/save/reopen/retry scenarios                                                      |
| Mobile browser support             | Current milestone is desktop-only; mobile project removed from Playwright configuration                           |
| Visual review                      | Saved schedule and bottom-centered composer screenshot reviewed at 1280 × 720                                     |
| Progress document formatting       | Checked when updating this file                                                                                   |
| Real Places/Routes and browser map | Places search succeeded; complete live map/routing flow still unverified                                          |
| Hosted deployment / remote CI      | Not verified                                                                                                      |

The desktop browser scenarios cover sample planning/replanning, invalid dates,
editing/activities/undo/export, rejected edits/dialog keyboard behavior, and
arbitrary endpoint selection with ranked results and favourites. They force demo
geography; one scenario mocks search responses.

The initial Windows browser-test run needed manual server cleanup. Recheck
shutdown if that behavior recurs.

## Next: verify the geographic planning milestone

Target: **search for real endpoints, explicitly select real stops, then render a
feasible route and verify an itinerary edit updates its travel legs.**

- [ ] Confirm shared Google Cloud project, billing, enabled APIs, and key restrictions.
- [ ] Confirm ignored environment configuration has separate server and browser Maps keys; never record values here.
- [ ] Verify real endpoint/stop search, candidate details, and explicit selection.
- [ ] Verify WALK, DRIVE, and TRANSIT results, map geometry, and routing priorities.
- [ ] Verify live add/move/remove/duration edits recalculate routes and enforce deadlines.
- [ ] Record one complete live SFU-to-downtown trip with real chosen stops.
- [x] Run build, lint, typecheck, and all seven desktop browser scenarios after integration.
- [ ] Confirm all four teammates can clone, install, and run the workspace.
- [ ] Confirm remote CI and deploy a shareable demo.

Configuration now separates geography from AI: a server Maps key enables live
search/routing automatically unless `MAPS_DATA_MODE=demo` is set. Explicit
`MAPS_DATA_MODE=live` requires the key. A browser key alone enables the map, not
server search/routes. The manual flow needs no Gemini key; keep `DATA_MODE=demo`
for this milestone. See [frontend setup](docs/FRONTEND.md).

Before exposing paid endpoints publicly, add authentication and a shared rate
limiter, and confirm the host supports the endpoint execution budget.

## Next: connect AI and real adaptive context

- [x] Generate new schedules with Gemini structured output and strict server validation.
- [x] Persist schedules, intended activities and calculated runs transactionally in SQL.
- [x] Add bottom-centered prompt UI with clarification, retry, saved list and JSON export.
- [x] Preserve unscheduled tasks, appointment constraints and locked positions.
- [ ] Verify a complete live Gemini/Places/Routes/save request when provider availability permits.
- [ ] Refresh saved route calculations and rebase schedules onto another day.
- [ ] Interpret edits to existing schedules as validated modification commands.
- [ ] Implement a weather provider and obtain real forecasts.
- [ ] Use forecast timing to inform outdoor/indoor scheduling.
- [ ] Generate live replan commands using the existing atomic modification engine.
- [ ] Show what changed and why after a live replan.
- [ ] Interpret natural-language requests such as “Keep the bookstore; finish by 6.”

The chat interprets prompts into new saved schedules. Automatic live replanning
and AI modification commands are not implemented. Manual live edits through
`/api/trip-edit` remain separate from saved SQL snapshots and demo `/api/replan` events.

## Stretch backlog

- [ ] ElevenLabs voice input/output.
- [x] PostgreSQL persistence for schedules, activities and calculated runs.
- [ ] Accounts, favourites, event persistence and hosted database deployment.
- [ ] JSON import (export is implemented).
- [ ] TransLink GTFS/GTFS-Realtime context.
- [ ] Route-corridor discovery and travel-detour-aware ranking.
- [ ] Automatic task placement into suitable stops or transit/free-time contexts.
- [ ] AI-task execution during travel (schema/rendering foundation exists).
- [ ] Overnight breaks, accommodation, and day-by-day multi-day scheduling.
- [ ] Active-trip navigation and tracking.
- [ ] Mobile product layout and browser coverage.
- [ ] Feedback-driven personalization and social/local intelligence.

## Ownership

Assignments remain unconfirmed; fill in teammate names when agreed.

| Area             | Teammate   | Main files                                                                                 | Next deliverable                        |
| ---------------- | ---------- | ------------------------------------------------------------------------------------------ | --------------------------------------- |
| AI / integration | Unassigned | `src/lib/gemini.ts`, `src/lib/planner.ts`, `src/types/`                                    | Connect AI to current contracts         |
| Maps / routes    | Unassigned | `src/components/Map.tsx`, `src/lib/routes.ts`                                              | Verify live map, modes, and route edits |
| Places / context | Unassigned | `src/lib/place-search.ts`, `src/lib/places.ts`, `src/lib/weather.ts`, `src/lib/transit.ts` | Verify search, then add forecasts       |
| Frontend / UX    | Unassigned | `src/components/`, `src/lib/trip-workspace.ts`, `src/app/globals.css`                      | Verify merged desktop flows             |

## Known limits and open issues

- Gemini powers the new chat flow; manual discovery ranking remains a disclosed heuristic.
- Demo venues are fictional; dashed route lines and travel estimates are not navigation directions.
- `/api/replan` still returns 501 for live trips; weather/transit event controls are simulated.
- Chat schedules persist in SQL and reopen with a 30-day anonymous browser cookie.
  Manual workspace edits/favourites remain tab-local; account login is not implemented.
- Reopening saved schedules displays the last calculation without refreshing routes.
- Tasks needing an unassigned place or unverified venue facilities remain unscheduled.
- Version validation compares the submitted workspace, not authoritative shared database state.
- Search/ranking uses destination proximity and straight-line distance, not actual minimum detour.
- Opening hours, quietness, wifi, accessibility, and budget suitability are not guaranteed.
- Multi-day date ranges are accepted, but overnight/day-by-day planning is not implemented.
- Routes are planning estimates, not active navigation or live tracking.
- Weather/transit contracts and AI-task rendering do not imply live feeds or AI execution.
- The setup dependency audit recorded one underlying development lint advisory,
  surfaced as five high-severity entries; it was not rerun here. See [dependency notes](docs/DEPENDENCIES.md).
- Cloud configuration, live credentials, deployment, branch protection, and remote CI remain unverified here.

## Progress log

| Date       | Update                                          | Evidence / remaining work                                                                              |
| ---------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| 2026-10-03 | Repository foundation and demo implemented      | `be9c477`; initial build/lint/types, 9 tests, and desktop/mobile scaffold flows passed                 |
| 2026-10-03 | Progress tracker created                        | Initial roadmap and verification record                                                                |
| 2026-10-03 | Desktop workspace and Google geography added    | `0dac2c6`; discovery, chosen stops, route editing, activities, undo/export, and expanded contracts     |
| 2026-10-03 | Frontend PR merged                              | `09cd4da`, PR #1 from `Frontend`                                                                       |
| 2026-10-03 | Tracker reconciled with merged code             | 27 unit/API/provider tests passed; live verification and AI integration remain next                    |
| 2026-10-03 | Gemini JSON → SQL and chat composer implemented | 42 unit/integration tests, seven browser tests, lint/types/build; full live Gemini request unavailable |

## Keeping this file current

After each milestone or merged PR, update checkboxes, verification evidence, open
issues, and the log. Include a commit/PR reference. Distinguish **implemented**,
**verified with mocks**, and **verified live**. Do not carry old check results
forward as proof of new code, and never include secrets.

Related: [README](README.md) · [Frontend/API setup](docs/FRONTEND.md) ·
[Team workflow](CONTRIBUTING.md) · [Architecture](docs/ARCHITECTURE.md).
