"use client";

import { useEffect, useRef, useState } from "react";
import {
  calendarEntries,
  downloadCalendar,
  editCalendarEvent,
  MAX_CALENDAR_BYTES,
  mergeCalendars,
  readCalendar,
} from "@/lib/calendar";
import { Icon } from "./Icon";

export function CalendarDialog({
  imported,
  onImport,
  planned,
  onClose,
}: {
  imported: string | null;
  onImport: (text: string | null) => void;
  planned: string | null;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [includePlan, setIncludePlan] = useState(Boolean(planned));
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  const events = imported ? calendarEntries(imported) : [];
  return (
    <dialog
      ref={dialog}
      className="editor-dialog calendar-dialog"
      aria-labelledby="calendar-title"
      onCancel={onClose}
    >
      <div className="dialog-inner">
        <div className="dialog-heading">
          <h2 id="calendar-title">Calendar</h2>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            title="Close calendar"
            aria-label="Close calendar"
          >
            <Icon name="close" />
          </button>
        </div>
        <label className="calendar-upload">
          Import .ics
          <input
            type="file"
            accept=".ics,text/calendar"
            disabled={loading}
            onChange={async (event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              setLoading(true);
              setError("");
              try {
                if (file.size > MAX_CALENDAR_BYTES)
                  throw new Error("Choose a calendar smaller than 1 MB.");
                const text = await file.text();
                const parsed = readCalendar(text);
                onImport(parsed.toString());
                setMessage(
                  `Imported ${parsed.getAllSubcomponents("vevent").length} events. Kept in this tab until exported.`,
                );
              } catch (err) {
                setError(
                  err instanceof Error
                    ? err.message
                    : "Could not import calendar.",
                );
              } finally {
                setLoading(false);
              }
            }}
          />
        </label>
        {loading && <p role="status">Importing...</p>}
        {message && <p role="status">{message}</p>}
        {error && (
          <p role="alert" className="chat-error">
            {error}
          </p>
        )}
        <div className="calendar-events">
          {events.map((event) => (
            <details key={event.index}>
              <summary>
                <strong>{event.title}</strong>
                <span>
                  {event.start.replace("T", " ")} ·{" "}
                  {event.allDay ? "All day" : event.zone}
                  {event.recurring ? " · Recurring" : ""}
                </span>
              </summary>
              <form
                key={JSON.stringify(event)}
                onSubmit={(submit) => {
                  submit.preventDefault();
                  const data = new FormData(submit.currentTarget);
                  try {
                    onImport(
                      editCalendarEvent(imported!, event.index, {
                        title: String(data.get("title")),
                        location: String(data.get("location")),
                        start: String(data.get("start") || event.start),
                        end: String(data.get("end") || event.end),
                      }),
                    );
                    setError("");
                    setMessage("Event updated.");
                  } catch (err) {
                    setError(
                      err instanceof Error
                        ? err.message
                        : "Could not update event.",
                    );
                  }
                }}
              >
                <label>
                  Title
                  <input
                    name="title"
                    defaultValue={event.title}
                    maxLength={160}
                    required
                  />
                </label>
                <label>
                  Location
                  <input
                    name="location"
                    defaultValue={event.location}
                    maxLength={300}
                  />
                </label>
                <label>
                  Start ({event.zone})
                  <input
                    name="start"
                    type={event.allDay ? "date" : "datetime-local"}
                    step={event.allDay ? undefined : 1}
                    defaultValue={event.start}
                    required
                    disabled={event.recurring}
                  />
                </label>
                <label>
                  {event.allDay ? "End (exclusive)" : `End (${event.zone})`}
                  <input
                    name="end"
                    type={event.allDay ? "date" : "datetime-local"}
                    step={event.allDay ? undefined : 1}
                    defaultValue={event.end}
                    required
                    disabled={event.recurring}
                  />
                </label>
                {event.recurring && (
                  <p className="hint">
                    Series timing is preserved. Change recurring times in your
                    calendar app.
                  </p>
                )}
                <button type="submit" className="secondary">
                  Save event
                </button>
              </form>
            </details>
          ))}
        </div>
        {planned && (
          <label className="calendar-choice">
            <input
              type="checkbox"
              checked={includePlan}
              onChange={(event) => setIncludePlan(event.target.checked)}
            />
            Include current itinerary
          </label>
        )}
        <div className="calendar-actions">
          <button
            type="button"
            className="secondary"
            disabled={loading || (!imported && !(includePlan && planned))}
            onClick={() => {
              const output =
                imported && includePlan && planned
                  ? mergeCalendars(imported, planned)
                  : imported || (includePlan ? planned : null);
              if (output) downloadCalendar(output);
            }}
          >
            <Icon name="download" size={16} />
            Export .ics
          </button>
          {imported && (
            <button
              type="button"
              className="text-button"
              onClick={() => {
                onImport(null);
                setMessage("Imported events cleared.");
                setError("");
              }}
            >
              Clear import
            </button>
          )}
        </div>
      </div>
    </dialog>
  );
}
