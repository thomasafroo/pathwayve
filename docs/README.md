# PathWayve documentation

Build, configure, and understand the planner.

## Start here

- [Installation](GETTING-STARTED.md) — run the sample planner and enable services.
- [APIs & integrations](APIS.md) — provider configuration and application routes.
- [Architecture](ARCHITECTURE.md) — application boundaries and data flow.
- [Contributing](../CONTRIBUTING.md) — development, validation, and review.

## Feature guides

| Guide                                          | Covers                                                         |
| ---------------------------------------------- | -------------------------------------------------------------- |
| [Maps and the planning workspace](FRONTEND.md) | Geographic providers, manual planning, route contracts         |
| [AI schedules](AI-SCHEDULES.md)                | Gemini, structured schedules, grounding, persistence           |
| [Accounts and saved schedules](AUTH.md)        | Google OAuth, ownership, saving and restoring drafts           |
| [Calendar](calendar.md)                        | Google connection, busy-time constraints, `.ics` import/export |
| [Dependencies](DEPENDENCIES.md)                | Dependency caveats and upgrade notes                           |

The [project overview](../README.md) summarizes current capabilities and limits.
Configuration names appear in [`.env.example`](../.env.example).
