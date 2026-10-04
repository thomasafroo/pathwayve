"use client";
import { NavigationPanel } from "./NavigationPanel";
import { PlaceHours } from "./PlaceHours";
import { useEffect, useRef, useState } from "react";
import {
  APIProvider,
  Map as GoogleMap,
  ControlPosition,
  AdvancedMarker,
  useMap,
  useApiLoadingStatus,
  APILoadingStatus,
} from "@vis.gl/react-google-maps";
import type { Location, TripState, RouteLeg } from "@/types/trip";
import { endpoints } from "@/lib/fixtures";
import { Icon } from "./Icon";
import { useLiveLocation, type LivePosition } from "@/lib/use-live-location";
import type { PlanningLocation } from "@/lib/planning-location";

function NavigationOverlay({ route }: { route: RouteLeg | null }) {
  const map = useMap();
  useEffect(() => {
    if (!map || !route) return;
    const line = new google.maps.Polyline({
      map,
      path: route.path,
      strokeColor: "#1769e0",
      strokeWeight: 7,
      zIndex: 10,
    });
    return () => line.setMap(null);
  }, [map, route]);
  return null;
}
function PositionOverlay({
  position,
  follow,
}: {
  position: LivePosition;
  follow: boolean;
}) {
  const map = useMap();
  useEffect(() => {
    if (!map) return;
    const circle = new google.maps.Circle({
      map,
      center: position,
      radius: position.accuracy,
      fillColor: "#4285f4",
      fillOpacity: 0.12,
      strokeColor: "#4285f4",
      strokeOpacity: 0.3,
      strokeWeight: 1,
      clickable: false,
    });
    return () => circle.setMap(null);
  }, [map, position]);
  useEffect(() => {
    if (map && follow) map.panTo(position);
  }, [map, position, follow]);
  return (
    <AdvancedMarker
      position={position}
      title="Your current location"
      zIndex={1000}
    >
      <span className="current-location-dot" />
    </AdvancedMarker>
  );
}

type MapProps = {
  onLocationChange?: (location: PlanningLocation) => void;
  trip: TripState | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onPick: (location: Location) => void;
  picking: boolean;
  onCancelPick: () => void;
  onUseLocation?: (location: Location) => void;
};
function RouteOverlay({
  trip,
  selectedId,
  fitCount,
}: {
  trip: TripState | null;
  selectedId: string | null;
  fitCount: number;
}) {
  const map = useMap();
  useEffect(() => {
    if (!map || !trip) return;
    const paths = trip.legs.map(
      (leg) =>
        new google.maps.Polyline({
          map,
          path: leg.path,
          strokeColor:
            trip.request.transportation === "driving"
              ? "#356fb3"
              : trip.request.transportation === "walking"
                ? "#b78136"
                : "#24725c",
          strokeWeight: 5,
          strokeOpacity: trip.source === "demo" ? 0 : 0.85,
          ...(trip.source === "demo"
            ? {
                icons: [
                  {
                    icon: { path: "M 0,-1 0,1", strokeOpacity: 0.85, scale: 3 },
                    offset: "0",
                    repeat: "15px",
                  },
                ],
              }
            : {}),
        }),
    );
    return () => paths.forEach((path) => path.setMap(null));
  }, [map, trip]);
  useEffect(() => {
    if (!map) return;
    const bounds = new google.maps.LatLngBounds();
    const points = trip
      ? [
          trip.request.origin.location,
          ...trip.stops.map((s) => s.location),
          trip.request.destination.location,
          ...trip.legs.flatMap((leg) => leg.path),
        ]
      : endpoints.map((e) => e.location);
    points.forEach((p) => bounds.extend(p));
    const fit = () =>
      map.fitBounds(bounds, { top: 100, right: 40, bottom: 110, left: 40 });
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(map.getDiv());
    return () => observer.disconnect();
  }, [map, trip, fitCount]);
  useEffect(() => {
    const stop = trip?.stops.find((s) => s.id === selectedId);
    if (map && stop) map.panTo(stop.location);
  }, [map, selectedId, trip]);
  return null;
}
function MapLoading() {
  const status = useApiLoadingStatus();
  if (
    status === APILoadingStatus.AUTH_FAILURE ||
    status === APILoadingStatus.FAILED
  )
    return (
      <div className="map-loading" role="alert">
        Google Maps couldn’t load. Check the browser key, billing, and website
        restrictions, then reload.
      </div>
    );
  return status !== APILoadingStatus.LOADED ? (
    <div className="map-loading">Opening your map…</div>
  ) : null;
}
function RouteSketch({
  trip,
  selectedId,
  onSelect,
}: Pick<MapProps, "trip" | "selectedId" | "onSelect">) {
  const points = trip
    ? [
        {
          id: "origin",
          name: trip.request.origin.name,
          location: trip.request.origin.location,
        },
        ...trip.stops,
        {
          id: "destination",
          name: trip.request.destination.name,
          location: trip.request.destination.location,
        },
      ]
    : [
        { id: "origin", ...endpoints[0] },
        { id: "destination", ...endpoints[1] },
      ];
  const lngs = points.map((p) => p.location.lng),
    lats = points.map((p) => p.location.lat);
  const minLng = Math.min(...lngs),
    maxLng = Math.max(...lngs),
    minLat = Math.min(...lats),
    maxLat = Math.max(...lats);
  const plotted = points.map((p) => ({
    ...p,
    x:
      95 + ((p.location.lng - minLng) / Math.max(maxLng - minLng, 0.015)) * 610,
    y:
      300 -
      ((p.location.lat - minLat) / Math.max(maxLat - minLat, 0.035)) * 160,
  }));
  return (
    <div className="sketch-wrap">
      <svg
        className="route-sketch"
        viewBox="0 0 800 440"
        role="img"
        aria-label="Approximate stop positions, not a street map"
      >
        {trip && (
          <polyline
            points={plotted.map((p) => `${p.x},${p.y}`).join(" ")}
            fill="none"
            stroke="#356fb3"
            strokeWidth="3"
            strokeDasharray="6 7"
            strokeLinejoin="round"
          />
        )}
        {trip &&
          plotted.map((point, index) => (
            <g key={point.id}>
              <circle
                cx={point.x}
                cy={point.y}
                r={selectedId === point.id ? 24 : 20}
                fill={
                  index === 0 || index === plotted.length - 1
                    ? "#fbfcf7"
                    : "#24725c"
                }
                stroke="#24725c"
                strokeWidth="2"
              />
              <text
                x={point.x}
                y={point.y + 5}
                textAnchor="middle"
                fill={
                  index === 0 || index === plotted.length - 1
                    ? "#24725c"
                    : "#fff"
                }
                fontSize="13"
                fontWeight="700"
              >
                {index === 0 ? "S" : index === plotted.length - 1 ? "E" : index}
              </text>
              {(index === 0 || index === plotted.length - 1) && (
                <text
                  x={point.x}
                  y={point.y + 38}
                  textAnchor="middle"
                  className="sketch-label"
                >
                  {point.name}
                </text>
              )}
            </g>
          ))}
      </svg>
      {trip && (
        <div
          className="sketch-stop-picker"
          aria-label="Select a stop on the route preview"
        >
          {trip.stops.map((stop, index) => (
            <button
              key={stop.id}
              aria-pressed={selectedId === stop.id}
              onClick={() => onSelect(stop.id)}
            >
              <span>{index + 1}</span>
              {stop.name}
            </button>
          ))}
        </div>
      )}
      <div className="map-setup-note">
        <Icon name="layers" size={16} />
        <span>Route preview · Approximate positions</span>
      </div>
    </div>
  );
}
export function Map(props: MapProps) {
  const { trip, selectedId, onSelect, picking, onPick, onCancelPick } = props;
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const panel = useRef<HTMLElement>(null);
  const fullscreenButton = useRef<HTMLButtonElement>(null);
  const [fullscreen, setFullscreen] = useState(false);
  useEffect(() => {
    const sync = () => {
      setFullscreen(document.fullscreenElement === panel.current);
      if (!document.fullscreenElement) fullscreenButton.current?.focus();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && fullscreen && !document.fullscreenElement) {
        setFullscreen(false);
        fullscreenButton.current?.focus();
      }
    };
    document.addEventListener("fullscreenchange", sync);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("fullscreenchange", sync);
      document.removeEventListener("keydown", escape);
    };
  }, [fullscreen]);
  async function toggleFullscreen() {
    if (document.fullscreenElement === panel.current) {
      await document.exitFullscreen();
    } else if (fullscreen) {
      setFullscreen(false);
      fullscreenButton.current?.focus();
    } else {
      try {
        if (!panel.current?.requestFullscreen)
          throw new Error("Fullscreen unavailable");
        await panel.current.requestFullscreen();
      } catch {
        // Embedded browsers may block native fullscreen; expand within the window.
        setFullscreen(true);
      }
    }
  }
  const [fitCount, setFitCount] = useState(0);
  const location = useLiveLocation();
  const onLocationChange = props.onLocationChange;
  useEffect(() => {
    onLocationChange?.({
      tracking: location.tracking,
      position: location.position,
    });
  }, [onLocationChange, location.tracking, location.position]);
  const [navigating, setNavigating] = useState(false);
  const [navigationRoute, setNavigationRoute] = useState<RouteLeg | null>(null);
  const [follow, setFollow] = useState(true);
  const selected = trip?.stops.find((s) => s.id === selectedId);
  return (
    <section
      ref={panel}
      className={`map-panel ${picking ? "is-picking" : ""} ${fullscreen ? "map-fullscreen" : ""}`}
      aria-label="Trip map"
      id="trip-map"
    >
      <div className="map-topline">
        <span className="map-place">
          <Icon name="pin" size={16} />
          {trip ? trip.request.destination.name : "Vancouver, BC"}
        </span>
        <span className="map-type">
          {key ? "Google Maps" : "Route preview"}
        </span>
      </div>
      {key ? (
        <APIProvider apiKey={key} region="CA">
          <GoogleMap
            defaultCenter={endpoints[1].location}
            defaultZoom={12}
            mapId={process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID || "DEMO_MAP_ID"}
            gestureHandling="greedy"
            onDragstart={() => setFollow(false)}
            disableDefaultUI
            clickableIcons={false}
            zoomControl
            zoomControlOptions={{ position: ControlPosition.RIGHT_BOTTOM }}
            streetViewControl={false}
            style={{ width: "100%", height: "100%" }}
            onClick={(event) => {
              if (picking && event.detail.latLng) onPick(event.detail.latLng);
            }}
          >
            {trip && (
              <AdvancedMarker
                position={trip.request.origin.location}
                title={trip.request.origin.name}
              >
                <span className="map-marker endpoint-marker">S</span>
              </AdvancedMarker>
            )}
            {trip?.stops.map((stop, index) => (
              <AdvancedMarker
                key={stop.id}
                position={stop.location}
                title={stop.name}
                onClick={() => onSelect(stop.id)}
                zIndex={selectedId === stop.id ? 100 : index + 1}
              >
                <span
                  className={`map-marker ${selectedId === stop.id ? "selected" : ""}`}
                >
                  {index + 1}
                </span>
              </AdvancedMarker>
            ))}
            {trip && (
              <AdvancedMarker
                position={trip.request.destination.location}
                title={trip.request.destination.name}
              >
                <span className="map-marker endpoint-marker">E</span>
              </AdvancedMarker>
            )}
            <RouteOverlay
              trip={trip}
              selectedId={selectedId}
              fitCount={fitCount}
            />
            <NavigationOverlay route={navigating ? navigationRoute : null} />
            {location.position && (
              <PositionOverlay position={location.position} follow={follow} />
            )}
          </GoogleMap>
          <MapLoading />
        </APIProvider>
      ) : (
        <RouteSketch trip={trip} selectedId={selectedId} onSelect={onSelect} />
      )}
      <button
        ref={fullscreenButton}
        className="fit-map"
        type="button"
        aria-label={fullscreen ? "Exit fullscreen" : "Enter fullscreen"}
        title={fullscreen ? "Exit fullscreen" : "Enter fullscreen"}
        aria-pressed={fullscreen}
        onClick={() => void toggleFullscreen()}
      >
        <Icon name={fullscreen ? "close" : "fit"} size={18} />
      </button>
      {key && (
        <button
          className="fit-map route-fit-control"
          aria-label="Fit route"
          title="Fit route"
          onClick={() => {
            setFollow(false);
            setFitCount((n) => n + 1);
          }}
        >
          <Icon name="locate" size={18} />
        </button>
      )}
      <div className="location-controls">
        {!location.tracking ? (
          <button
            className="location-button"
            onClick={() => {
              setFollow(true);
              location.start();
            }}
          >
            <Icon name="locate" size={19} />
            Follow my location
          </button>
        ) : (
          <>
            <button
              className="location-button"
              aria-pressed={follow}
              onClick={() => setFollow(!follow)}
            >
              <Icon name="locate" size={19} />
              {follow ? "Following you" : "Recenter on me"}
            </button>
            <button
              className="location-stop"
              onClick={() => {
                location.stop();
                setNavigating(false);
                setNavigationRoute(null);
              }}
            >
              Stop tracking
            </button>
          </>
        )}
        {location.position && props.onUseLocation && (
          <button
            className="location-button"
            onClick={() => props.onUseLocation?.(location.position!)}
          >
            Use my location as start
          </button>
        )}
        {trip?.source === "live" && !navigating && (
          <button
            className="location-button"
            onClick={() => {
              setNavigating(true);
              setFollow(true);
              if (!location.tracking) location.start();
            }}
          >
            Start navigation
          </button>
        )}
        {trip?.source === "demo" && (
          <p className="location-readout">Navigation requires a live route.</p>
        )}
        {location.tracking && (
          <p className="location-readout" aria-live="polite">
            {location.position
              ? `Location accuracy: ±${Math.round(location.position.accuracy)} m${key ? "" : " · Map key needed to show your position"}`
              : "Waiting for your location…"}
          </p>
        )}
        {location.error && (
          <p role="alert" className="location-error">
            {location.error}
          </p>
        )}
      </div>
      {navigating && trip?.source === "live" && (
        <NavigationPanel
          key={`${trip.id}-${trip.lastUpdated}`}
          trip={trip}
          position={location.position}
          onRoute={setNavigationRoute}
          onStop={() => {
            setNavigating(false);
            setNavigationRoute(null);
            location.stop();
          }}
        />
      )}
      {picking && (
        <div className="map-pick-banner">
          Click the map to place your new stop.
          <button onClick={onCancelPick} aria-label="Cancel map selection">
            <Icon name="close" size={16} />
          </button>
        </div>
      )}
      {selected && !picking && (
        <div className="map-stop-detail">
          <span className={`category-icon ${selected.category}`}>
            <Icon name={selected.category} />
          </span>
          <div>
            <strong>{selected.name}</strong>
            <PlaceHours place={selected} />
            <span>
              {selected.durationMinutes} min · {selected.category}
            </span>
          </div>
          <button
            aria-label="Close map stop detail"
            className="icon-button"
            onClick={() => onSelect("")}
          >
            <Icon name="close" size={16} />
          </button>
        </div>
      )}
      {key && trip?.source === "demo" && (
        <span className="map-disclaimer">
          Sample connections · not navigation directions
        </span>
      )}
    </section>
  );
}
