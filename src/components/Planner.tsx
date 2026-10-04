"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import type { Location, TripEvent, TripRequest, TripState } from "@/types/trip";
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
import { TripChat, type TripChatMessage } from "./TripChat";
import { PlaceSearch } from "./PlaceSearch";
import type { CandidatePlace } from "@/types/trip";

export function Planner({ mode }: { mode: "demo" | "live" }) {
  const [itineraryOpen, setItineraryOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<TripChatMessage[]>([]);
  const [mapSearchOpen, setMapSearchOpen] = useState(false);
  const [pendingPlace, setPendingPlace] = useState<CandidatePlace | null>(null);
  const chatTrigger = useRef<HTMLButtonElement>(null);
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
      setItineraryOpen(true);
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
  const showItinerary = !!trip && itineraryOpen;
  function closeChat() {
    setAssistantOpen(false);
    chatTrigger.current?.focus();
  }
  function sendChatMessage(text: string) {
    const userMessage = createChatMessage("user", text);
    const assistantMessage = createChatMessage(
      "assistant",
      getTripChatReply(text, trip, { spare, travel }),
    );
    setChatMessages((previous) => [...previous, userMessage, assistantMessage]);
  }
  return (
    <div className={`maps-workspace ${showItinerary ? "has-itinerary" : ""}`}>
      <header className="workspace-header">
        <Link href="/" className="workspace-brand" aria-label="PathWayve home">
          <span>
            <Icon name="route" size={18} />
          </span>
          PathWayve
        </Link>
        <div className="workspace-heading-actions">
          <span className="trip-name">
            {trip?.request.destination.name ?? "New trip"}
          </span>
          <span className="workspace-mode">
            {mode === "demo" ? "Demo" : "Live"}
          </span>
          {trip && !itineraryOpen && (
            <button
              className="secondary"
              onClick={() => setItineraryOpen(true)}
            >
              <Icon name="layers" size={16} /> Open itinerary
            </button>
          )}
        </div>
      </header>
      <main className="map-workspace-main">
        <aside className="directions-panel" aria-label="Trip planning panel">
          <div className="panel-content">
            <TripForm
              busy={busy}
              onPlan={onPlan}
              mode={mode}
              currentTrip={trip}
              pendingPlace={pendingPlace}
            />
          </div>
          <div className="plan-submit">
            <button
              type="submit"
              form="trip-planner-form"
              className="primary"
              disabled={busy}
            >
              <Icon name="route" size={18} />
              {busy
                ? "Updating route..."
                : trip
                  ? "Update route"
                  : "Create itinerary"}
            </button>
          </div>
        </aside>
        <div className="map-canvas">
          <Map
            trip={trip}
            selectedId={selectedId}
            onSelect={(id) => {
              selectStop(id);
              if (id) setItineraryOpen(true);
            }}
            picking={picking}
            onPick={(location) => {
              setPickedLocation(location);
              setPicking(false);
              setEditor("stop");
            }}
            onCancelPick={() => setPicking(false)}
          />
          <div className="map-search">
            <button
              className="map-search-trigger"
              aria-expanded={mapSearchOpen}
              onClick={() => setMapSearchOpen(!mapSearchOpen)}
            >
              <Icon name="search" size={18} />
              <span>Search places{trip ? " along the route" : ""}</span>
              <Icon name={mapSearchOpen ? "close" : "plus"} size={16} />
            </button>
            {mapSearchOpen && (
              <div className="map-search-results">
                <PlaceSearch
                  label="Search map places"
                  disabled={busy}
                  near={trip?.request.destination.location}
                  onSelect={async (place) => {
                    if (trip) {
                      const added = await modify({
                        type: "ADD_STOP",
                        index: trip.stops.length,
                        stop: {
                          ...place,
                          durationMinutes: 30,
                          locked: false,
                          arrivalTime: trip.request.startTime,
                          reason: "Selected by you.",
                          priority: "required",
                        },
                      });
                      if (!added) return;
                      setItineraryOpen(true);
                    } else setPendingPlace(place);
                    setMapSearchOpen(false);
                  }}
                />
              </div>
            )}
          </div>
          {error && (
            <div role="alert" className="workspace-error">
              <span>{error}</span>
              <button
                className="icon-button"
                aria-label="Dismiss error"
                onClick={() => setError("")}
              >
                <Icon name="close" size={16} />
              </button>
            </div>
          )}
          {assistantOpen && (
            <TripChat
              compact={showItinerary}
              messages={chatMessages}
              onSend={sendChatMessage}
              onClose={closeChat}
            />
          )}
          <button
            ref={chatTrigger}
            className="chat-launcher"
            aria-label={assistantOpen ? "Close trip chat" : "Open trip chat"}
            title={assistantOpen ? "Close trip chat" : "Open trip chat"}
            aria-expanded={assistantOpen}
            aria-controls="trip-chat"
            onClick={() =>
              assistantOpen ? closeChat() : setAssistantOpen(true)
            }
          >
            <Icon name="chat" size={20} />
          </button>
          {trip && (
            <div className="route-summary" aria-label="Route summary">
              <div>
                <strong>{travel} min</strong>
                <span>Travel time</span>
              </div>
              <div>
                <strong>{formatTime(trip.arrivalTime)}</strong>
                <span>Arrival</span>
              </div>
              <div>
                <strong>{spare} min</strong>
                <span>Time remaining</span>
              </div>
              {!itineraryOpen && (
                <button
                  className="icon-button"
                  title="Open itinerary"
                  aria-label="Show itinerary"
                  onClick={() => setItineraryOpen(true)}
                >
                  <Icon name="layers" size={18} />
                </button>
              )}
            </div>
          )}
        </div>
        {showItinerary && state && trip && (
          <aside className="itinerary-panel" aria-label="Itinerary panel">
            <header className="itinerary-panel-header">
              <div>
                <h2>Itinerary</h2>
                <p>
                  {trip.stops.length} stops · {travel} min travel
                </p>
              </div>
              <button
                className="icon-button"
                aria-label="Close itinerary"
                title="Close itinerary"
                onClick={() => setItineraryOpen(false)}
              >
                <Icon name="close" size={18} />
              </button>
            </header>
            <div className="itinerary-scroll">
              <div className="schedule-status">
                <Icon name="check" size={16} />
                <span>
                  {spare > 0
                    ? `Fits your schedule · ${spare} min remaining`
                    : "No time remaining"}
                </span>
              </div>
              <p role="status" className="change-message" aria-live="polite">
                {message}
              </p>
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
              <div className="trip-toolbar">
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
                    disabled={busy}
                    onClick={download}
                  >
                    <Icon name="download" size={18} />
                  </button>
                </div>
              </div>
              <details className="itinerary-extras">
                <summary>Weather and trip updates</summary>
                <WeatherCard weather={trip.weather} advice={trip.bringAdvice} />
                <ReplanControls trip={trip} busy={busy} onReplan={onReplan} />
              </details>
              <details className="data-note">
                <summary>Route information</summary>
                {trip.warnings.map((warning) => (
                  <p key={warning}>{warning}</p>
                ))}
                <p>Your trip stays in this tab. Download a copy to keep it.</p>
              </details>
            </div>
          </aside>
        )}
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

function createChatMessage(
  role: TripChatMessage["role"],
  text: string,
): TripChatMessage {
  return {
    id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
    role,
    text,
  };
}

function getTripChatReply(
  message: string,
  trip: TripState | null,
  stats: { spare: number; travel: number },
) {
  const normalized = message.toLowerCase();
  if (!trip) {
    return "I can help once an itinerary exists. For now, tell me where you are starting, where you are going, and any stops you care about.";
  }

  if (/(weather|rain|umbrella|jacket|bring|wear|pack)/.test(normalized)) {
    return trip.bringAdvice?.message
      ? `${trip.bringAdvice.message} Lowest temp: ${Math.round(
          trip.bringAdvice.facts.minTemperatureCelsius,
        )} C. Rain chance peaks around ${trip.bringAdvice.facts.maxPrecipitationProbability}%.`
      : "I do not have weather details for this itinerary yet, but the route and timing are ready.";
  }

  if (/(time|late|arrive|arrival|finish|deadline|spare)/.test(normalized)) {
    return `You arrive at ${formatTime(trip.arrivalTime)} with ${stats.spare} min spare. Total travel time is ${stats.travel} min.`;
  }

  if (/(stop|stops|where|route|order|plan)/.test(normalized)) {
    const stopNames = trip.stops.map(
      (stop, index) => `${index + 1}. ${stop.name}`,
    );
    return `Current route: ${stopNames.join(" -> ")}.`;
  }

  if (/(walk|drive|transit|bus|train)/.test(normalized)) {
    return `This itinerary is planned for ${trip.request.transportation}. The route has ${trip.legs.length} travel legs and about ${stats.travel} min of travel.`;
  }

  return "Got it. I can answer about route order, arrival time, weather, what to bring, and transit details for this itinerary.";
}
