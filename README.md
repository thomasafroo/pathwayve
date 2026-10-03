# PathWayve

An adaptive AI day-trip planner for StormHacks. Turn a destination, a time window,
and a few interests into a day out, then adjust when plans change.

## Start locally

Requires Node.js **22.14+** (Node 22 recommended) and npm.

```sh
npm ci
npm run dev
```

Open [localhost:3000](http://localhost:3000). **No API keys are needed for demo
mode.** Choose interests, generate a trip, lock a stop, and try the simulated rain
or delay controls. Sample venues are fictional and travel times are estimates.

To configure providers, copy `.env.example` to `.env.local`:

```powershell
Copy-Item .env.example .env.local
```

On macOS/Linux use `cp .env.example .env.local`. Restart the dev server after
changing environment variables. `.env.local` is ignored by Git.

## Included

- Next.js App Router, React, strict TypeScript, Tailwind CSS.
- Shared Zod request/response schemas and one central TripState.
- Responsive trip form, itinerary, stop locking, and demo event controls.
- Server-only Gemini, Google Places, and Routes adapters.
- Optional Google map with numbered markers and route polylines.
- Unit/API tests, desktop/mobile browser smoke tests, and GitHub Actions CI.
- ESLint, Prettier, environment template, and four-person ownership guide.

## Enable live planning

Use the team's Google Cloud project with billing and Places API (New), Routes API,
and Maps JavaScript API enabled. Configure:

| Variable                          | Purpose                                                                  |
| --------------------------------- | ------------------------------------------------------------------------ |
| `DATA_MODE`                       | `demo` by default; set `live` to call paid providers                     |
| `GEMINI_API_KEY`                  | Server-only Gemini credential                                            |
| `GEMINI_MODEL`                    | Defaults to `gemini-2.5-flash`; select a model available to your account |
| `GOOGLE_MAPS_SERVER_API_KEY`      | Server key for Places and Routes                                         |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | Optional browser key for the interactive map                             |
| `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID`  | Your map ID; `DEMO_MAP_ID` for development                               |

Keep server credentials out of `NEXT_PUBLIC_*`. Restrict the browser key to your
localhost/deployed website origins and Maps JavaScript API. Use a separate server
key restricted to Places/Routes, with application restrictions appropriate to your
hosting environment. Never commit keys or paste them into issues.

Live mode does not fall back to fixtures on failure. It needs a future departure
and enough time for travel and stops. Provider behavior must be verified with
your configured keys. The starter searches near the destination and offers three
Vancouver endpoints; free-text address search and route-corridor discovery are
next steps. **Replanning is currently simulated and demo-only.**

Weather, TransLink, ElevenLabs, and Tiger Data are stretch milestones, not required
dependencies. Weather/transit contracts are included; voice and persistence are
not implemented. All trip state currently lives in the browser's memory.

## Commands

```sh
npm run dev          # Development server
npm run check        # Lint, typecheck, unit/API tests
npm run build        # Production build
npm start            # Run production build
npm run format      # Format source and docs
npx playwright install chromium
npm run test:e2e     # Desktop and mobile browser tests
```

## Team layout

```text
src/app/api/         Plan, places, replan, health endpoints
src/components/     Form, map, itinerary, stop cards, replan controls
src/types/trip.ts    Shared runtime schemas and TypeScript types
src/lib/            Planner and provider adapters
src/lib/server/     Environment and HTTP/error handling
tests/              Unit/API tests and browser flows
docs/               Architecture, limitations, and next milestones
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for ownership and the Git workflow, and
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for API contracts and provider references.
Known development-tool advisories are recorded in [docs/DEPENDENCIES.md](docs/DEPENDENCIES.md).

## Deployment

Import this repository into a Next.js-compatible host, use `npm ci` and
`npm run build`, and start in `DATA_MODE=demo`. For live mode, configure server
secrets in the host, add the deployed domain to browser-key restrictions, and
confirm the host supports the plan endpoint's execution duration. Add authentication
and a shared rate limiter before making the paid live endpoints public.

Cloud provisioning, billing, repository collaborators, branch protection, and
deployment are team/account setup steps; this repository does not provision them.

#### TEST COMMIT
