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
    <>
      <header className="site-header">
        <Link className="wordmark" href="/" aria-label="PathWayve home">
          <span className="brand-symbol">
            <Icon name="route" size={23} />
          </span>
          pathwayve<span className="brand-dot">.</span>
        </Link>
        <nav aria-label="Main navigation">
          <a className="active" href="#trip-map">
            Trip planner
          </a>
          {trip && <a href="#itinerary">My itinerary</a>}
        </nav>
        <span className="mode-label">
          <span />
          {mode === "demo" ? "Demo workspace" : "Live workspace"}
        </span>
      </header>
      <main className="app-main">
        <div className="page-heading">
          <div>
            <p className="eyebrow">LESS PLANNING. MORE LIVING.</p>
            <h1>
              Make a day of it<span>.</span>
            </h1>
            <p>
              The places you’ll go. The things you’ll do. Room for the
              unexpected.
            </p>
          </div>
          <div className="heading-detail">
            <Icon name="pin" size={17} />
            <span>
              Made for the journey
              <br />
              <strong>Vancouver & beyond</strong>
            </span>
          </div>
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
        <div className="workspace" aria-busy={busy}>
          <aside className="planning-sidebar">
            <div className="card">
              <TripForm
                busy={busy}
                onPlan={onPlan}
                mode={mode}
                currentTrip={trip}
              />
            </div>
            <div className="sidebar-note">
              <Icon name="layers" size={18} />
              <p>
                <strong>Your day, still yours.</strong>Keep the stops you love.
                Move things around. Make time for something new.
              </p>
            </div>
          </aside>
          <div className="results">
            <div className="map-section-heading">
              <div>
                <span className="live-dot" />
                {trip ? "Your day, on the map" : "A world of little detours"}
              </div>
              <span>
                {trip
                  ? `${trip.stops.length} stops · ${trip.request.transportation}`
                  : "Start with a destination"}
              </span>
            </div>
            <Map
              trip={trip}
              selectedId={selectedId}
              onSelect={selectStop}
              picking={picking}
              onPick={(location) => {
                setPickedLocation(location);
                setPicking(false);
                setEditor("stop");
              }}
              onCancelPick={() => setPicking(false)}
            />
            {trip && state ? (
              <>
                <div className="trip-toolbar">
                  <div className="trip-stat">
                    <Icon name="clock" size={19} />
                    <span>
                      <strong>{travel} min</strong>estimated travel
                    </span>
                  </div>
                  <div className="trip-stat">
                    <Icon name="pin" size={19} />
                    <span>
                      <strong>{formatTime(trip.arrivalTime)}</strong>arrival
                    </span>
                  </div>
                  <div className="trip-stat">
                    <Icon name="sparkle" size={19} />
                    <span>
                      <strong>{spare} min</strong>room to breathe
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
                  <Icon name="check" size={17} />
                  <p role="status" aria-live="polite">
                    {message}
                  </p>
                </div>
                <div className="itinerary-layout">
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
                  <div className="context-column">
                    <WeatherCard
                      weather={trip.weather}
                      advice={trip.bringAdvice}
                    />
                    <ReplanControls
                      trip={trip}
                      busy={busy}
                      onReplan={onReplan}
                    />
                    <section className="add-place-card card">
                      <Icon name="pin" size={23} />
                      <h3>A spot in mind?</h3>
                      <p>
                        Make a detour for your favourite place, or something
                        you’ve always wanted to try.
                      </p>
                      <button
                        className="secondary"
                        disabled={busy || trip.stops.length >= 6}
                        onClick={() => {
                          if (process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY) {
                            setPicking(true);
                            document
                              .getElementById("trip-map")
                              ?.scrollIntoView({
                                behavior: "smooth",
                                block: "center",
                              });
                          } else {
                            setPickedLocation(null);
                            setEditor("stop");
                          }
                        }}
                      >
                        <Icon name="plus" size={16} />
                        {process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
                          ? "Pick on map"
                          : "Add a place"}
                      </button>
                    </section>
                  </div>
                </div>
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
                    {trip.source === "demo"
                      ? "Edits use straight-line travel estimates. Weather events are simulated; no live forecast or AI planning is connected to this demo."
                      : "Routes are calculated by Google for your selected transport mode. Weather comes from Open-Meteo when enabled; no AI forecast is generated."}{" "}
                    Your trip stays in this tab; download it before refreshing
                    if you want a copy.
                  </p>
                </details>
              </>
            ) : (
              <section className="empty-itinerary card">
                <div className="empty-art">
                  <Icon name="route" size={34} />
                  <span className="mini-sparkle">✦</span>
                </div>
                <div>
                  <p className="eyebrow">GOOD DAYS START SOMEWHERE</p>
                  <h2>Your next story starts here.</h2>
                  <p>
                    Tell us where you’re going. We’ll connect the dots, with a
                    few good stops along the way.
                  </p>
                  <div className="empty-features">
                    <span>
                      <Icon name="pin" size={14} />
                      Places worth a pause
                    </span>
                    <span>
                      <Icon name="clock" size={14} />
                      Time for what matters
                    </span>
                    <span>
                      <Icon name="route" size={14} />
                      Room to change
                    </span>
                  </div>
                </div>
              </section>
            )}
          </div>
        </div>
      </main>
      <footer className="site-footer">
        <span>
          pathwayve. <span>Enjoy the in-between.</span>
        </span>
        <span>Made with curiosity · StormHacks 2026</span>
      </footer>
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
    </>
  );
}
