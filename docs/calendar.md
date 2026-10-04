# Calendar files

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

This is file exchange, not live synchronization. Google OAuth, fetching existing
Google events directly, and using imported events as hard scheduling constraints
are not implemented yet. Imported events are combined for export; they do not
automatically change route planning or resolve overlaps.
