"use client";

import { mergePreferenceNotes } from "@/lib/preference-notes";
import { z } from "zod";
import {
  useEffect,
  useLayoutEffect,
  useImperativeHandle,
  useRef,
  useState,
  type Ref,
  type FormEvent,
} from "react";
import {
  categories,
  tripRequestSchema,
  type TripRequest,
  type CandidatePlace,
  type TripState,
} from "@/types/trip";
import { endpoints, demoPlaces } from "@/lib/fixtures";
import { PlaceHours } from "./PlaceHours";
import { Icon } from "./Icon";
import { PlaceSearch } from "./PlaceSearch";
import {
  planningConstraintsSchema,
  type PlanningConstraints,
} from "@/types/planning-constraints";
export type TripFormHandle = {
  getConstraints: () => PlanningConstraints;
  importTrip: (trip: TripState) => void;
  useLocation: (location: TripRequest["origin"]["location"]) => void;
};
const storedPreferences = z.object({
  activities: z.array(z.enum(categories)).max(6),
  interests: z.array(z.string().max(80)).max(20),
  budget: z.enum(["any", "budget", "moderate", "premium"]),
  notes: z.string().max(1000),
  routingPriority: z.enum(["fastest", "less_walking", "fewer_transfers"]),
  radius: z.enum(["500", "1000", "3000"]),
  transportation: z.enum(["walking", "driving", "transit"]),
  orderPolicy: z.enum(["preserve", "optimize"]),
  suggestionMode: z.enum(["manual", "suggest"]),
});
const localDate = (iso: string) => {
  const date = new Date(iso);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
};
const tags = [
  "Libraries",
  "Museums",
  "Art galleries",
  "Bakeries",
  "Beaches",
  "Live music",
  "Parks",
  "Vegetarian food",
  "Quiet study spots",
  "Local favourites",
  "Family activities",
  "Nightlife",
];
export function TripForm({
  busy,
  onPlan,
  mode = "demo",
  currentTrip,
  pendingPlace,
  ref,
}: {
  ref?: Ref<TripFormHandle>;
  pendingPlace?: CandidatePlace | null;
  currentTrip: TripState | null;
  mode?: "demo" | "live";
  busy: boolean;
  onPlan: (request: TripRequest) => Promise<void>;
}) {
  const [revision, setRevision] = useState(0);
  const [preferencesDirty, setPreferencesDirty] = useState(false);
  const attemptedRevision = useRef(0);
  const draggedId = useRef<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dragOrder, setDragOrder] = useState<string[] | null>(null);
  const dragOrderRef = useRef<string[] | null>(null);
  const stopList = useRef<HTMLDivElement>(null);
  const priorPositions = useRef(new Map<string, number>());
  const lastHover = useRef<string | null>(null);
  const changed = () => setRevision((value) => value + 1);
  const formRef = useRef<HTMLFormElement>(null);
  const [origin, setOrigin] = useState<TripRequest["origin"] | null>(
      currentTrip?.request.origin ?? null,
    ),
    [destination, setDestination] = useState<TripRequest["destination"] | null>(
      currentTrip?.request.destination ?? null,
    );
  const [editing, setEditing] = useState<"origin" | "destination" | null>(
    currentTrip ? null : "origin",
  );
  const [activities, setActivities] = useState<TripRequest["activities"]>(
    currentTrip?.request.activities ?? ["coffee", "park", "bookstore", "food"],
  );
  const [transportation, setTransportation] = useState<
    TripRequest["transportation"]
  >(currentTrip?.request.transportation ?? "transit");
  const [selected, setSelected] = useState<
    NonNullable<TripRequest["selectedStops"]>
  >(
    currentTrip?.stops.map((stop) => ({
      ...stop,
      priority: stop.priority ?? "optional",
    })) ?? [],
  );
  const [orderPolicy, setOrderPolicy] = useState<"preserve" | "optimize">(
    currentTrip?.request.orderPolicy ?? "preserve",
  );
  const [favorites, setFavorites] = useState<CandidatePlace[]>([]);
  const [interests, setInterests] = useState<string[]>(
    currentTrip?.request.interestTags ?? [],
  );
  const [notes, setNotes] = useState(
    mergePreferenceNotes(currentTrip?.request.preferences),
  );
  const [routingPriority, setRoutingPriority] = useState<string>(
    currentTrip?.request.routingPriority ?? "fastest",
  );
  const [radius, setRadius] = useState("1000");
  const [startValue, setStartValue] = useState(() =>
    currentTrip ? localDate(currentTrip.request.startTime) : "",
  );
  const [endValue, setEndValue] = useState(() =>
    currentTrip ? localDate(currentTrip.request.endTime) : "",
  );
  const [preferencesReady, setPreferencesReady] = useState(false);
  const [budget, setBudget] = useState<string>(
    currentTrip?.request.budget ?? "any",
  );
  const [error, setError] = useState("");
  const [findStops, setFindStops] = useState(false);
  const [suggestionMode, setSuggestionMode] = useState<"manual" | "suggest">(
    currentTrip?.request.suggestionMode ?? "manual",
  );
  const openedTrip = useRef(!!currentTrip);
  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      // An opened schedule supplies its own settings; saved defaults apply to new trips.
      if (openedTrip.current) {
        setPreferencesReady(true);
        return;
      }
      try {
        const parsed = storedPreferences.safeParse(
          JSON.parse(
            localStorage.getItem("pathwayve-preferences-v1") ?? "null",
          ),
        );
        if (parsed.success) {
          const p = parsed.data;
          setActivities(p.activities);
          setInterests(p.interests);
          setBudget(p.budget);
          setNotes(mergePreferenceNotes(p.notes));
          setRoutingPriority(p.routingPriority);
          setRadius(p.radius);
          setTransportation(p.transportation);
          setOrderPolicy(p.orderPolicy);
          setSuggestionMode(p.suggestionMode);
        }
      } catch {
        /* Storage may be unavailable; keep the form usable. */
      }
      setPreferencesReady(true);
    });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!preferencesReady) return;
    try {
      localStorage.setItem(
        "pathwayve-preferences-v1",
        JSON.stringify({
          activities,
          interests,
          budget,
          notes,
          routingPriority,
          radius,
          transportation,
          orderPolicy,
          suggestionMode,
        }),
      );
    } catch {
      /* Best effort in restricted browsers. */
    }
  }, [
    preferencesReady,
    activities,
    interests,
    budget,
    notes,
    routingPriority,
    radius,
    transportation,
    orderPolicy,
    suggestionMode,
  ]);
  const [syncedTrip, setSyncedTrip] = useState(currentTrip);
  const [consumedPlace, setConsumedPlace] = useState(pendingPlace);
  if (pendingPlace && pendingPlace !== consumedPlace) {
    setConsumedPlace(pendingPlace);
    changed();
    if (selected.length >= 6) setError("Choose up to six stops.");
    else if (!selected.some((p) => p.id === pendingPlace.id))
      setSelected([
        ...selected,
        {
          ...pendingPlace,
          durationMinutes: 30,
          locked: false,
          priority: "required",
        },
      ]);
  }
  if (currentTrip !== syncedTrip) {
    setSyncedTrip(currentTrip);
    setDragOrder(null);
    setRevision(0);
    if (currentTrip) {
      setOrigin(currentTrip.request.origin);
      setDestination(currentTrip.request.destination);
      setTransportation(currentTrip.request.transportation);
      setActivities(currentTrip.request.activities);
      setInterests(currentTrip.request.interestTags ?? []);
      setBudget(currentTrip.request.budget ?? "any");
      setNotes(mergePreferenceNotes(currentTrip.request.preferences));
      setRoutingPriority(currentTrip.request.routingPriority ?? "fastest");
      setOrderPolicy(currentTrip.request.orderPolicy ?? "preserve");
      setEditing(null);
      setSelected(
        currentTrip.stops.map((stop) => ({
          ...stop,
          priority: stop.priority ?? "optional",
        })),
      );
    }
  }
  useImperativeHandle(ref, () => ({
    importTrip(trip) {
      const request = trip.request;
      setOrigin(request.origin);
      setDestination(request.destination);
      setSelected(
        trip.stops.map((stop) => ({
          ...stop,
          priority: stop.priority ?? "optional",
        })),
      );
      setTransportation(request.transportation);
      setActivities(request.activities);
      setInterests(request.interestTags ?? []);
      setBudget(request.budget ?? "any");
      setNotes(mergePreferenceNotes(request.preferences));
      setOrderPolicy(request.orderPolicy ?? "preserve");
      setRoutingPriority(request.routingPriority ?? "fastest");
      setSuggestionMode(request.suggestionMode ?? "manual");
      setStartValue(localDate(request.startTime));
      setEndValue(localDate(request.endTime));
      setEditing(null);
      setRevision(0);
    },
    useLocation(location) {
      setOrigin({ name: "Your current location", location });
      setEditing(destination ? null : "destination");
      changed();
    },
    getConstraints() {
      const form = new FormData(formRef.current!);
      return planningConstraintsSchema.parse({
        origin,
        destination,
        transportation,
        selectedStops: selected,
        startTime: form.get("start")
          ? new Date(String(form.get("start"))).toISOString()
          : undefined,
        endTime: form.get("end")
          ? new Date(String(form.get("end"))).toISOString()
          : undefined,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        orderPolicy,
        routingPriority:
          orderPolicy === "optimize"
            ? "fastest"
            : form.get("priority") || "fastest",
        budget,
        activities,
        interestTags: interests,
        suggestionMode,
        preferences: String(form.get("preferences") || ""),
        routeRadiusMeters: Number(form.get("routeRadius") || 1000),
      });
    },
  }));
  const displayedStops = dragOrder
    ? dragOrder.flatMap((id) => selected.filter((stop) => stop.id === id))
    : selected;
  useLayoutEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    stopList.current
      ?.querySelectorAll<HTMLElement>("[data-stop-id]")
      .forEach((card) => {
        const previous = priorPositions.current.get(card.dataset.stopId!);
        if (previous !== undefined) {
          const delta = previous - card.getBoundingClientRect().top;
          if (delta)
            card.animate(
              [
                { transform: `translateY(${delta}px)` },
                { transform: "translateY(0)" },
              ],
              { duration: 180, easing: "ease-out" },
            );
        }
      });
    priorPositions.current.clear();
  }, [dragOrder]);
  function previewMove(targetId: string) {
    const id = draggedId.current;
    if (!id || busy || lastHover.current === targetId || id === targetId)
      return;
    const fromOriginal = selected.findIndex((stop) => stop.id === id);
    const toOriginal = selected.findIndex((stop) => stop.id === targetId);
    if (
      fromOriginal < 0 ||
      toOriginal < 0 ||
      selected
        .slice(
          Math.min(fromOriginal, toOriginal),
          Math.max(fromOriginal, toOriginal) + 1,
        )
        .some((stop) => stop.locked)
    )
      return;
    lastHover.current = targetId;
    const order = [
      ...(dragOrderRef.current ?? selected.map((stop) => stop.id)),
    ];
    const from = order.indexOf(id),
      to = order.indexOf(targetId);
    stopList.current
      ?.querySelectorAll<HTMLElement>("[data-stop-id]")
      .forEach((card) =>
        priorPositions.current.set(
          card.dataset.stopId!,
          card.getBoundingClientRect().top,
        ),
      );
    order.splice(to, 0, order.splice(from, 1)[0]);
    dragOrderRef.current = order;
    setDragOrder(order);
  }
  function finishDrag(commit: boolean) {
    const order = dragOrderRef.current;
    if (
      commit &&
      order &&
      order.some((id, index) => id !== selected[index]?.id)
    ) {
      setSelected(order.map((id) => selected.find((stop) => stop.id === id)!));
      setOrderPolicy("preserve");
      changed();
    }
    draggedId.current = null;
    setDragging(null);
    dragOrderRef.current = null;
    lastHover.current = null;
    setDragOrder(null);
  }
  function moveStop(from: number, to: number) {
    if (busy || from === to || from < 0 || to < 0 || to >= selected.length)
      return;
    if (
      selected
        .slice(Math.min(from, to), Math.max(from, to) + 1)
        .some((stop) => stop.locked)
    )
      return;
    const reordered = [...selected];
    reordered.splice(to, 0, reordered.splice(from, 1)[0]);
    setSelected(reordered);
    setOrderPolicy("preserve");
    changed();
  }
  function choose(place: CandidatePlace) {
    if (selected.some((s) => s.id === place.id)) return;
    if (selected.length >= 6) {
      setError("Choose up to six stops.");
      return;
    }
    changed();
    setSelected([
      ...selected,
      { ...place, durationMinutes: 30, locked: false, priority: "required" },
    ]);
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    attemptedRevision.current = revision;
    await plan();
  }
  async function plan() {
    setError("");
    if (!origin || !destination) {
      setError(
        "Choose your starting point and destination from search results.",
      );
      return;
    }
    const form = new FormData(formRef.current!);
    try {
      const request = tripRequestSchema.parse({
        origin,
        destination,
        startTime: form.get("start")
          ? new Date(String(form.get("start"))).toISOString()
          : currentTrip?.request.startTime,
        endTime: form.get("end")
          ? new Date(String(form.get("end"))).toISOString()
          : currentTrip?.request.endTime,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        transportation,
        activities,
        preferences: String(form.get("preferences") || ""),
        interestTags: interests,
        favoritePlaceIds: favorites.map((place) => place.id),
        budget,
        orderPolicy,
        routingPriority:
          orderPolicy === "optimize"
            ? "fastest"
            : form.get("priority") || "fastest",
        selectedStops: selected,
        suggestionMode,
      });
      await onPlan(request);
    } catch (e) {
      setError(
        e instanceof Error
          ? e instanceof Object && "issues" in e
            ? "End time must be after departure and within 31 days. Check your dates and selections."
            : e.message
          : "Check your trip details.",
      );
    }
  }
  useEffect(() => {
    if (revision === 0) {
      attemptedRevision.current = 0;
      return;
    }
    if (
      busy ||
      dragOrder ||
      !origin ||
      !destination ||
      revision === attemptedRevision.current
    )
      return;
    const timer = window.setTimeout(() => {
      attemptedRevision.current = revision;
      void plan();
    }, 600);
    return () => window.clearTimeout(timer);
  });
  return (
    <form
      ref={formRef}
      id="trip-planner-form"
      onSubmit={submit}
      onChange={(event) => {
        const element = event.target;
        if (
          element instanceof HTMLElement &&
          element.closest(".trip-preferences")
        ) {
          setPreferencesDirty(true);
          return;
        }
        if (!(
          element instanceof HTMLInputElement ||
          element instanceof HTMLSelectElement ||
          element instanceof HTMLTextAreaElement
        ))
          return;
        if (
          element.name ||
          element.type === "number" ||
          element.type === "checkbox" ||
          element.tagName === "SELECT"
        )
          changed();
      }}
      className="trip-form"
    >
      <fieldset disabled={busy || !preferencesReady}>
        <div className="form-heading">
          <h1>Plan trip</h1>
          <p>Choose your route and stops.</p>
        </div>
        <div className="endpoint-fields">
          {(["origin", "destination"] as const).map((kind) => {
            const point = kind === "origin" ? origin : destination;
            return (
              <div key={kind} className="endpoint-choice">
                <span className="field-heading">
                  {kind === "origin" ? "Starting point" : "Destination"}
                </span>

                {editing === kind ? (
                  <PlaceSearch
                    label={
                      kind === "origin"
                        ? "Search starting point"
                        : "Search destination"
                    }
                    disabled={busy}
                    onSelect={(place) => {
                      changed();
                      const endpoint = {
                        name: place.name,
                        location: place.location,
                        placeId: place.id,
                      };

                      if (kind === "origin") {
                        setOrigin(endpoint);
                        setEditing(destination ? null : "destination");
                      } else {
                        setDestination(endpoint);
                        setEditing(null);
                      }
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    className="chosen-endpoint"
                    onClick={() => setEditing(kind)}
                  >
                    <Icon name="pin" size={14} />

                    {point?.name ?? "Choose any location"}

                    <span>Change</span>
                  </button>
                )}
              </div>
            );
          })}
        </div>
        <button
          type="button"
          className="text-button"
          onClick={() => {
            changed();
            setOrigin(endpoints[0]);
            setDestination(endpoints[1]);
            setSelected(
              (mode === "demo" ? demoPlaces.slice(0, 4) : []).map((p) => ({
                ...p,
                durationMinutes: 30,
                locked: false,
                priority: "required" as const,
              })),
            );
            setEditing(null);
          }}
        >
          Load sample trip
        </button>
        <p className="field-heading">Travel mode</p>
        <div
          className="transport-options"
          role="group"
          aria-label="Getting around"
        >
          {(["transit", "walking", "driving"] as const).map((mode) => (
            <button
              type="button"
              key={mode}
              aria-pressed={transportation === mode}
              onClick={() => {
                setTransportation(mode);
                changed();
              }}
            >
              <Icon name={mode} size={19} />
              {mode === "transit"
                ? "Transit"
                : mode === "walking"
                  ? "Walk"
                  : "Drive"}
            </button>
          ))}
        </div>
        <div className="schedule-options">
          <label>
            Route priority
            <select
              name="priority"
              value={
                orderPolicy === "optimize" || transportation !== "transit"
                  ? "fastest"
                  : routingPriority
              }
              onChange={(event) => setRoutingPriority(event.target.value)}
              disabled={orderPolicy === "optimize"}
            >
              <option value="fastest">Fastest available route</option>
              {transportation === "transit" && (
                <>
                  <option value="less_walking">Less walking</option>
                  <option value="fewer_transfers">Fewer transfers</option>
                </>
              )}
            </select>
          </label>
          <div className="time-fields">
            <label>
              Departure
              <input
                aria-describedby="time-help"
                value={startValue}
                onChange={(event) => setStartValue(event.target.value)}
                name="start"
                type="datetime-local"
              />
            </label>
            <label>
              Finish by
              <input
                aria-describedby="time-help"
                value={endValue}
                onChange={(event) => setEndValue(event.target.value)}
                name="end"
                type="datetime-local"
              />
            </label>
          </div>
          <p id="time-help" className="hint">
            Leave blank for today. Times are local.
          </p>
        </div>
        <div className="form-divider" />
        <div className="selected-stops-heading">
          <p className="field-heading">Selected stops</p>
          <span>{selected.length}/6</span>
        </div>
        <p className="hint">
          Required stops stay in your plan. Uncheck Required to let Gemini
          remove a stop when you ask. Locked stops are always protected.
        </p>
        <label>
          Search distance from route
          <select
            name="routeRadius"
            value={radius}
            onChange={(event) => setRadius(event.target.value)}
          >
            <option value="500">Within 500 m</option>
            <option value="1000">Within 1 km</option>
            <option value="3000">Within 3 km</option>
          </select>
        </label>
        <label>
          Stop order
          <select
            aria-label="Stop order"
            value={orderPolicy}
            onChange={(e) =>
              setOrderPolicy(e.target.value as "preserve" | "optimize")
            }
          >
            <option value="preserve">Keep my order</option>
            <option value="optimize">Optimize for fastest trip</option>
          </select>
        </label>
        <p className="hint">
          {orderPolicy === "preserve"
            ? "Your selected sequence is enforced in routes and chat. Extra stops can fit between your choices."
            : "Compare actual travel times for your mode. Keeps locked positions; up to 12 orders compared, not a guaranteed global optimum."}
        </p>
        <div className="chosen-stops" ref={stopList}>
          {displayedStops.map((place, index) => (
            <div
              key={place.id}
              data-stop-id={place.id}
              className={
                dragOrder && place.id === dragging ? "stop-dragging" : undefined
              }
              onDragOver={(event) => {
                if (!busy && !place.locked && draggedId.current) {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  previewMove(place.id);
                }
              }}
              onDrop={(event) => {
                event.preventDefault();
                finishDrag(true);
              }}
            >
              <button
                type="button"
                className="stop-drag-handle"
                aria-label={`Drag ${place.name} to reorder`}
                draggable={!busy && !place.locked}
                disabled={busy || place.locked}
                title="Drag to reorder, or use the arrows"
                onDragStart={(event) => {
                  draggedId.current = place.id;
                  setDragging(place.id);
                  dragOrderRef.current = selected.map((stop) => stop.id);
                  const card =
                    event.currentTarget.closest<HTMLElement>("[data-stop-id]")!;
                  const bounds = card.getBoundingClientRect();
                  event.dataTransfer.setDragImage(
                    card,
                    event.clientX - bounds.left,
                    event.clientY - bounds.top,
                  );
                  setDragOrder(selected.map((stop) => stop.id));
                  event.dataTransfer.setData("text/plain", place.id);
                  event.dataTransfer.effectAllowed = "move";
                }}
                onDragEnd={() => finishDrag(false)}
              >
                ⠿
              </button>
              <span className="stop-order-controls">
                {([-1, 1] as const).map((direction) => (
                  <button
                    key={direction}
                    type="button"
                    className="icon-button"
                    aria-label={`Move ${place.name} ${direction === -1 ? "up" : "down"}`}
                    disabled={
                      index + direction < 0 ||
                      index + direction >= selected.length ||
                      place.locked ||
                      selected[index + direction]?.locked
                    }
                    onClick={() => moveStop(index, index + direction)}
                  >
                    {direction === -1 ? "↑" : "↓"}
                  </button>
                ))}
              </span>
              <div>
                <strong>
                  {index + 1}. {place.name}
                </strong>
                <label className="required-stop-toggle">
                  <input
                    type="checkbox"
                    aria-label={`Required stop: ${place.name}`}
                    checked={place.locked || place.priority === "required"}
                    disabled={place.locked || busy}
                    onChange={(event) =>
                      setSelected(
                        selected.map((stop) =>
                          stop.id === place.id
                            ? {
                                ...stop,
                                priority: event.target.checked
                                  ? "required"
                                  : "optional",
                              }
                            : stop,
                        ),
                      )
                    }
                  />
                  {place.locked ? "Required · locked" : "Required"}
                </label>
                {place.openingHours && <PlaceHours place={place} />}
              </div>
              <label>
                Stay (min)
                <input
                  aria-label={`Planned duration for ${place.name}`}
                  type="number"
                  min={5}
                  max={180}
                  value={place.durationMinutes}
                  onChange={(e) =>
                    setSelected(
                      selected.map((s) =>
                        s.id === place.id
                          ? { ...s, durationMinutes: Number(e.target.value) }
                          : s,
                      ),
                    )
                  }
                />
              </label>
              <button
                type="button"
                className="icon-button"
                aria-label={`Remove selected ${place.name}`}
                onClick={() => {
                  setSelected(selected.filter((s) => s.id !== place.id));
                  changed();
                }}
              >
                <Icon name="close" size={14} />
              </button>
            </div>
          ))}
        </div>
        {!selected.length && <p className="hint">No stops selected.</p>}
        <button
          type="button"
          className="secondary"
          onClick={() => setFindStops(!findStops)}
        >
          <Icon name="plus" size={15} />
          {findStops ? "Close place search" : "Add stop"}
        </button>
        {findStops && (
          <PlaceSearch
            label="Search optional stops"
            near={destination?.location}
            budget={budget}
            favorites={favorites}
            onFavorite={(place) =>
              setFavorites(
                favorites.some((f) => f.id === place.id)
                  ? favorites.filter((f) => f.id !== place.id)
                  : [...favorites, place],
              )
            }
            onSelect={choose}
            disabled={busy}
          />
        )}
        {favorites.length > 0 && (
          <div className="favorite-places">
            <p className="field-heading">Favourites · this session</p>
            {favorites.map((place) => (
              <button
                type="button"
                key={place.id}
                className="subtle-button"
                disabled={
                  selected.some((s) => s.id === place.id) ||
                  selected.length >= 6
                }
                onClick={() => choose(place)}
              >
                <Icon name="attraction" size={13} />
                {place.name}
                <Icon name="plus" size={13} />
              </button>
            ))}
          </div>
        )}
        <div className="form-divider" />
        <details className="preference-details trip-preferences">
          <summary>
            <Icon name="layers" size={15} /> Preferences & suggestions
          </summary>
          <label>
            How should suggestions work?
            <select
              value={suggestionMode}
              onChange={(e) =>
                setSuggestionMode(e.target.value as "manual" | "suggest")
              }
            >
              <option value="manual">Only the places I choose</option>
              <option value="suggest">I’m open to suggestions</option>
            </select>
          </label>
          <details className="preference-details">
            <summary>Interests & budget</summary>
            <p className="field-heading">What sounds good?</p>
            <div className="interests">
              {categories.map((category) => (
                <label key={category} className="interest">
                  <input
                    type="checkbox"
                    checked={activities.includes(category)}
                    onChange={() =>
                      setActivities(
                        activities.includes(category)
                          ? activities.filter((a) => a !== category)
                          : [...activities, category],
                      )
                    }
                  />
                  <Icon name={category} size={15} />
                  {category}
                </label>
              ))}
            </div>
            <div className="interests">
              {tags.map((tag) => (
                <label key={tag} className="interest">
                  <input
                    type="checkbox"
                    checked={interests.includes(tag)}
                    onChange={() =>
                      setInterests(
                        interests.includes(tag)
                          ? interests.filter((t) => t !== tag)
                          : [...interests, tag],
                      )
                    }
                  />
                  {tag}
                </label>
              ))}
            </div>
            <label>
              Budget preference
              <select
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
              >
                <option value="any">Any budget</option>
                <option value="budget">Free & inexpensive</option>
                <option value="moderate">Moderate</option>
                <option value="premium">Premium</option>
              </select>
            </label>
          </details>
          {suggestionMode === "suggest" && (
            <PlaceSearch
              key={[...activities, ...interests].join(",")}
              label="Explore suggestions"
              initialQuery={[...interests, ...activities][0] || "things to do"}
              near={destination?.location}
              budget={budget}
              favorites={favorites}
              onFavorite={(place) =>
                setFavorites(
                  favorites.some((f) => f.id === place.id)
                    ? favorites.filter((f) => f.id !== place.id)
                    : [...favorites, place],
                )
              }
              onSelect={choose}
              disabled={busy}
            />
          )}
          <label>
            Anything else?
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              name="preferences"
              maxLength={1000}
              rows={3}
              placeholder="Quiet places, vegetarian food, avoid crowds…"
            />
          </label>
          <button
            type="button"
            className="secondary"
            disabled={!preferencesDirty}
            onClick={() => {
              setPreferencesDirty(false);
              if (origin && destination) changed();
            }}
          >
            Apply preferences
          </button>
          <p className="field-help">
            {preferencesDirty
              ? "Preferences changed. Apply to update the route, or send a chat message to use them with Gemini."
              : "Preferences are used when you apply them or send a chat message."}
          </p>
        </details>
        {error && (
          <p role="alert" className="search-error">
            {error}
          </p>
        )}
      </fieldset>
    </form>
  );
}
