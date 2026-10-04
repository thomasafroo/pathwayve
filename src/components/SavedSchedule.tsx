"use client";
import { Fragment } from "react";
import type { ScheduleDocument } from "@/types/schedule";
import { TravelLeg } from "./TravelLeg";
import { PlaceInsight } from "./PlaceInsight";
import { downloadCalendar, savedScheduleCalendar } from "@/lib/calendar";
import { Icon } from "./Icon";

export function SavedSchedule({
  document,
  onClose,
  showRoute = true,
  persisted = false,
  onImport,
  onDelete,
  busy = false,
}: {
  document: ScheduleDocument;
  onClose: () => void;
  // Off when the editable itinerary below already shows the same legs.
  showRoute?: boolean;
  // True once this snapshot is stored in the signed-in user's account.
  persisted?: boolean;
  onImport?: () => void;
  onDelete?: () => void;
  busy?: boolean;
}) {
  const schedule = document.schedules[0],
    run = document.schedule_runs[0];
  const mapTrip = run.result.map_trip;
  const time = (iso: string) =>
    new Intl.DateTimeFormat(undefined, {
      timeZone: schedule.time_zone,
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  function download() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(document, null, 2)], {
        type: "application/json",
      }),
    );
    const link = window.document.createElement("a");
    link.href = url;
    link.download = `pathwayve-schedule-${schedule.id}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <section
      className="saved-schedule card"
      aria-label="Saved schedule details"
    >
      <div className="saved-schedule-heading">
        <div>
          <p className="eyebrow">
            {persisted ? "SAVED SCHEDULE" : "UNSAVED DRAFT"} · {run.status}
          </p>
          <h2>{schedule.name}</h2>
        </div>
        <button type="button" className="text-button" onClick={onClose}>
          Close
        </button>
      </div>
      <p>
        {time(schedule.starts_at)} – {time(schedule.ends_at)} ·{" "}
        {schedule.time_zone}
      </p>
      <ol className="saved-items">
        {document.schedule_items.map((item) => {
          const placement = run.result.placements.find(
            (entry) => entry.item_id === item.id,
          );
          const unscheduled = run.result.unscheduled_items.find(
            (entry) => entry.item_id === item.id,
          );
          const insight = placement
            ? mapTrip?.stops.find((stop) => stop.id === placement.place_id)
                ?.insight
            : undefined;
          return (
            <li key={item.id}>
              <strong>{item.title}</strong>
              <span>
                {item.duration_minutes} min · {item.priority} ·{" "}
                {item.timing_type}
              </span>
              <p>
                {placement
                  ? `${time(placement.starts_at)} – ${time(placement.ends_at)}`
                  : `Not scheduled: ${unscheduled?.reason || "Awaiting planning."}`}
              </p>
              {item.place_query && (
                <small>Place search: {item.place_query}</small>
              )}
              {insight && <PlaceInsight insight={insight} />}
            </li>
          );
        })}
      </ol>
      {!!run.result.calendar_events?.length && (
        <section
          aria-label="Calendar commitments"
          className="saved-calendar-events"
        >
          <h3>Calendar commitments</h3>
          <ol className="saved-items">
            {run.result.calendar_events.map((event) => (
              <li key={event.uid}>
                <strong>{event.title}</strong>
                <span>
                  {event.allDay
                    ? `${event.dateStart} - ${event.dateEnd} (all-day, end exclusive)`
                    : `${time(event.start)} - ${time(event.end)}`}
                </span>
                {event.location && <small>{event.location}</small>}
                {!event.busy && <small>Available</small>}
              </li>
            ))}
          </ol>
        </section>
      )}
      {showRoute && mapTrip && mapTrip.legs.length > 0 && (
        <section className="saved-route" aria-label="Route directions">
          <h3>Route</h3>
          <ol className="stops">
            {mapTrip.legs.map((leg, index) => (
              <Fragment key={index}>
                <li className="saved-route-endpoints">
                  {leg.from} → {leg.to}
                </li>
                <TravelLeg
                  leg={leg}
                  mode={leg.mode ?? mapTrip.request.transportation}
                />
              </Fragment>
            ))}
          </ol>
        </section>
      )}
      {run.result.warnings.map((warning) => (
        <p className="hint" key={warning}>
          {warning}
        </p>
      ))}
      <p className="hint">
        {persisted
          ? "Saved in your account."
          : "Not saved yet. Press Save schedule to keep this version in your private account."}{" "}
        Calculated {time(run.calculated_at)}. Reopening does not refresh routes.
      </p>
      {!run.result.map_trip && run.status !== "failed" && (
        <p className="hint">
          This older save has no map geometry. Generate a new schedule to
          display its route.
        </p>
      )}
      <div className="schedule-actions">
        {onImport && (
          <button
            className="secondary"
            onClick={onImport}
            disabled={busy || !mapTrip}
          >
            Import places to planner
          </button>
        )}
        {onDelete && persisted && (
          <button className="secondary" onClick={onDelete} disabled={busy}>
            Delete schedule
          </button>
        )}
      </div>
      {onImport &&
        document.schedule_items.some(
          (item) => item.kind === "task" || item.timing_type !== "flexible",
        ) && (
          <p className="hint">
            Import copies mapped places. Appointment rules and standalone tasks
            stay in this snapshot; add them to your new plan through chat.
          </p>
        )}
      <button className="secondary" type="button" onClick={download}>
        Download saved schedule JSON
      </button>
      <button
        className="secondary"
        type="button"
        disabled={
          run.status === "failed" ||
          (!run.result.placements.length && !run.result.travel_legs.length)
        }
        onClick={() =>
          downloadCalendar(
            savedScheduleCalendar(document),
            `pathwayve-saved-${schedule.id}`,
          )
        }
      >
        <Icon name="download" size={16} />
        Export saved calendar
      </button>
    </section>
  );
}
