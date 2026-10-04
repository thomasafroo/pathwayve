# Desktop trip workspace

This milestone targets desktop web browsers. The map, form, itinerary, and
editing tools consume JSON; no Gemini request is made by the current plan flow.

## Geographic APIs

Configure ignored `.env` or `.env.local` (avoid conflicting definitions):

```dotenv
DATA_MODE=demo
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=website_restricted_map_key
NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID=DEMO_MAP_ID
GOOGLE_MAPS_SERVER_API_KEY=separate_server_key
# Optional: weather is on by default; set to off to disable Open-Meteo forecasts.
WEATHER_DATA_MODE=
```

The browser key enables **Maps JavaScript API**. Restrict it to that API and your
website origins, including `http://localhost:3000/*` during development.

The separate server key enables **Places API (New)** and **Routes API**. Restrict
it to those APIs. Website referrer restrictions cannot be used for server
requests; use server IP restrictions when the hosting setup supports stable
egress. Never prefix this key with `NEXT_PUBLIC_`. Google Cloud billing must be
enabled. Restart the development server after configuring keys.

With a server Maps key, geographic providers automatically use live data even
while `DATA_MODE=demo`. `MAPS_DATA_MODE=demo` explicitly forces samples;
`MAPS_DATA_MODE=live` explicitly requires the server key. Empty/unset detects the
key. None of these settings enables Gemini. A failed live call returns an error,
not fictional results. The browser map can work without the server APIs, but
search and routes remain explicitly labeled sample data in that configuration.

The application does not provision Google Cloud, change billing, or create keys.
Google references: [Maps JavaScript setup](https://developers.google.com/maps/documentation/javascript/get-api-key),
[Places Text Search](https://developers.google.com/maps/documentation/places/web-service/text-search),
[transit routing](https://developers.google.com/maps/documentation/routes/transit-route).

Plans attach Open-Meteo hourly destination forecasts by default; set
`WEATHER_DATA_MODE=off` to disable them. Forecast failures are reported as warnings and never replaced with
sample conditions. Demo weather controls remain simulated.

## User control

Start and destination are chosen from place/name/address search results with
coordinates, rather than a fixed dropdown. Search is explicit (Search button or
Enter); it does not issue paid requests on each keystroke. The sample-trip button
is an explicit demonstration shortcut. In live mode it sets example endpoints
without inserting fictional venues.

Users can select up to six exact stops, choose their duration, remove selections,
and browse optional suggestions. A search result is never added automatically.
Selected places default to required inclusion. Simulated replanning cannot
silently remove them to meet a deadline; an impossible schedule returns a conflict.
Locks additionally preserve sequence position and prevent local duration edits.
Users can explicitly remove their own required stop through the editing controls.

Suggestions use Places Text Search with interests and budget. Best-match ranking
weighs session favourites, ratings/review counts, and approximate straight-line
distance from the destination. Highest-rated and closest sorting are also
available. This is a transparent heuristic, not a claim of AI personalization or
minimum travel detour. Travel duration is calculated after selection. Place
qualities such as quietness, wifi, opening hours, or accessibility are not verified
from a text query. Missing ratings/prices remain unknown.

Favourites remain in the current form session and their IDs are included in plan
JSON. There is no account database or persistent favourite library yet. Free-text
preferences, broader interest tags, budget, and suggestion mode are retained in
the request for a future Gemini planner.

## Time window contract

`startTime` and `endTime` are optional in input JSON. `timeZone` is an IANA zone
(default `America/Vancouver`; the UI supplies the browser's zone).

- No dates: now through 23:59:59.999 of today in the supplied timezone.
- Start only: that instant through the end of its local calendar day.
- End only: now through that explicit end.
- Both: preserve the provided instants, including multi-day ranges up to 31 days.

The normalized `TripRequest` and exported workspace always contain concrete ISO
timestamps. Invalid zones, reversed dates, and ranges over 31 days are rejected.
Multi-day windows are accepted as constraints; automatic overnight breaks, hotels,
and day-by-day scheduling are not implemented. Transit availability is subject to
Google's schedule coverage. Live initial planning rejects departures more than a
minute in the past. Browser datetime fields are interpreted in the device zone.

Example request for the future planner or today's manual flow:

```json
{
  "origin": {
    "name": "My starting place",
    "location": { "lat": 49.28, "lng": -123.11 }
  },
  "destination": {
    "name": "My destination",
    "location": { "lat": 49.29, "lng": -123.12 }
  },
  "timeZone": "America/Vancouver",
  "transportation": "transit",
  "routingPriority": "less_walking",
  "activities": ["coffee", "food"],
  "interestTags": ["Libraries", "Quiet study spots"],
  "budget": "budget",
  "preferences": "Vegetarian food; avoid crowded places",
  "favoritePlaceIds": ["a-google-place-id"],
  "suggestionMode": "suggest",
  "selectedStops": []
}
```

Empty `selectedStops` means a direct route, even in suggestion mode. Each selected
stop includes candidate place data, `durationMinutes`, `locked`, and `priority`
(`required`, `preferred`, or `optional`). For backward compatibility only, omitted
`selectedStops` in demo requests selects the original sample categories. Omitted
stops in live requests produce a direct route, with no Gemini call.

## Routes and editing

Each leg is computed for WALK, DRIVE, or TRANSIT. Driving requests traffic-aware
routing. Fastest chooses the lowest duration among Google's returned alternatives.
Transit priorities LESS_WALKING and FEWER_TRANSFERS defer to Google's preferred
result. These are preferences, not accessibility guarantees or global optimums.
Walking requests omit unsupported departure/traffic preferences. Routes are
computed sequentially, including stop durations and the final destination leg.
Returned geometry, step instructions, transit line names, distances, and durations
are rendered by the frontend. Transit walking steps are listed separately in
expanded directions. Route colors distinguish walking, driving, and transit.

Demo geometry remains visibly dashed straight-line estimates. Live edits call
`POST /api/trip-edit`; the server recalculates travel legs and rejects missed
deadlines. No live edit is replaced with a straight-line mock route. Undo restores
a snapshot; it does not refresh traffic data. Route times are planning estimates,
not live navigation or active-trip tracking.

`WorkspaceTrip` contains `{ version, trip, activities }`. JSON modification batches
contain `{ tripId, baseVersion, modifications }`. Commands include ADD_STOP,
REMOVE_STOP, MOVE_STOP, CHANGE_DURATION, SET_LOCK, ADD_ACTIVITY, REMOVE_ACTIVITY,
and COMPLETE_ACTIVITY. Invalid batches leave the active state untouched.

Activities attach to a stop. User tasks must collectively fit its duration and
move with it. AI task JSON is renderable, but no AI executor is connected.
`toSchedule` derives PLACE, TRANSIT, USER_TASK, and AI_TASK entries without a second
mutable schedule. Changes synchronize selected-stop JSON and visible stop state.

State is in the tab. Download exports JSON; import and persistence are not
implemented. Server version checks compare the submitted document; a future
repository must provide authoritative version checks for concurrent clients.
Public paid endpoints still need authentication and a shared rate limiter.

When enabled, weather context is destination-level hourly forecast data for the
planned window. It can warn about rain or snow and produces deterministic
`bringAdvice` for clothing/accessories, but it does not yet change stop
selection, routing, or durations. The same classifier is available at
`POST /api/bring-advice` for refreshes without replanning.

## Verification

Unit tests cover timezone/DST defaults, date ranges, direct routes, required stops,
atomic edits, activity capacity, and mocked Google search/routing payloads.
Desktop browser tests cover arbitrary endpoint selection, ranked result approval,
favourites, itinerary editing, undo, downloads, and keyboard behavior.

Provider contract mocks do not verify credentials, quotas, billing, or actual
Google service availability. A configured server key is required for a live
end-to-end Places/Routes check. Standard browser tests force sample provider mode.

## Desktop map workspace and location

The desktop layout uses a full-height map with a fixed-width, independently scrolling planning panel. Plan and itinerary tabs preserve the existing form and JSON workflow. Search, routing providers, and request schemas are unchanged by this layout update.

The AI companion panel is a preview only. Users can draft and save a brief in the current component session; it is not sent to Gemini, persisted across reloads, added to exported trip JSON, or applied to a route.

“Follow my location” starts browser `watchPosition` only after a click and requires browser permission plus HTTPS (localhost works for development). The map shows a blue marker and accuracy circle; dragging the map suspends recentering while updates continue. Users can recenter or stop tracking. Stop clears the watch and removes the position; unmount also clears it. Coordinates are kept in component memory and are not sent to the planner or stored in trip JSON. Viewing the location uses Google’s map and normal map tile requests. It does not reroute the trip.

Browser location quality depends on the device; desktop locations can be approximate. Tracking while a page is suspended or closed is not supported. Background navigation would require a separate mobile/native implementation.

Browser coverage includes panel switching, a saved assistant brief, opt-in location updates, stopping with a late callback, and permission denial. Location tests inject synthetic coordinates; they do not request the operator’s location.
