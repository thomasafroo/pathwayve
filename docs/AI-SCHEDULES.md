# Prompt → Gemini preview → account save

The composer sends a prompt to `POST /api/schedules/preview`. It generates a
new preview, even if an existing manual trip supplies context. The left panel's
stops and settings are sent as routing `constraints`: required and locked stops
are kept. **Save schedule** separately saves it to the authenticated user's
account. See [authentication](AUTH.md).

## Pipeline

1. Validate the prompt (up to 4,000 characters), timezone, request UUID, and optional
   current trip context. Previewing does not require an account.
2. Ask Gemini for JSON matching `generatedScheduleSchema`. The model returns a
   schedule and activity intentions, or a clarification question if endpoints
   are missing. It never produces executable SQL.
3. Apply full Zod validation, including timing rules and unique sequence positions.
   The schema sent to Gemini is a simplified supported subset; local validation
   remains authoritative.
4. Resolve endpoint/activity search queries through Places. Compute route legs,
   allow waiting before appointments, check time windows and the final destination.
5. Assign preview UUIDs, versions, and timestamps. Classify every activity as placed
   or unscheduled. Display the preview without writing to the database.
6. When Save is pressed, authenticate, assign ownership and fresh IDs, and insert
   the schedule, items, run, and optional workspace in one parameterized transaction.
   The browser's request UUID prevents duplicate saves when the same request is
   retried. Model/network failures before save do not leave partial rows.
7. Display the result. Flexible visit-only feasible plans also populate the
   existing map/itinerary workspace. Fixed appointments and standalone tasks use
   the saved details view because the older workspace cannot represent all their
   constraints safely.
   All successfully calculated routes also save a display-only `result.map_trip`
   snapshot containing coordinates and route geometry. The map reads this snapshot
   for timed schedules and reopened saves. Older saves without it require a new
   generation to show a route; no geometry is invented from place IDs.
8. Open a saved result from **My schedules**, then choose **Import places to
   planner** to copy its map snapshot into the left editor. Edits can be saved as
   a new copy; the original stays unchanged. Timed appointment rules and
   standalone tasks in AI schedules remain in the original snapshot, because the
   route editor cannot represent them; the UI explains this before import.
9. **Delete schedule** removes the selected owned save and its items/runs. It does
   not remove the current working route.

Left-panel preferences persist locally in the same browser and apply to new trips.
Opening or importing a schedule loads that schedule's preferences and dates; old
dates are not shifted silently.

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
- `user_id` comes from the verified Better Auth session, never from Gemini or a
  client JSON document. It references `public.auth_users.id`.
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

| Endpoint                      | Purpose                                                 |
| ----------------------------- | ------------------------------------------------------- |
| `POST /api/schedules/preview` | Prompt + timezone + optional context and constraints    |
| `POST /api/schedules`         | Authenticated explicit snapshot save                    |
| `GET /api/schedules`          | Latest 30 summaries belonging to the authenticated user |
| `GET /api/schedules/:id`      | Owned `{document, workspace}` snapshot                  |
| `DELETE /api/schedules/:id`   | Delete an owned save and its items/runs                 |

## Current boundaries

- Google login enables cross-device access to private saves. Public paid endpoints
  still need deployment-level shared rate limiting.
- Reopening reads the saved calculation; it does not refresh routes, run Gemini,
  or rebase appointments onto a new day. Ask for a new schedule to calculate again.
- Manual workspace edits require pressing Save again to create a new snapshot.
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

## Opening hours and navigation

Places Text Search and Place Details request `regularOpeningHours`,
`currentOpeningHours`, `timeZone`, and `businessStatus`. These additional fields
use Google's applicable Places billing tiers. Place records retain these values
and their retrieval timestamp. Old Google selections refresh hours during
planning; failed refreshes become explicitly unknown, never silently verified.

The shared opening-hours evaluator uses the venue's IANA timezone, handles
night-crossing and 24-hour intervals, and prefers current date-specific hours
within their seven-day coverage. Beyond that range it uses regular hours with a
holiday caveat. Flexible visits can wait for opening; fixed appointments cannot
shift. The entire visit must fit before closing and before the trip deadline.
Manual plan/edit endpoints reject impossible visits, while AI schedules record
an OPENING_HOURS conflict and remain infeasible for a missing required stop.
Optimization and route-corridor discovery evaluate the same hours. Missing hours
remain allowed but explicitly unverified. Endpoints represent travel endpoints;
opening-hours checks apply to visits, not merely arriving at an address.

Start navigation is opt-in and only available for live routes. It requests a
fresh GPS fix (accuracy <=100m), renders the position and a Google Routes leg to
the next selected stop, and provides route instructions. Routing updates are
throttled (30-second checks after 50m movement, or after two minutes); stale fixes
are not sent. Users explicitly continue to each next stop, preserving dwell
activities. The navigation preview does not modify saved schedules, invoke
Gemini, or implement voice guidance/lane guidance/automatic turn progression.
The Google Maps directions URL uses the next destination, chosen travel mode,
and device location for supported navigation. Stop navigation releases the GPS
watch. Follow my location also offers Use my location as start for planning.

References: [Place fields](https://developers.google.com/maps/documentation/places/web-service/reference/rest/v1/places),
[Maps URLs](https://developers.google.com/maps/documentation/urls/get-started).

## Required and optional selections

Each selected stop now has a Required checkbox. New choices default to required;
unchecking makes the stop optional. Individual locks always protect a stop, even
if an older JSON payload labels it optional. The priority is sent in both manual
requests and chat constraints (missing priority retains the legacy required
behavior).

Gemini returns `removed_stop_ids` for optional/preferred sidebar stops explicitly
removed by the user's conversation. Enforcement checks these IDs, refuses to
remove required/locked selections, and retains optional stops merely omitted by
the model. A retained optional stop can be upgraded to required by a matching
model item in response to a keep-it request. Remaining selected stops retain their
relative order and authoritative Places coordinates. The next saved schedule and
editable map use the resulting stops; earlier saved snapshots remain unchanged.

Desktop dragging uses the entire stop card as the native drag image. Neighboring
cards animate to preview insertion without changing the planner request. Drop
commits one change; cancellation restores the original sequence. Arrow controls
remain available, locked positions cannot be crossed, and reduced-motion
preferences disable the reorder animation.

Conversational removals now use a focused Gemini interpretation pass before
itinerary generation whenever sidebar stops exist. Every current stop must get
an explicit keep/remove decision; incomplete decisions fail without changing the
route. The interpreter resolves unambiguous nicknames/misspellings and rejection,
replacement, convenience, and category-avoidance requests, while keeping unrelated
optional stops. Ambiguity or removal of protected stops returns clarification.
Validated removal IDs override the itinerary generator's removal field. Rejected
provider IDs are excluded from named replacement lookup and route-corridor
search, preventing immediate re-addition. The chat reply lists actual removed
places from the resulting saved document. This adds one Gemini request for chats
with existing selected stops; new trips with no selections retain one request.

### Sidebar preferences in chat

Both Gemini stages receive current sidebar preferences. The stop-edit interpreter
reads notes (including disliked places/categories), interests, activities, budget,
suggestion mode and route priority before deciding whether to remove a stop.
A generic “adapt to my preferences on the side” prompt therefore uses the current
notes without asking the user to repeat them. Required/locked conflicts still
return a specific checkbox/unlock instruction. The itinerary stage receives all
constraints and uses manual suggestion mode to avoid unsolicited new visits;
explicit chat/notes requests can still add places. Suggest mode permits relevant
interest-based additions. Current sidebar values supersede stale conversation
preferences. These are model instructions, not guarantees of verified amenities
or prices.
