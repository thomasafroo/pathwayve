"use client";
import Link from "next/link";
import { useState } from "react";
import type { Location, TripEvent, TripRequest } from "@/types/trip";
import type { TripModification, WorkspaceTrip } from "@/types/workspace";
import {
  applyModifications,
  createWorkspace,
  receiveReplan,
} from "@/lib/trip-workspace";
import { tripClient } from "@/lib/trip-client";
import { TripForm } from "./TripForm";
import { Map } from "./Map";
import { Itinerary } from "./Itinerary";
import { ReplanControls } from "./ReplanControls";
import { AddActivityDialog, AddStopDialog } from "./TripEditors";
import { Icon } from "./Icon";
import { formatTime } from "./StopCard";
import { WeatherCard } from "./WeatherCard";

export function Planner({ mode }: { mode: "demo" | "live" }) {
  const [panel, setPanel] = useState<"plan" | "itinerary">("plan");
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [brief, setBrief] = useState("");
  const [savedBrief, setSavedBrief] = useState("");
  const [state, setState] = useState<WorkspaceTrip | null>(null);
  const [history, setHistory] = useState<WorkspaceTrip[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editor, setEditor] = useState<"stop" | "activity" | null>(null);
  const [activityStop, setActivityStop] = useState("");
  const [pickedLocation, setPickedLocation] = useState<Location | null>(null);
  const [picking, setPicking] = useState(false);
  const trip = state?.trip ?? null;
  function commit(next: WorkspaceTrip) {
    if (state) setHistory((previous) => [...previous.slice(-19), state]);
    setState(next);
    if (!next.trip.stops.some((s) => s.id === selectedId)) setSelectedId(null);
  }
  async function modify(change: TripModification): Promise<boolean> {
    if (!state || busy) return false;
    setError("");
    setBusy(true);
    try {
      const batch = {
        tripId: state.trip.id,
        baseVersion: state.version,
        modifications: [change],
      };
      const next =
        state.trip.source === "live"
          ? await tripClient.edit(state, batch)
          : applyModifications(state, batch);
      commit(next);
      const messages: Record<TripModification["type"], string> = {
        ADD_STOP: "A new stop, a new possibility. Your route has been updated.",
        REMOVE_STOP: "Stop removed. Your remaining day has been rescheduled.",
        MOVE_STOP:
          "A fresh order. Travel and arrival estimates have been updated.",
        CHANGE_DURATION:
          "Time updated. The rest of your day has adjusted around it.",
        SET_LOCK: "Stop preference updated.",
        ADD_ACTIVITY: "Time set aside. Your activity will move with this stop.",
        REMOVE_ACTIVITY: "Activity removed. That time is yours again.",
        COMPLETE_ACTIVITY: "Activity updated.",
      };
      setMessage(messages[change.type]);
      return true;
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "We couldn't make that change.",
      );
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function onPlan(request: TripRequest) {
    setBusy(true);
    setError("");
    try {
      const next = createWorkspace(await tripClient.plan(request));
      setState(next);
      setHistory([]);
      setSelectedId(null);
      setPicking(false);
      setMessage(next.trip.summary);
      setPanel("itinerary");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "We couldn't plan your day.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function onReplan(event: TripEvent) {
    if (!state) return;
    setBusy(true);
    setError("");
    try {
      const next = receiveReplan(
        state,
        await tripClient.replan(state.trip, event),
      );
      commit(next);
      setMessage(next.trip.summary);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "We couldn't update your day.",
      );
    } finally {
      setBusy(false);
    }
  }
  function undo() {
    const previous = history.at(-1);
    if (!previous || !state) return;
    setState({
      ...previous,
      version: state.version + 1,
      trip: { ...previous.trip, lastUpdated: new Date().toISOString() },
    });
    setHistory(history.slice(0, -1));
    setSelectedId(null);
    setError("");
    setMessage("Change undone. Your previous plan is back.");
  }
  function download() {
    if (!state) return;
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(state, null, 2)], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `pathwayve-${state.trip.id}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function selectStop(id: string) {
    setSelectedId(id || null);
  }
  const travel =
    trip?.legs.reduce((sum, leg) => sum + leg.durationMinutes, 0) ?? 0;
  const spare = trip
    ? Math.max(
        0,
        Math.round(
          (Date.parse(trip.request.endTime) - Date.parse(trip.arrivalTime)) /
            60000,
        ),
      )
    : 0;
  return (
    <div className="maps-workspace">
      <nav className="workspace-rail" aria-label="Main navigation">
        <Link className="rail-brand" href="/" aria-label="PathWayve home">
          <Icon name="route" size={27} />
        </Link>
        <button
          aria-label="Open trip planner"
          aria-pressed={panel === "plan"}
          onClick={() => setPanel("plan")}
        >
          <Icon name="route" />
          <span>Explore</span>
        </button>
        <button
          aria-label="Open itinerary"
          aria-pressed={panel === "itinerary"}
          onClick={() => setPanel("itinerary")}
        >
          <Icon name="layers" />
          <span>Your trip</span>
        </button>
        <button
          aria-label="Open AI companion"
          aria-pressed={assistantOpen}
          onClick={() => setAssistantOpen(!assistantOpen)}
        >
          <Icon name="sparkle" />
          <span>Assistant</span>
        </button>
        <div className="rail-bottom">
          <span className="rail-avatar">PW</span>
          <span>Workspace</span>
        </div>
      </nav>
      <main className="map-workspace-main">
        <aside className="directions-panel" aria-label="Trip planning panel">
          <header className="panel-brand">
            <Link href="/" className="wordmark">
              pathwayve<span className="brand-dot">.</span>
            </Link>
            <span className="workspace-label">
              {mode === "demo" ? "Demo" : "Live maps"}
            </span>
          </header>
          <div className="panel-tabs" role="tablist" aria-label="Trip views">
            <button
              id="plan-tab"
              role="tab"
              aria-selected={panel === "plan"}
              aria-controls="plan-panel"
              onClick={() => setPanel("plan")}
            >
              Plan a trip
            </button>
            <button
              id="itinerary-tab"
              role="tab"
              aria-selected={panel === "itinerary"}
              aria-controls="itinerary-panel"
              onClick={() => setPanel("itinerary")}
            >
              Your itinerary {trip && <span>{trip.stops.length}</span>}
            </button>
          </div>
          {error && (
            <div role="alert" className="error">
              <span>{error}</span>
              <button
                className="icon-button"
                onClick={() => setError("")}
                aria-label="Dismiss error"
              >
                <Icon name="close" size={17} />
              </button>
            </div>
          )}
          <div
            id="plan-panel"
            role="tabpanel"
            aria-labelledby="plan-tab"
            hidden={panel !== "plan"}
            className="panel-content"
          >
            <TripForm
              busy={busy}
              onPlan={onPlan}
              mode={mode}
              currentTrip={trip}
            />
          </div>
          <div
            id="itinerary-panel"
            role="tabpanel"
            aria-labelledby="itinerary-tab"
            hidden={panel !== "itinerary"}
            className="panel-content"
          >
            {trip && state ? (
              <>
                <div className="trip-toolbar">
                  <div className="trip-stat">
                    <Icon name="clock" size={18} />
                    <span>
                      <strong>{travel} min</strong>travel time
                    </span>
                  </div>
                  <div className="trip-stat">
                    <span>
                      <strong>{formatTime(trip.arrivalTime)}</strong>arrival
                    </span>
                  </div>
                  <div className="toolbar-actions">
                    <button
                      className="icon-button"
                      title="Undo last change"
                      aria-label="Undo last change"
                      disabled={!history.length || busy}
                      onClick={undo}
                    >
                      <Icon name="undo" size={18} />
                    </button>
                    <button
                      className="icon-button"
                      title="Download trip JSON"
                      aria-label="Download trip JSON"
                      onClick={download}
                      disabled={busy}
                    >
                      <Icon name="download" size={18} />
                    </button>
                  </div>
                </div>
                <div className="change-message">
                  <Icon name="check" size={16} />
                  <p role="status" aria-live="polite">
                    {message}
                  </p>
                </div>
                <Itinerary
                  state={state}
                  selectedId={selectedId}
                  onSelect={selectStop}
                  onModify={modify}
                  onActivity={(id) => {
                    setActivityStop(id);
                    setEditor("activity");
                  }}
                  onAdd={() => {
                    setPickedLocation(null);
                    setEditor("stop");
                  }}
                  busy={busy}
                />
                <div className="itinerary-extras">
                  <button
                    className="secondary"
                    disabled={busy || trip.stops.length >= 6}
                    onClick={() => {
                      if (process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY)
                        setPicking(true);
                      else {
                        setPickedLocation(null);
                        setEditor("stop");
                      }
                    }}
                  >
                    <Icon name="pin" size={16} />
                    {process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
                      ? "Pick on map"
                      : "Add a place"}
                  </button>
                  <WeatherCard
                    weather={trip.weather}
                    advice={trip.bringAdvice}
                  />
                  <ReplanControls trip={trip} busy={busy} onReplan={onReplan} />
                  <details className="data-note">
                    <summary>
                      {trip.source === "demo"
                        ? "About this sample trip"
                        : "About your route"}
                    </summary>
                    {trip.warnings.map((warning) => (
                      <p key={warning}>{warning}</p>
                    ))}
                    <p>
                      Your trip stays in this tab. Download the JSON to keep a
                      copy.
                    </p>
                  </details>
                </div>
              </>
            ) : (
              <div className="panel-empty">
                <span className="empty-symbol">
                  <Icon name="route" size={30} />
                </span>
                <h2>
                  A little direction.
                  <br />A lot of possibility.
                </h2>
                <p>
                  Choose where you’re starting and where you want to go. Your
                  stops and directions will appear here.
                </p>
                <button className="primary" onClick={() => setPanel("plan")}>
                  Plan your first trip <Icon name="arrow" size={17} />
                </button>
              </div>
            )}
          </div>
          {panel === "plan" && (
            <div className="plan-submit">
              <button
                type="submit"
                form="trip-planner-form"
                className="primary"
                disabled={busy}
              >
                {busy ? "Finding your route…" : "Plan my day"}
                <Icon name="arrow" size={18} />
              </button>
              <span>Stops stay in your chosen order</span>
            </div>
          )}
          <div className="panel-bottom">
            <Icon name="clock" size={13} />
            <span>
              {trip
                ? `${spare} minutes left in your time window`
                : "Your day, at your own pace"}
            </span>
            <Icon name="sparkle" size={13} />
          </div>
        </aside>
        <div className="map-canvas">
          <Map
            trip={trip}
            selectedId={selectedId}
            onSelect={(id) => {
              selectStop(id);
              if (id) setPanel("itinerary");
            }}
            picking={picking}
            onPick={(location) => {
              setPickedLocation(location);
              setPicking(false);
              setEditor("stop");
            }}
            onCancelPick={() => setPicking(false)}
          />
          {!assistantOpen && (
            <button
              className="assistant-launcher"
              onClick={() => setAssistantOpen(true)}
            >
              <span>
                <Icon name="sparkle" size={20} />
              </span>
              <div>
                <strong>A little help along the way</strong>
                <small>Meet your AI companion · Coming soon</small>
              </div>
              <Icon name="arrow" size={17} />
            </button>
          )}
          {assistantOpen && (
            <section className="assistant-panel" aria-label="AI companion">
              <header>
                <span className="assistant-symbol">
                  <Icon name="sparkle" size={22} />
                </span>
                <div>
                  <h2>Your travel companion</h2>
                  <span>AI preview · Not connected</span>
                </div>
                <button
                  className="icon-button"
                  aria-label="Close AI companion"
                  onClick={() => setAssistantOpen(false)}
                >
                  <Icon name="close" size={18} />
                </button>
              </header>
              <div className="assistant-body">
                <span className="eyebrow">
                  LESS PLANNING. MORE POSSIBILITY.
                </span>
                <h3>
                  What would make
                  <br />
                  this your kind of day?
                </h3>
                <p>
                  Save a brief for your trip. Gemini will be connected later to
                  turn requests into proposed changes you can review.
                </p>
                <div className="prompt-suggestions">
                  {[
                    "Find a quiet café along my route",
                    "Leave time for a walk by the water",
                    "Keep my favourite stops, shorten the day",
                  ].map((prompt) => (
                    <button key={prompt} onClick={() => setBrief(prompt)}>
                      <Icon name="plus" size={14} />
                      {prompt}
                    </button>
                  ))}
                </div>
                {trip && (
                  <div className="assistant-trip-context">
                    <Icon name="route" size={18} />
                    <div>
                      <strong>{trip.request.destination.name}</strong>
                      <span>
                        {trip.stops.length} stops ·{" "}
                        {trip.request.transportation} · {travel} min travel
                      </span>
                    </div>
                  </div>
                )}
                <label htmlFor="trip-brief">
                  Your trip brief
                  <textarea
                    id="trip-brief"
                    value={brief}
                    onChange={(e) => setBrief(e.target.value)}
                    maxLength={1000}
                    rows={4}
                    placeholder="I’d like to stop for coffee, visit a bookstore…"
                  />
                </label>
                <button
                  className="primary"
                  disabled={!brief.trim()}
                  onClick={() => setSavedBrief(brief.trim())}
                >
                  Save brief for this session <Icon name="check" size={16} />
                </button>
                {savedBrief && (
                  <p className="brief-confirmation">Saved: {savedBrief}</p>
                )}
                <p className="assistant-disclosure">
                  Saving a brief does not change your route. You can add places
                  and activities from your itinerary now.
                </p>
              </div>
            </section>
          )}
        </div>
      </main>
      {editor === "stop" && state && (
        <AddStopDialog
          state={state}
          location={pickedLocation}
          onApply={modify}
          onClose={() => setEditor(null)}
        />
      )}
      {editor === "activity" && state && (
        <AddActivityDialog
          state={state}
          stopId={activityStop}
          onApply={modify}
          onClose={() => setEditor(null)}
        />
      )}
    </div>
  );
}
