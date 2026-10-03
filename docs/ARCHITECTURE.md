# PathWayve architecture

One Next.js App Router application, one repository, one shared Zod/TypeScript
contract. Server-only provider files cannot be imported into browser components.

```text
TripForm -> POST /api/plan -> validate TripRequest
                         -> Places candidates
                         -> Gemini selection (candidate IDs only)
                         -> validate selection, restore trusted place coordinates
                         -> sequential Routes legs + stop durations
                         -> validate deadline -> TripState
TripState -> Map + Itinerary
TripState + demo event -> POST /api/replan -> preserve locks -> reschedule
```

## Contracts

`src/types/trip.ts` is authoritative. Coordinates are always `location: { lat, lng }`.
Origin/destination include both name and coordinates. Times are ISO 8601 with an
offset or Z; the UI renders in the user's device timezone. Distances use meters;
durations use minutes. A stop ID is a provider place ID (or a demo-prefixed ID).
Arrival at the final destination is included in deadline checks.

The client owns the active TripState in memory; refreshing discards it. Server
handlers are stateless. Locks currently preserve stop inclusion and sequence
position in the demo rain reordering; they do not reserve an arrival time.

## API

| Method | Path          | Request                | Response                                 |
| ------ | ------------- | ---------------------- | ---------------------------------------- |
| GET    | `/api/health` | none                   | `{ status: "ok", service: "pathwayve" }` |
| POST   | `/api/plan`   | TripRequest            | TripState                                |
| POST   | `/api/places` | TripRequest            | `{ places: CandidatePlace[], source }`   |
| POST   | `/api/replan` | `{ tripState, event }` | TripState (demo only)                    |

Errors use `{ error: { code, message } }`. Invalid inputs return 400, infeasible
plans 422, missing configuration 503, and provider failures 502 where handled.
Bodies are capped at 128 KB. Live replanning returns 501 instead of pretending to
perform AI modifications. Request and provider schemas are validated with Zod.

## Current scope and deliberate limits

- Demo planning and simulated replanning work without network calls. Fixtures are
  fictional; straight-line travel estimates are never navigation directions.
- Live adapters implement Places Text Search, Gemini structured selection, and
  Routes. Credentials and live integration verification are still required.
- Searches are biased around the destination, not a route corridor. The form
  offers three Vancouver endpoints; address autocomplete is a maps-team task.
- Routes runs per leg to support transit departure times; up to seven route calls
  plus six Places calls and one Gemini call may occur per plan. Hosting must allow
  the configured 180-second execution budget, or the team should use a background job.
- Over-budget initial plans return a clear error, rather than repeatedly spending
  on AI retries. No opening-hour, budget, accessibility, or weather guarantees.
- Weather and transit files define extension contracts only. No weather endpoint,
  forecast polling, GTFS feed, natural-language replanning, voice, or database yet.
- Add authentication and a shared rate limiter before exposing paid live endpoints
  publicly. The key-free demo is the default deployment mode.

## Next milestones

1. Configure keys, verify a real SFU-to-downtown trip, and add address selection.
2. Feed weather into planning; convert AI replan output into validated operations.
3. Test those operations against locked stops and deadline constraints.
4. Add conversational changes, then voice and trip-event persistence if time allows.

## Provider references

- [Next.js installation](https://nextjs.org/docs/app/getting-started/installation)
- [Gemini structured outputs](https://ai.google.dev/gemini-api/docs/structured-output)
- [Places Text Search](https://developers.google.com/maps/documentation/places/web-service/text-search)
- [Routes computeRoutes](https://developers.google.com/maps/documentation/routes/reference/rest/v2/TopLevel/computeRoutes)
- [React Google Maps](https://visgl.github.io/react-google-maps/docs)
