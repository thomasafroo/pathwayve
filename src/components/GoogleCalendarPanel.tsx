"use client";
import { useEffect, useRef, useState } from "react";
import type {
  CalendarSelection,
  GoogleCalendarSummary,
} from "@/types/calendar";

type Status = {
  configured: boolean;
  connected: boolean;
  calendars: GoogleCalendarSummary[];
};
async function api(path: string, init?: RequestInit) {
  const response = await fetch(path, init);
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error?.message || "Google Calendar request failed.");
  return data;
}
function today() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function GoogleCalendarPanel({
  onImport,
  exportText,
  onPlan,
}: {
  onImport: (text: string | null) => void;
  exportText: string | null;
  onPlan: (selection: CalendarSelection) => void;
}) {
  const [status, setStatus] = useState<Status | null>(null);
  const [calendarId, setCalendarId] = useState("");
  const [targetId, setTargetId] = useState("");
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [busy, setBusy] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loaded, setLoaded] = useState<CalendarSelection | null>(null);
  const popup = useRef<Window | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  async function refresh() {
    const next: Status = await api("/api/google-calendar");
    setStatus(next);
    const primary =
      next.calendars.find((item) => item.primary) || next.calendars[0];
    setCalendarId((current) =>
      next.calendars.some((item) => item.id === current)
        ? current
        : primary?.id || "",
    );
    setTargetId((current) =>
      next.calendars.some(
        (item) =>
          item.id === current && ["owner", "writer"].includes(item.accessRole),
      )
        ? current
        : next.calendars.find((item) =>
            ["owner", "writer"].includes(item.accessRole),
          )?.id || "",
    );
  }
  useEffect(() => {
    let active = true;
    api("/api/google-calendar")
      .then((next: Status) => {
        if (!active) return;
        setStatus(next);
        setCalendarId(
          (next.calendars.find((item) => item.primary) || next.calendars[0])
            ?.id || "",
        );
        setTargetId(
          next.calendars.find((item) =>
            ["owner", "writer"].includes(item.accessRole),
          )?.id || "",
        );
      })
      .catch((err) => {
        if (active) setError(err.message);
      });
    return () => {
      active = false;
      if (timer.current) clearInterval(timer.current);
      popup.current?.close();
    };
  }, []);
  async function connect() {
    const opened = window.open(
      "about:blank",
      "pathwayve-google-calendar",
      "popup,width=520,height=700",
    );
    if (!opened) {
      setError("Allow the Google sign-in popup, then try again.");
      return;
    }
    popup.current = opened;
    setConnecting(true);
    setError("");
    try {
      const result = await api("/api/google-calendar/connect", {
        method: "POST",
      });
      opened.location.href = result.url;
      timer.current = setInterval(() => {
        if (!opened.closed) return;
        if (timer.current) clearInterval(timer.current);
        setConnecting(false);
        void refresh().catch((err) => setError(err.message));
      }, 500);
    } catch (err) {
      opened.close();
      setConnecting(false);
      setError(
        err instanceof Error ? err.message : "Could not connect Google.",
      );
    }
  }
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (
        event.origin !== window.location.origin ||
        event.source !== popup.current ||
        event.data?.type !== "pathwayve-google"
      )
        return;
      if (event.data.result !== "connected")
        setError(
          "Google connection failed or permission was declined. Try connecting again and grant both calendar permissions.",
        );
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, []);
  const selection = { calendarId, startDate, endDate };
  const loadedCurrent =
    loaded && JSON.stringify(loaded) === JSON.stringify(selection);
  return (
    <section className="google-calendar-panel" aria-label="Google Calendar">
      <h3>Google Calendar</h3>
      {error && (
        <p role="alert" className="chat-error">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      {!status && !error && <p role="status">Checking connection...</p>}
      {status?.configured === false && (
        <p>
          Google Calendar is unavailable until the server credentials are
          configured.
        </p>
      )}
      {(status?.configured || error) && (
        <div className="calendar-actions">
          <button
            type="button"
            className="secondary"
            disabled={connecting || busy}
            onClick={() => void connect()}
          >
            {connecting
              ? "Connecting..."
              : status?.connected
                ? "Reconnect Google"
                : "Connect Google Calendar"}
          </button>
          {status?.connected && (
            <button
              type="button"
              className="text-button"
              disabled={busy || connecting}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  await api("/api/google-calendar", { method: "DELETE" });
                  setLoaded(null);
                  await refresh();
                  setMessage("Google Calendar disconnected.");
                } catch (err) {
                  setError(
                    err instanceof Error
                      ? err.message
                      : "Could not disconnect.",
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              Disconnect
            </button>
          )}
        </div>
      )}
      {status?.connected && (
        <>
          <label>
            Source calendar
            <select
              value={calendarId}
              disabled={busy}
              onChange={(event) => setCalendarId(event.target.value)}
            >
              {status.calendars.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.summary}
                </option>
              ))}
            </select>
          </label>
          <div className="calendar-date-range">
            <label>
              From
              <input
                type="date"
                value={startDate}
                disabled={busy}
                onChange={(event) => setStartDate(event.target.value)}
              />
            </label>
            <label>
              Through
              <input
                type="date"
                value={endDate}
                min={startDate}
                disabled={busy}
                onChange={(event) => setEndDate(event.target.value)}
              />
            </label>
          </div>
          <div className="calendar-actions">
            <button
              type="button"
              className="secondary"
              disabled={
                busy ||
                !calendarId ||
                !startDate ||
                !endDate ||
                endDate < startDate
              }
              onClick={async () => {
                setBusy(true);
                setError("");
                setMessage("");
                try {
                  const result = await api(
                    `/api/google-calendar?${new URLSearchParams(selection)}`,
                  );
                  onImport(result.ics);
                  setLoaded(selection);
                  setMessage(
                    result.events.length
                      ? `Imported ${result.events.length} events from ${result.calendar.summary}.`
                      : "No events in this date range.",
                  );
                } catch (err) {
                  setError(
                    err instanceof Error
                      ? err.message
                      : "Could not import events.",
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Working..." : "Import Google events"}
            </button>
            <button
              type="button"
              className="secondary"
              disabled={busy || !loadedCurrent}
              onClick={() => onPlan(selection)}
            >
              Plan around these events
            </button>
          </div>
          <label>
            Export to
            <select
              value={targetId}
              disabled={busy}
              onChange={(event) => setTargetId(event.target.value)}
            >
              {status.calendars
                .filter((item) => ["owner", "writer"].includes(item.accessRole))
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.summary}
                  </option>
                ))}
            </select>
          </label>
          <button
            type="button"
            className="secondary"
            disabled={busy || !targetId || !exportText}
            onClick={async () => {
              setBusy(true);
              setError("");
              setMessage("");
              try {
                const result = await api("/api/google-calendar", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    calendarId: targetId,
                    ics: exportText,
                  }),
                });
                setMessage(
                  `${result.created} created, ${result.updated} updated in Google Calendar.`,
                );
                if (!result.complete)
                  setError(
                    `${result.error} ${result.total - result.created - result.updated} events remain. Retry to finish without duplicating exported events.`,
                  );
              } catch (err) {
                setError(
                  err instanceof Error
                    ? err.message
                    : "Could not export events.",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            Export to Google Calendar
          </button>
          <p className="hint">
            Imported events export as separate PathWayve copies. Original Google
            events stay unchanged.
          </p>
        </>
      )}
    </section>
  );
}
