# APIs & integrations

[Product overview](../README.md) · [Installation](GETTING-STARTED.md) · [Documentation](README.md)

Configure each service independently. The manual sample planner runs without
provider credentials; live services use the settings below.

## Service configuration

| Service                    | Used for                                           | Configuration                                                                       |
| -------------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Google Maps JavaScript API | Interactive browser map                            | `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`, `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID`                 |
| Google Places API (New)    | Place search and details                           | `GOOGLE_MAPS_SERVER_API_KEY`                                                        |
| Google Routes API          | Travel legs and route geometry                     | `GOOGLE_MAPS_SERVER_API_KEY`                                                        |
| Gemini                     | Natural-language requests and structured schedules | `GEMINI_API_KEY`, `GEMINI_MODEL`                                                    |
| Gemini Maps grounding      | Source-backed place explanations                   | `MAPS_GROUNDING`, optional `GEMINI_GROUNDING_MODEL`                                 |
| Google Weather API         | Destination forecasts                              | Server Maps key; `WEATHER_DATA_MODE=off` disables forecasts                         |
| Google OAuth / Better Auth | Login and private saved schedules                  | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` |
| Google Calendar API        | Imports, busy-time constraints, and exports        | Google OAuth settings and the Calendar callback                                     |
| ElevenLabs                 | Chat voice transcription                           | `ELEVENLABS_API_KEY`                                                                |
| PostgreSQL / PGlite        | Account and schedule storage                       | `DATABASE_URL` or `TIGER_DATABASE_URL`; embedded database for local development     |

Use separate browser and server Maps keys. Restrict the browser key to the APIs
and website origins it needs. Server secrets must never use the `NEXT_PUBLIC_`
prefix. Enable the relevant Google APIs and billing in the configured project.

Environment variable names appear in [`.env.example`](../.env.example).
Restart the server after configuration changes.

## Setup guides

- [Maps and routes](FRONTEND.md): provider configuration and manual planning contracts.
- [AI schedules](AI-SCHEDULES.md): structured output, grounding, constraints, and persistence.
- [Google sign-in](AUTH.md): consent, callback URLs, sessions, and schedule ownership.
- [Google Calendar](calendar.md): additional consent, callback, and import/export behavior.
- [Installation](GETTING-STARTED.md): demo mode and troubleshooting.

Google sign-in and Calendar access use separate consent flows and callbacks.
Signing in does not automatically grant calendar access.

## Application routes

These routes support the PathWayve web client. They are implementation interfaces,
not a separately versioned public API. Request validation and access requirements
live alongside the handlers in [`src/app/api`](../src/app/api).

| Area            | Routes                                                                                  | Purpose                                                       |
| --------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Places          | `/api/search`, `/api/autocomplete`, `/api/place-details`                                | Find places and resolve details                               |
| Manual planning | `/api/plan`, `/api/trip-edit`                                                           | Build routes and apply workspace edits                        |
| AI planning     | `/api/schedules/preview`                                                                | Generate a schedule preview                                   |
| Saved schedules | `/api/schedules`, `/api/schedules/[id]`                                                 | Save, list, reopen, and delete schedules scoped to an account |
| Authentication  | `/api/auth/[...all]`                                                                    | Better Auth session and OAuth handling                        |
| Calendar        | `/api/google-calendar`, `/api/google-calendar/connect`, `/api/google-calendar/callback` | Calendar operations and authorization                         |
| Route following | `/api/navigation`                                                                       | Request a route to the active target                          |
| Voice           | `/api/transcribe`                                                                       | Transcribe recorded chat input                                |
| Context         | `/api/bring-advice`                                                                     | Derive packing advice from weather context                    |
| Health          | `/api/health`                                                                           | Service status                                                |

The older `/api/places` adapter and demo-only `/api/replan` also remain in the codebase.

## Data and operating boundaries

Live provider failures are reported instead of silently returning sample data.
Demo mode deliberately uses fixtures. Manual planning does not require Gemini.
AI-generated drafts are validated and resolved by application code before being
presented as schedules.

Provider quotas and availability depend on the configured accounts. When operating
a deployment, review paid-endpoint access controls, shared rate limiting, and
[dependency notes](DEPENDENCIES.md). Never include credentials or private user
data in issue reports.
