"use client";
import { useState, type FormEvent } from "react";
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
function localInputTime(iso?: string) {
  if (!iso) return "";
  const date = new Date(iso);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}
export function TripForm({
  busy,
  onPlan,
  mode = "demo",
  currentTrip,
  pendingPlace,
}: {
  pendingPlace?: CandidatePlace | null;
  currentTrip: TripState | null;
  mode?: "demo" | "live";
  busy: boolean;
  onPlan: (request: TripRequest) => Promise<void>;
}) {
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
  const [favorites, setFavorites] = useState<CandidatePlace[]>([]);
  const [interests, setInterests] = useState<string[]>(
    currentTrip?.request.interestTags ?? [],
  );
  const [budget, setBudget] = useState<string>(
    currentTrip?.request.budget ?? "any",
  );
  const [error, setError] = useState("");
  const [findStops, setFindStops] = useState(false);
  const [suggestionMode, setSuggestionMode] = useState<"manual" | "suggest">(
    currentTrip?.request.suggestionMode ?? "manual",
  );
  const [syncedTrip, setSyncedTrip] = useState(currentTrip);
  const [consumedPlace, setConsumedPlace] = useState(pendingPlace);
  if (pendingPlace && pendingPlace !== consumedPlace) {
    setConsumedPlace(pendingPlace);
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
    if (currentTrip) {
      setSelected(
        currentTrip.stops.map((stop) => ({
          ...stop,
          priority: stop.priority ?? "optional",
        })),
      );
    }
  }
  function choose(place: CandidatePlace) {
    if (selected.some((s) => s.id === place.id)) return;
    if (selected.length >= 6) {
      setError("Choose up to six stops.");
      return;
    }
    setSelected([
      ...selected,
      { ...place, durationMinutes: 30, locked: false, priority: "required" },
    ]);
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!origin || !destination) {
      setError(
        "Choose your starting point and destination from search results.",
      );
      return;
    }
    const form = new FormData(event.currentTarget);
    try {
      const request = tripRequestSchema.parse({
        origin,
        destination,
        startTime: form.get("start")
          ? new Date(String(form.get("start"))).toISOString()
          : undefined,
        endTime: form.get("end")
          ? new Date(String(form.get("end"))).toISOString()
          : undefined,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        transportation,
        activities,
        preferences: String(form.get("preferences") || ""),
        interestTags: interests,
        favoritePlaceIds: favorites.map((place) => place.id),
        budget,
        routingPriority: form.get("priority") || "fastest",
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
  return (
    <form id="trip-planner-form" onSubmit={submit} className="trip-form">
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
              onClick={() => setTransportation(mode)}
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
              key={transportation}
              defaultValue={currentTrip?.request.routingPriority ?? "fastest"}
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
                defaultValue={localInputTime(currentTrip?.request.startTime)}
                type="datetime-local"
              />
            </label>
            <label>
              Finish by
              <input
                aria-describedby="time-help"
                name="end"
                defaultValue={localInputTime(currentTrip?.request.endTime)}
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
        <div className="chosen-stops">
          {selected.map((place, index) => (
            <div key={place.id}>
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
                onClick={() =>
                  setSelected(selected.filter((s) => s.id !== place.id))
                }
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
              defaultValue={currentTrip?.request.preferences ?? ""}
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
