# Working together

Use Node 22.14+ and npm. Run `npm ci` after pulling lockfile changes.

Start from the latest main and use a short feature branch:

```sh
git switch main
git pull --ff-only
git switch -c feature/your-feature
npm ci
npm run dev
```

Open small PRs and have a teammate review before merging. Coordinate changes to
`src/types/trip.ts` first: every feature depends on this contract. Commit
`package-lock.json` whenever dependencies change. Never commit credentials.

| Owner            | Main files                                                      | First milestone                |
| ---------------- | --------------------------------------------------------------- | ------------------------------ |
| AI / integration | `src/lib/gemini.ts`, `src/lib/planner.ts`, `src/types/trip.ts`  | Validated live plan            |
| Maps / routes    | `src/components/Map.tsx`, `src/lib/routes.ts`                   | Verified map and travel legs   |
| Places / context | `src/lib/places.ts`, `src/lib/weather.ts`, `src/lib/transit.ts` | Real candidates, then weather  |
| Frontend / UX    | `src/components/`, `src/app/globals.css`                        | Form, itinerary, replan states |

Validate with `npm run format`, `npm run check`, and `npm run build`. For interaction
changes, also run `npm run test:e2e` (install Chromium once with
`npx playwright install chromium`). CI runs these checks for PRs.

Keep `main` demoable. Integrate the complete planning flow before adding voice,
persistence, productivity tasks, or personalization. Demo fixtures must remain
explicitly labeled. Do not silently fall back from a failed live provider to demo data.
