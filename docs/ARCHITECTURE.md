# PathWayve architecture

One Next.js application with shared Zod contracts and a desktop map workspace.
Gemini is reserved for a later milestone; today's planner uses explicit user
selections and geographic providers.

```text
Location/stop search -> /api/search -> Places Text Search -> selectable results
TripForm -> /api/plan -> normalize dates -> selected stops -> Routes legs
                                                        -> optional weather
                                                        -> deadline validation
                                                        -> TripState -> map/timeline
Workspace + JSON commands -> /api/trip-edit -> apply atomically -> Routes
                                          -> validate -> updated WorkspaceTrip
```

## Contracts and ownership

`src/types/trip.ts` defines geography, normalized trip requests, candidates, stops,
route legs, weather context, and existing trip events. `src/types/workspace.ts` adds activities,
revisions, and modification commands. Coordinate shape is `{lat,lng}`. Times are
ISO instants plus a named trip timezone. Distances use meters; durations use
minutes. Changes to either shared schema should be communicated to the team.

`lib/trip-client.ts` is the frontend transport boundary. UI components emit data
and commands. `lib/planner.ts` assembles selected places and routes without calling
Gemini. `lib/gemini.ts` remains an unused adapter for a future planner. Server-only
provider modules cannot enter the client bundle.

| Method | Path                | Input                                         | Output                               |
| ------ | ------------------- | --------------------------------------------- | ------------------------------------ |
| GET    | `/api/health`       | none                                          | service status                       |
| POST   | `/api/search`       | query, optional location bias/category/budget | places, source                       |
| POST   | `/api/plan`         | TripRequestInput                              | normalized TripState                 |
| POST   | `/api/trip-edit`    | WorkspaceTrip + modification batch            | WorkspaceTrip                        |
| POST   | `/api/replan`       | tripState + simulated event                   | TripState (demo only)                |
| POST   | `/api/places`       | TripRequestInput                              | category candidates (legacy adapter) |
| POST   | `/api/bring-advice` | weather context                               | deterministic bring advice           |

## Current limits

The frontend is desktop-only. Paid APIs require separately configured browser and
server keys. Map loading is independent of route/search data. Live provider failure
never silently falls back to samples. Default window is now to local end of day;
explicit multi-day windows up to 31 days are accepted, but automatic overnight
scheduling is not implemented.

Users decide which places are inserted. Ranking is a disclosed heuristic based
on ratings, straight-line distance, and session favourites. Exact selected stops
are required by default. Route priority applies within the chosen transport mode;
there is no automatic comparison across modes or worldwide optimum guarantee.

Trips and favourites are not persisted. Version checks are relative to the
submitted workspace, not an authoritative database. Add authentication and a
shared rate limiter before publicly deploying paid endpoints. Weather is advisory
Open-Meteo data when explicitly enabled. Bring advice is deterministic clothing
and accessory classification from weather facts, not AI-generated guidance.
Weather-aware route optimization, real-time TransLink, conversational
interpretation, and AI execution are not implemented.

See [FRONTEND.md](FRONTEND.md) for setup, full JSON semantics, integration boundaries,
and verification limits.
