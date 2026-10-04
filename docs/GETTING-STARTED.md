# Installation

[Product overview](../README.md) · [APIs & integrations](APIS.md) · [Documentation](README.md)

## Explore without credentials

Install Node.js 22.14+ and run from the repository directory:

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Open [localhost:3000](http://localhost:3000), continue as a guest, and load the
sample trip. Manual planning uses demo fixtures without provider credentials.
The interactive Google base map requires a browser key.

Use one local environment file consistently. If `.env` already exists, edit it
instead of introducing competing values in `.env.local`. Restart after changes.

## Maps and routing

Set `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` to a browser key restricted to Maps
JavaScript API and your website origins. Use
`NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID=DEMO_MAP_ID` for development.

Set `GOOGLE_MAPS_SERVER_API_KEY` separately for Places API (New) and Routes API.
Enable those APIs and billing in the Google Cloud project. Do not apply browser
referrer restrictions to the server key or expose it with `NEXT_PUBLIC_`.

A configured server key enables live geographic data automatically.
`MAPS_DATA_MODE=demo` forces samples; `MAPS_DATA_MODE=live` requires a server key.
The browser key alone does not enable live search or route calculation.

## Chat, accounts, and storage

Set `GEMINI_API_KEY` for conversational planning. Choose a model available to your
project. See [AI schedules](AI-SCHEDULES.md).

Configure Google sign-in with the [authentication guide](AUTH.md). Maps API keys
and OAuth credentials serve different purposes. Both Log in and Sign up use
Google; the first successful login creates an account.

Without a database URL, development uses embedded PostgreSQL in
`.pathwayve/database`. For hosted PostgreSQL, configure `DATABASE_URL` or
`TIGER_DATABASE_URL`, then run `npm run db:migrate`.

## Optional services

- **Weather:** enable Google Weather API for the server Maps key's project.
  `WEATHER_DATA_MODE=off` disables forecasts. Packing advice is derived from
  structured forecast data.
- **Place explanations:** Maps grounding enriches AI-generated stops with
  source-backed explanations. `MAPS_GROUNDING=off` disables it.
- **Calendar:** follow [Calendar setup](calendar.md) for the API, consent, and
  callback configuration. File import/export is available separately.
- **Voice input:** configure `ELEVENLABS_API_KEY` for chat transcription.

## Troubleshooting

| Symptom                               | Check                                                          |
| ------------------------------------- | -------------------------------------------------------------- |
| Map appears, but search fails         | Server key, enabled Places/Routes APIs, and billing            |
| Sample places appear                  | Whether `MAPS_DATA_MODE=demo` is set                           |
| Chat fails, but manual planning works | Gemini key, model availability, provider quota                 |
| Google rejects the redirect           | Exact callback URL, including hostname and port                |
| Chat cannot use your location         | Turn on Follow my location and wait for a fresh position       |
| Changed settings have no effect       | Conflicting environment files and whether the server restarted |

Location requires HTTPS or localhost and browser permission. Only fresh positions
are shared with the planner while tracking is enabled.

## Development checks

```sh
npm run check       # Lint, TypeScript, and unit/provider tests
npm run build       # Production build
npm run test:e2e    # Browser workflows
npm run format:check
```

Install Chromium once with `npx playwright install chromium`. Browser tests use
demo geography; live-provider verification requires configured credentials.
See [Contributing](../CONTRIBUTING.md) for the review workflow.
