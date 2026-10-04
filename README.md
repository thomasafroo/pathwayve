# PathWayve

A desktop trip planner for choosing your own places, exploring ranked suggestions,
and adapting your itinerary. Built with Next.js, React, TypeScript, Google Maps,
and a Gemini prompt-to-JSON-to-SQL schedule pipeline.

## Run locally

Requires Node.js 22.14+ (Node 22 recommended).

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Open [localhost:3000](http://localhost:3000). If you already use `.env`, configure
that file instead of introducing competing values in `.env.local`. Environment
files are ignored by Git. Restart the dev server after changing keys.

## Enable Google geography without Gemini

- `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`: browser key, restricted to Maps JavaScript API
  and your localhost/deployed website origins.
- `GOOGLE_MAPS_SERVER_API_KEY`: separate server key, restricted to Places API (New)
  and Routes API. Do not use website-referrer restrictions for server requests.
- `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID=DEMO_MAP_ID`: development marker support.

Enable those APIs and billing in Google Cloud. A server key automatically enables
live search and routing. `MAPS_DATA_MODE=demo` forces samples; `MAPS_DATA_MODE=live`
requires the server key. Keep `DATA_MODE=demo`; no Gemini key is needed and the
manual planner does not invoke Gemini.

Without a server key, “Load sample trip” demonstrates fictional stops and estimated
travel. The browser map alone does not enable internet place search or real routes.
Live failures are shown rather than replaced with samples.

Plans include Google Weather API hourly destination weather (up to 10 days ahead)
using `GOOGLE_MAPS_SERVER_API_KEY`; enable the Weather API for that key's Google
Cloud project. Set `WEATHER_DATA_MODE=off` to disable it. Weather is fetched as structured forecast data; no LLM generates or
interprets conditions. The backend also turns those facts into playful
deterministic “what to bring” advice.

## Included

- Desktop map with selected markers and transport-specific route geometry.
- Arbitrary start/destination and stop search through Google Places.
- User-chosen stops, optional ranked suggestions, and session favourites.
- Interests, budget, free-text preferences, and transit route priorities.
- Now-to-end-of-day defaults and explicit date ranges in JSON.
- Stop/activity editing, locks, atomic modifications, undo, and JSON export.
- Weather-based clothing/accessory advice when live weather is enabled.
- Runtime validation, unit/provider tests, and desktop browser tests.

The chat composer uses Gemini to preview a structured schedule and resolve
locations/routes. Anyone can plan; **Save schedule** prompts Google login and saves
the exact schedule to the user's private account. **My schedules** reopens saves.
Configure Google OAuth using [authentication setup](docs/AUTH.md).
Set `GEMINI_API_KEY`; local development uses
embedded PostgreSQL automatically, or set `DATABASE_URL` / `TIGER_DATABASE_URL`
and run `npm run db:migrate`. See [AI schedules](docs/AI-SCHEDULES.md) for contracts,
database setup and verification limits.

Multi-day overnight planning, persistent favourites, weather-aware route
optimization, and active-trip navigation are future features. Ranking uses a
transparent heuristic; it does not claim personalized AI recommendations.

See [frontend and API setup](docs/FRONTEND.md), [architecture](docs/ARCHITECTURE.md),
and [team workflow](CONTRIBUTING.md).

## Checks

```sh
npm run check
npm run build
npm run test:e2e
npm run format:check
```

If local Turbopack workers cannot bind a port, `npm run build -- --webpack` is an
alternative build check. The browser suite needs Chromium (`npx playwright install
chromium`) and forces demo geography. Live Places/Routes verification requires a
valid server key. Public paid endpoints need authentication and a shared rate
limiter before deployment. Known dependency advisories are in
[docs/DEPENDENCIES.md](docs/DEPENDENCIES.md).
