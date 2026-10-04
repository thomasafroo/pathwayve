"use client";
import { useEffect, useRef, useState } from "react";
import type { Location } from "@/types/trip";

export type LivePosition = Location & { accuracy: number; timestamp: number };

export function useLiveLocation() {
  const [position, setPosition] = useState<LivePosition | null>(null);
  const [tracking, setTracking] = useState(false);
  const [error, setError] = useState("");
  const watch = useRef<number | null>(null);
  const generation = useRef(0);

  useEffect(
    () => () => {
      generation.current++;
      if (watch.current !== null)
        navigator.geolocation.clearWatch(watch.current);
    },
    [],
  );

  function stop() {
    generation.current++;
    if (watch.current !== null) navigator.geolocation.clearWatch(watch.current);
    watch.current = null;
    setTracking(false);
    setPosition(null);
    setError("");
  }

  function start() {
    stop();
    if (!window.isSecureContext || !navigator.geolocation) {
      setError(
        "Location needs HTTPS (or localhost) and a browser with location support.",
      );
      return;
    }
    setTracking(true);
    const token = generation.current;
    watch.current = navigator.geolocation.watchPosition(
      ({ coords, timestamp }) => {
        if (generation.current !== token) return;
        setPosition({
          lat: coords.latitude,
          lng: coords.longitude,
          accuracy: coords.accuracy,
          timestamp,
        });
        setError("");
      },
      (failure) => {
        if (generation.current !== token) return;
        if (failure.code === 1) stop();
        setError(
          failure.code === 1
            ? "Location permission was denied. Allow location in your browser’s site settings to try again."
            : "Your location is temporarily unavailable. Waiting for a new position; you can stop tracking at any time.",
        );
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
    );
  }
  return { position, tracking, error, start, stop };
}
