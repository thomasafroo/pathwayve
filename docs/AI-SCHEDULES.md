# Prompt → Gemini JSON → SQL

The bottom-centered composer sends a prompt to `POST /api/schedules`. It generates
a **new schedule**, even if an existing manual trip supplies context. Saved
schedules can be opened from the composer after refresh in the same browser.

## Pipeline

1. Validate the prompt (up to 4,000 characters), timezone, request UUID, and optional
   current trip context. Identify the browser through an HttpOnly session cookie.
2. Ask Gemini for JSON matching `generatedScheduleSchema`. The model returns a
   schedule and activity intentions, or a clarification question if endpoints
   are missing. It never produces executable SQL.
3. Apply full Zod validation, including timing rules and unique sequence positions.
   The schema sent to Gemini is a simplified supported subset; local validation
   remains authoritative.
4. Resolve endpoint/activity search queries through Places. Compute route legs,
   allow waiting before appointments, check time windows and the final destination.
5. Assign server-generated UUIDs, ownership, versions, and timestamps. Classify
   every activity as placed or unscheduled. Preserve all activities in the save.
6. Insert the schedule, items, and run in **one parameterized SQL transaction**.
   The browser's request UUID prevents duplicate saves when the same request is
   retried. Model/network failures before save do not leave partial rows.
7. Display the saved result. Flexible visit-only feasible plans also populate the
   existing map/itinerary workspace. Fixed appointments and standalone tasks use
   the saved details view because the older workspace cannot represent all their
   constraints safely.
   All successfully calculated routes also save a display-only `result.map_trip`
   snapshot containing coordinates and route geometry. The map reads this snapshot
   for timed schedules and reopened saves. Older saves without it require a new
   generation to show a route; no geometry is invented from place IDs.

## JSON and tables

`src/types/schedule.ts` defines both model output and persisted fields.

- Model output: `schema_version`, `clarification`, `schedules`, `schedule_items`.
- Model location fields are `origin_query`, `destination_query`, `place_query`:
  natural-language searches, not invented provider IDs.
- Saved document: `schema_version`, `schedules`, `schedule_items`, `schedule_runs`.
- Database namespace: `pathwayve.schedules`, `pathwayve.schedule_items`,
  `pathwayve.schedule_runs`. The migration includes foreign keys, CHECK constraints,
  uniqueness constraints, and indexes. Preferences, requirements, and run results
  are JSONB; searchable identity/timing/priority fields are normal columns.
- `user_id` is derived on the server from the session, never accepted from Gemini
  or a client JSON document. This is anonymous browser ownership, not account login.
- `request_id` is a database-only idempotency field. `place_query` is retained on
  saved items to preserve unresolved intent.

`feasible` means the proposed order meets required constraints and the destination
deadline. Optional/preferred activities may remain unscheduled. `infeasible`
means required or locked constraints could not be satisfied; `failed` means the
route provider failed. No fake live route is substituted. These statuses describe
the proposed order, not a proof that no other ordering could work.

## Local setup

Configure `GEMINI_API_KEY` in ignored `.env` or `.env.local`. The configured model
is `gemini-3.8-flash`; change `GEMINI_MODEL` to a model available to your account.
The old `gemini-2.5-flash` returned an account-availability error during setup.
The composer always calls Gemini; `DATA_MODE=demo` does not fake AI output.
`MAPS_DATA_MODE` still controls geographic providers independently.

Without a database URL, development uses PGlite, embedded PostgreSQL stored in
`.pathwayve/database`. The directory is ignored by Git and initialized automatically.
It persists across server restarts. Only one development server/process should use
that directory at a time. Browser tests use a separate directory.

Production requires `DATABASE_URL` or `TIGER_DATABASE_URL`. Configure your existing
Postgres database and run:

```sh
npm run db:migrate
```

The migration adds the dedicated `pathwayve` schema without dropping existing data.
It is not run automatically against remote databases. No hosted database was
provisioned as part of this change. Use a connection string with your provider's
required TLS configuration; certificate verification is not disabled by the app.

## Endpoints

| Endpoint                 | Purpose                                                                   |
| ------------------------ | ------------------------------------------------------------------------- |
| `POST /api/schedules`    | Prompt + `timeZone` + `requestId` + optional `context`; generate and save |
| `GET /api/schedules`     | Latest 30 schedule summaries belonging to the current browser             |
| `GET /api/schedules/:id` | Read the saved JSON document for an owned schedule                        |

## Current boundaries

- The anonymous cookie expires after 30 days. Clearing it or switching browsers
  loses access to that browser's saves; add account authentication for long-term,
  cross-device reuse. Paid public endpoints still need shared rate limiting.
- Reopening reads the saved calculation; it does not refresh routes, run Gemini,
  or rebase appointments onto a new day. Ask for a new schedule to calculate again.
- Manual workspace edits do not write back to saved SQL snapshots.
- Tasks without a place remain unscheduled. Requested quietness/wifi/seating is
  not inferred from Places results. Task placement inside existing visits is future work.
- Place matching selects the first search result, which users must review. It is
  not a guarantee of opening hours, route-corridor suitability, or availability.
- Up to six distinct visited places and twelve total intentions are supported.
- Provider calls have bounded individual timeouts; deployments must support the
  endpoint's execution budget. Failed prompts remain in the composer for retry.
- Gemini overload/timeouts (503/504) get one automatic retry after a short delay.
  Quota/rate-limit failures (429) display a separate message and are not retried
  automatically. No model switch or fabricated schedule is used on failure.
- Database migrations beyond the initial schema need new numbered migration files.

## Verification

Unit tests exercise model JSON validation, missing-key errors, fixed appointments,
unscheduled tasks, failed routes, SQL round trips, ownership isolation, parameterized
values, transactional rollback, and duplicate saves. PGlite tests execute real
PostgreSQL SQL in memory. Browser tests cover composer placement, submission,
clarifications, retries, and reopening saved results with mocked external responses.

## Sidebar constraints and route-area discovery

Chat reads the current left-panel form when Send is pressed, even before Create
itinerary. `POST /api/schedules` now accepts `constraints` alongside the older
`context` hint. Constraints include selected provider IDs/coordinates, stay times,
endpoints, transportation, routing priority, explicit dates, preferences, and
`routeRadiusMeters` (default 1,000 m; UI offers 500 m, 1 km, or 3 km).

Sidebar choices take precedence over Gemini. The server re-inserts omitted stops,
sets their priority to required, and uses their coordinates directly rather than
searching for their names. Remove/change a sidebar choice to override it. An
impossible required visit stays in the saved intentions and makes the run
infeasible; it is never silently downgraded. Blank dates remain for Gemini to
interpret; explicitly selected dates are enforced. Changing sidebar constraints
between retries starts a new request ID rather than reopening an older result.

Gemini must classify each item with `location_scope: specific | along_route` and
`selected_stop_id: string | null`. Specific named locations bypass the route-radius
filter. Generic queries retain their category intent rather than a model-invented
venue name. The server computes a baseline route through existing places, samples
up to five points on its provider geometry, searches Places, and filters candidates
by distance to the actual route segments. It evaluates up to three nearby candidates
with complete Routes journeys in the selected mode, including appointment waits and
visit durations, then chooses the feasible candidate with the earliest final arrival.
No candidate is added when that would displace an existing visit or violate the end
time. Transit legs are recalculated at their scheduled departure times.

Discovery is bounded, not exhaustive or globally optimal. The radius measures
geographic distance to the route; it is not a walking-time promise. Routes determine
actual travel feasibility. An unsuccessful generic search remains unscheduled with
`NO_ROUTE_MATCH`. Exact venue interpretation still depends on Gemini classification
and Places matching. No automatic widening beyond the chosen radius is performed.
The added intent classification fields do not change SQL columns; resolved IDs,
required status, placements, and provider geometry use the existing persistence model.

Sidebar stop order uses `orderPolicy: preserve | optimize` in manual requests
and chat constraints (omitted means preserve). Up/down controls switch to
preserve. The selected relative sequence is enforced while generic additions
may fit between selections. Individually locked positions cannot be moved.
Saved schedule preferences persist this as `order_policy`.

Optimize forces fastest routing and compares complete timed journeys, including
stop dwell and transit departure times, before route-corridor discovery. All
free permutations are checked for at most three free stops; larger trips compare
at most 12 orders (original, reverse and relocation candidates). This is a bounded
search, not a global optimum guarantee. Appointments and end times are checked
for AI schedules; unresolved/task schedules may retain their sequence with a
warning. Demo data still uses explicitly labeled estimates. Real mode uses
Google Routes legs; no straight-line ranking selects the winning order.

Manual sidebar edits now debounce route updates by 600 ms. Stop drag handles
and arrows share the same lock checks and switch to preserved order. Endpoint,
mode, duration, and optimization changes also recalculate automatically; search
keystrokes alone do not. Controls pause during route/AI requests to prevent
competing results. Applying a saved AI response or undo does not trigger a
second automatic plan. Chat remains explicit and reads the latest sidebar;
manual updates do not call Gemini or rewrite saved SQL snapshots.

Successful manual plans have a tab-local cache of at most 20 request versions,
expiring after 60 seconds. Identical pending requests are coalesced; failures
are not cached. Working history remains available through Undo. Activities on
retained stops survive route recalculation and are validated against stop dwell
time. Failed calculations retain the last successful map and show an error.
