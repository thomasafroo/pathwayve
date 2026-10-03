"use client";
import { useEffect } from "react";
import {
  APIProvider,
  Map as GoogleMap,
  AdvancedMarker,
  Pin,
  useMap,
} from "@vis.gl/react-google-maps";
import type { TripState } from "@/types/trip";

function RouteOverlay({ trip }: { trip: TripState }) {
  const map = useMap();
  useEffect(() => {
    if (!map) return;
    const paths = trip.legs.map(
      (leg) =>
        new google.maps.Polyline({
          map,
          path: leg.path,
          strokeColor: "#146b55",
          strokeWeight: 4,
          strokeOpacity: 0.85,
        }),
    );
    const bounds = new google.maps.LatLngBounds();
    [
      trip.request.origin.location,
      ...trip.stops.map((stop) => stop.location),
      trip.request.destination.location,
    ].forEach((point) => bounds.extend(point));
    map.fitBounds(bounds, 60);
    return () => paths.forEach((path) => path.setMap(null));
  }, [map, trip]);
  return null;
}
export function Map({ trip }: { trip: TripState | null }) {
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (key && trip)
    return (
      <section className="map-panel" aria-label="Trip map">
        <APIProvider apiKey={key}>
          <GoogleMap
            defaultCenter={trip.request.destination.location}
            defaultZoom={12}
            mapId={process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID || "DEMO_MAP_ID"}
            gestureHandling="cooperative"
            style={{ width: "100%", height: 360 }}
          >
            <AdvancedMarker
              position={trip.request.origin.location}
              title={trip.request.origin.name}
            >
              <Pin glyph="S" />
            </AdvancedMarker>
            {trip.stops.map((stop, index) => (
              <AdvancedMarker
                key={stop.id}
                position={stop.location}
                title={stop.name}
              >
                <Pin
                  glyph={String(index + 1)}
                  background="#146b55"
                  glyphColor="#fff"
                  borderColor="#146b55"
                />
              </AdvancedMarker>
            ))}
            <AdvancedMarker
              position={trip.request.destination.location}
              title={trip.request.destination.name}
            >
              <Pin glyph="E" />
            </AdvancedMarker>
            <RouteOverlay trip={trip} />
          </GoogleMap>
          {trip.source === "demo" && (
            <p className="hint">
              Sample stop connections, not navigation directions.
            </p>
          )}
        </APIProvider>
      </section>
    );
  return (
    <section className="map-panel route-preview" aria-label="Route preview">
      <p className="eyebrow">
        {trip
          ? "Your route at a glance"
          : "A little possibility, along the way"}
      </p>
      <h2>
        {trip
          ? `${trip.stops.length} reasons to take the scenic way.`
          : "The journey can be the plan."}
      </h2>
      {trip ? (
        <ol className="route-line">
          <li>{trip.request.origin.name}</li>
          {trip.stops.map((stop) => (
            <li key={stop.id}>{stop.name}</li>
          ))}
          <li>{trip.request.destination.name}</li>
        </ol>
      ) : (
        <p>
          Choose what you love. We’ll put the stops in order, with time to enjoy
          them.
        </p>
      )}
      <p className="hint">
        Route overview · Interactive Google map appears when a browser Maps key
        is configured.
      </p>
    </section>
  );
}
