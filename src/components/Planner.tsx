"use client";
import Link from "next/link";
import { useState } from "react";
import {
  tripStateSchema,
  type ApiError,
  type TripEvent,
  type TripRequest,
  type TripState,
} from "@/types/trip";
import { TripForm } from "./TripForm";
import { Map } from "./Map";
import { Itinerary } from "./Itinerary";
import { ReplanControls } from "./ReplanControls";
export function Planner({ mode }: { mode: "demo" | "live" }) {
  const [trip, setTrip] = useState<TripState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function request(path: string, body: unknown) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(
          (result as ApiError).error?.message || "The request failed.",
        );
      setTrip(tripStateSchema.parse(result));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }
  const onPlan = (body: TripRequest) => request("/api/plan", body);
  const onReplan = (event: TripEvent) =>
    request("/api/replan", { tripState: trip, event });
  return (
    <>
      <header>
        <Link className="wordmark" href="/">
          pathwayve<span>↗</span>
        </Link>
        <span className="mode-label">
          {mode === "demo" ? "Demo mode · no API keys needed" : "Live planning"}
        </span>
      </header>
      <main>
        <div className="intro">
          <p className="eyebrow">A day out, with room for you</p>
          <h1>Make a day of it.</h1>
          <p>
            Good coffee. A new corner of the city. A plan that goes with you.
          </p>
        </div>
        {error && (
          <div role="alert" className="error">
            {error}
          </div>
        )}
        <div className="workspace" aria-busy={busy}>
          <aside>
            <TripForm busy={busy} onPlan={onPlan} />
          </aside>
          <div className="results">
            <Map trip={trip} />
            {trip && (
              <>
                <Itinerary
                  trip={trip}
                  busy={busy}
                  onLock={(id) =>
                    setTrip({
                      ...trip,
                      stops: trip.stops.map((stop) =>
                        stop.id === id
                          ? { ...stop, locked: !stop.locked }
                          : stop,
                      ),
                    })
                  }
                />
                <ReplanControls trip={trip} busy={busy} onReplan={onReplan} />
              </>
            )}
          </div>
        </div>
      </main>
      <footer>
        PathWayve · Built for StormHacks
        <span>Find something along the way.</span>
      </footer>
    </>
  );
}
