# Google Calendar and Calendar Files

## Connect Google Calendar

Open **Calendar > Connect Google Calendar**. Grant both calendar permissions in
the popup. The app uses the existing `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
`BETTER_AUTH_URL`, and `BETTER_AUTH_SECRET` environment variables. These configure
a Google OAuth connection; this feature does not require Better Auth itself.

Enable the Google Calendar API in the Google Cloud project. Register this exact
authorized redirect URI for the web OAuth client when running locally:

```
http://localhost:3000/api/google-calendar/callback
```

For deployment, set `BETTER_AUTH_URL` to the public HTTPS origin and register
`https://your-domain/api/google-calendar/callback`. An explicit
`GOOGLE_CALENDAR_REDIRECT_URI` overrides the derived callback. Open the app using
the configured origin; `localhost` and `127.0.0.1` are not interchangeable.
While the Google consent screen is in testing, add the intended users as test
users. Existing Google login consent alone does not grant Calendar API access.

`GOOGLE_CALENDAR_TOKEN_SECRET` can provide a separate encryption secret; otherwise
`BETTER_AUTH_SECRET` is used. It must contain at least 32 characters and remain
stable. Tokens are encrypted with AES-256-GCM in the SQL database, bound to the
anonymous browser owner, and never sent to client JavaScript. OAuth uses state
and PKCE. The connection requests offline access and refreshes expired access
tokens. Clearing browser cookies requires reconnecting. **Disconnect** removes
stored credentials from PathWayve; users can additionally revoke the app in their
Google account settings.

Run `npm run db:migrate` on deployments to create the connection table. Local
embedded PostgreSQL initializes it automatically, including after hot reloads.

## Import, Plan, Export

Choose a source calendar and an inclusive date range (up to 31 days), then
**Import Google events**. Recurring instances are expanded by Google, including
exceptions; canceled or declined events are excluded. All-day boundaries use the
source calendar's timezone and account for DST. Up to 200 events are supported;
larger results require a smaller range rather than silently dropping events.

**Plan around these events** opens the planner chat with the calendar range
attached. Describe new activities and provide a start/destination if needed.
Each planning request reloads the current Google events, so local edits to an
imported copy do not change the original commitments used for planning. Busy
events constrain both travel and activities; events marked available do not.
The saved schedule includes a snapshot of those commitments. The planner reserves
their time but does not route to their locations. Review travel to in-person
appointments separately. Calendar-constrained saves do not use the older manual
route editor, which cannot preserve those constraints.

Choose a writable destination and **Export to Google Calendar** to send the
selected imported calendar and/or current itinerary. Imported Google events are
exported as PathWayve-managed copies, never edits to the original events. Stable
Google event IDs make retries and repeated exports update previously exported
copies instead of adding duplicates. Partial failures report counts and allow a
retry. Removing an event locally does not delete it from Google. This is explicit
import/export, not continuous bidirectional synchronization.

## Calendar Files

Open **Calendar** in the workspace header to import an `.ics` file, edit event
titles, locations and times, and export it again. Imports stay in the current tab;
export before closing or refreshing. Importing another file replaces the current
import. Up to 200 event records and 1 MB per file are supported.

Select **Include current itinerary** to combine imported events with the current
editable route, including travel. Without an editable route, the currently opened
saved schedule is used. **Export saved calendar** exports that saved snapshot only.
Unscheduled activities are omitted. Exported itinerary timestamps use UTC, so
calendar apps can display them in their own time zone. Stable event IDs prevent
duplicate itinerary events when combining an exported file inside PathWayve;
external calendar apps determine how repeated file imports behave.

Imported time zones, all-day dates, recurrence rules, exceptions and alarms are
preserved through ICAL.js. Recurring times are read-only in this first version;
titles and locations can be edited. All-day end dates are exclusive.

In Google Calendar on desktop, use **Settings > Import & export > Import** and
select the exported `.ics` file and destination calendar. To import a Google
Calendar into PathWayve, export it there first and select an `.ics` file from the
downloaded archive.

File-only imports do not automatically constrain route planning. The Google
planning action above uses fresh events from the selected Google calendar.
Recurring series in uploaded files retain their rules for `.ics` export; direct
Google export requires nonrecurring events or expanded Google imports.

References: [Google OAuth web-server flow](https://developers.google.com/identity/protocols/oauth2/web-server),
[event listing](https://developers.google.com/workspace/calendar/api/v3/reference/events/list),
[event insertion](https://developers.google.com/workspace/calendar/api/v3/reference/events/insert).
