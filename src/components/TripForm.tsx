"use client";
import {
  useEffect,
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
import { Icon } from "./Icon";
import { PlaceSearch } from "./PlaceSearch";
import {
  planningConstraintsSchema,
  type PlanningConstraints,
} from "@/types/planning-constraints";
export type TripFormHandle = { getConstraints: () => PlanningConstraints };
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
  const attemptedRevision = useRef(0);
  const draggedId = useRef<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const changed = () => setRevision((value) => value + 1);
  const formRef = useRef<HTMLFormElement>(null);
  const [origin, setOrigin] = useState<TripRequest["origin"] | null>(null),
    [destination, setDestination] = useState<TripRequest["destination"] | null>(
      null,
    );
  const [editing, setEditing] = useState<"origin" | "destination" | null>(
    "origin",
  );
  const [activities, setActivities] = useState<TripRequest["activities"]>([
    "coffee",
    "park",
    "bookstore",
    "food",
  ]);
  const [transportation, setTransportation] =
    useState<TripRequest["transportation"]>("transit");
  const [selected, setSelected] = useState<
    NonNullable<TripRequest["selectedStops"]>
  >([]);
  const [orderPolicy, setOrderPolicy] = useState<"preserve" | "optimize">(
    "preserve",
  );
  const [favorites, setFavorites] = useState<CandidatePlace[]>([]);
  const [interests, setInterests] = useState<string[]>([]);
  const [budget, setBudget] = useState("any");
  const [error, setError] = useState("");
  const [findStops, setFindStops] = useState(false);
  const [suggestionMode, setSuggestionMode] = useState<"manual" | "suggest">(
    "manual",
  );
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
    setRevision(0);
    if (currentTrip) {
      setOrigin(currentTrip.request.origin);
      setDestination(currentTrip.request.destination);
      setTransportation(currentTrip.request.transportation);
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
        preferences: String(form.get("preferences") || ""),
        routeRadiusMeters: Number(form.get("routeRadius") || 1000),
      });
    },
  }));
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
      <fieldset disabled={busy}>
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
              key={`${transportation}-${orderPolicy}`}
              defaultValue="fastest"
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
                name="start"
                type="datetime-local"
              />
            </label>
            <label>
              Finish by
              <input
                aria-describedby="time-help"
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
          Chat keeps these stops and your travel mode. Remove a stop here to
          leave it out.
        </p>
        <label>
          Search distance from route
          <select name="routeRadius" defaultValue="1000">
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
        <div className="chosen-stops">
          {selected.map((place, index) => (
            <div
              key={place.id}
              data-stop-id={place.id}
              className={
                dropTarget === place.id ? "stop-drop-target" : undefined
              }
              onDragOver={(event) => {
                if (!busy && !place.locked) {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  setDropTarget(place.id);
                }
              }}
              onDrop={(event) => {
                event.preventDefault();
                const from = selected.findIndex(
                  (stop) => stop.id === draggedId.current,
                );
                moveStop(from, index);
                draggedId.current = null;
                setDropTarget(null);
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
                  event.dataTransfer.setData("text/plain", place.id);
                  event.dataTransfer.effectAllowed = "move";
                }}
                onDragEnd={() => {
                  draggedId.current = null;
                  setDropTarget(null);
                }}
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
              <strong>
                {index + 1}. {place.name}
              </strong>
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
              name="preferences"
              maxLength={1000}
              rows={3}
              placeholder="Quiet places, vegetarian food, avoid crowds…"
            />
          </label>
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
