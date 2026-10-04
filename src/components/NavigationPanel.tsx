"use client";
import { useEffect, useRef, useState } from "react";
import { routeLegSchema, type TripState, type RouteLeg } from "@/types/trip";
import type { LivePosition } from "@/lib/use-live-location";
import { navigationUrl, positionDistance } from "@/lib/navigation";
export function NavigationPanel({
  trip,
  position,
  onRoute,
  onStop,
}: {
  trip: TripState;
  position: LivePosition | null;
  onRoute: (route: RouteLeg | null) => void;
  onStop: () => void;
}) {
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 5000);
    return () => window.clearInterval(timer);
  }, []);
  const [index, setIndex] = useState(0);
  const [route, setRoute] = useState<RouteLeg | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const last = useRef<{ position: LivePosition; at: number } | null>(null);
  const target = trip.stops[index]
    ? { ...trip.stops[index], placeId: trip.stops[index].id }
    : trip.request.destination;
  const destinationJson = JSON.stringify({
    name: target.name,
    location: target.location,
    placeId: target.placeId,
  });
  const mode = trip.request.transportation;
  const latest = useRef(position);
  useEffect(() => {
    latest.current = position;
  }, [position]);
  // Refresh from the newest fix periodically, without routing on every GPS tick.
  useEffect(() => {
    const timer = window.setInterval(() => {
      const point = latest.current;
      if (
        point &&
        Date.now() - point.timestamp < 30000 &&
        point.accuracy <= 100 &&
        (!last.current ||
          positionDistance(point, last.current.position) >= 50 ||
          Date.now() - last.current.at > 120000)
      )
        setRefresh((value) => value + 1);
    }, 30000);
    return () => window.clearInterval(timer);
  }, []);
  const hasFix =
    !!position &&
    position.accuracy <= 100 &&
    clock - position.timestamp < 30000;
  useEffect(() => {
    const point = latest.current;
    if (!hasFix || !point || Date.now() - point.timestamp > 30000) {
      onRoute(null);
      return;
    }
    const controller = new AbortController();
    let active = true;
    async function load() {
      setBusy(true);
      setError("");
      setRoute(null);
      onRoute(null);
      try {
        const response = await fetch("/api/navigation", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            origin: { lat: point!.lat, lng: point!.lng },
            destination: JSON.parse(destinationJson),
            transportation: mode,
          }),
        });
        const data = await response.json();
        if (!response.ok)
          throw new Error(
            data.error?.message ?? "Navigation route unavailable.",
          );
        const next = routeLegSchema.parse(data);
        if (active) {
          setRoute(next);
          onRoute(next);
          last.current = { position: point!, at: Date.now() };
        }
      } catch (failure) {
        if (active)
          setError(
            failure instanceof Error
              ? failure.message
              : "Navigation unavailable.",
          );
      } finally {
        if (active) setBusy(false);
      }
    }
    void load();
    return () => {
      active = false;
      controller.abort();
    };
  }, [hasFix, destinationJson, refresh, onRoute, mode]);
  return (
    <section className="navigation-panel" aria-label="Live navigation">
      <header>
        <strong>To {target.name}</strong>
        <button type="button" onClick={onStop}>
          Stop navigation
        </button>
      </header>
      {!hasFix && (
        <p>Waiting for a fresh, accurate location fix (within 100 m)…</p>
      )}
      {busy && <p role="status">Updating directions from your location…</p>}
      {error && <p role="alert">{error}</p>}
      {position && (
        <p>
          GPS accuracy ±{Math.round(position.accuracy)} m ·{" "}
          {Math.round(positionDistance(position, target.location))} m
          straight-line distance to stop
        </p>
      )}
      {route && hasFix && (
        <>
          <p>
            {route.durationMinutes} min ·{" "}
            {(route.distanceMeters / 1000).toFixed(1)} km by{" "}
            {trip.request.transportation}
          </p>
          <details>
            <summary>Route directions</summary>
            <ol>
              {route.steps?.map((step, i) => (
                <li key={i}>
                  {step.line && `${step.line}: `}
                  {step.instruction}
                </li>
              ))}
            </ol>
            {!route.steps?.length && (
              <p>Detailed instructions unavailable. Open Google Maps below.</p>
            )}
          </details>
        </>
      )}
      <div className="navigation-actions">
        <button
          onClick={() => setRefresh((value) => value + 1)}
          disabled={!hasFix || busy}
        >
          Refresh directions
        </button>
        <button disabled={index === 0} onClick={() => setIndex(index - 1)}>
          Previous stop
        </button>
        {index < trip.stops.length && (
          <button onClick={() => setIndex(index + 1)}>
            Continue to next stop
          </button>
        )}
        <a
          href={navigationUrl(target, trip.request.transportation)}
          target="_blank"
          rel="noopener noreferrer"
        >
          Navigate in Google Maps ↗
        </a>
      </div>
      <p>
        Route following preview. Open Google Maps for turn-by-turn guidance.
        Continue after finishing each stop.
      </p>
    </section>
  );
}
