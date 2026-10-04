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
