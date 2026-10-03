"use client";
import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type FormEvent,
} from "react";
import { categories, type Location, type TripStop } from "@/types/trip";
import type { TripModification, WorkspaceTrip } from "@/types/workspace";
import { demoPlaces } from "@/lib/fixtures";
import { Icon } from "./Icon";
import { PlaceSearch } from "./PlaceSearch";

function Dialog({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    const trigger = document.activeElement;
    dialog?.showModal();
    return () => {
      dialog?.close();
      if (trigger instanceof HTMLElement && trigger.isConnected)
        trigger.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="editor-dialog"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      aria-labelledby="dialog-title"
    >
      <div className="dialog-inner">
        <div className="dialog-heading">
          <div>
            <p className="eyebrow">MAKE IT YOURS</p>
            <h2 id="dialog-title">{title}</h2>
          </div>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <Icon name="close" />
          </button>
        </div>
        <p className="dialog-subtitle">{subtitle}</p>
        {children}
      </div>
    </dialog>
  );
}
export function AddStopDialog({
  state,
  location,
  onApply,
  onClose,
}: {
  state: WorkspaceTrip;
  location: Location | null;
  onApply: (change: TripModification) => Promise<boolean>;
  onClose: () => void;
}) {
  const [custom, setCustom] = useState(!!location);
  const [error, setError] = useState("");
  const suggestions = demoPlaces.filter(
    (p) => !state.trip.stops.some((s) => s.id === p.id),
  );
  async function add(stop: TripStop) {
    if (
      await onApply({ type: "ADD_STOP", stop, index: state.trip.stops.length })
    )
      onClose();
    else
      setError(
        "This stop couldn't be added. Check your trip's time limit and stop count.",
      );
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    await add({
      id: `custom-${crypto.randomUUID()}`,
      name: String(data.get("name")),
      category: String(data.get("category")) as TripStop["category"],
      location: {
        lat: Number(data.get("latitude")),
        lng: Number(data.get("longitude")),
      },
      durationMinutes: Number(data.get("duration")),
      arrivalTime: state.trip.request.startTime,
      reason: "A place you chose for your day.",
      locked: false,
      priority: "required",
    });
  }
  return (
    <Dialog
      title="One more good stop."
      subtitle="Add a place to your route. Travel and arrival estimates will update together."
      onClose={onClose}
    >
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <PlaceSearch
        label="Find a place on Google Maps"
        near={state.trip.request.destination.location}
        onSelect={(place) =>
          void add({
            ...place,
            durationMinutes: 30,
            arrivalTime: state.trip.request.startTime,
            locked: false,
            priority: "required",
            reason: "Chosen by you from place search.",
          })
        }
      />
      <div className="editor-tabs">
        <button aria-pressed={!custom} onClick={() => setCustom(false)}>
          {state.trip.source === "demo"
            ? "Sample places"
            : "Search places above"}
        </button>
        <button aria-pressed={custom} onClick={() => setCustom(true)}>
          Custom place
        </button>
      </div>
      {!custom ? (
        <>
          <p className="hint">
            {state.trip.source === "demo"
              ? "Fictional venues for exploring the demo."
              : "Search for any place or enter a custom location."}
          </p>
          <div className="place-suggestions">
            {(state.trip.source === "demo" ? suggestions : []).map((place) => (
              <button
                key={place.id}
                onClick={() =>
                  add({
                    ...place,
                    durationMinutes: 30,
                    arrivalTime: state.trip.request.startTime,
                    reason: "Added by you. A little detour worth making.",
                    locked: false,
                    priority: "required",
                  })
                }
              >
                <span className={`category-icon ${place.category}`}>
                  <Icon name={place.category} />
                </span>
                <span>
                  <strong>{place.name}</strong>
                  <small>{place.category} · 30 min</small>
                </span>
                <Icon name="plus" size={18} />
              </button>
            ))}
            {!suggestions.length && (
              <p>All sample places are already in your trip.</p>
            )}
          </div>
        </>
      ) : (
        <form onSubmit={submit}>
          <label>
            Place name
            <input
              name="name"
              maxLength={160}
              required
              placeholder="A library, café, or your favourite spot"
              autoFocus
            />
          </label>
          <div className="two-fields">
            <label>
              Category
              <select name="category">
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Stay (minutes)
              <input
                name="duration"
                type="number"
                min={5}
                max={180}
                step={5}
                defaultValue={30}
                required
              />
            </label>
          </div>
          <div className="two-fields">
            <label>
              Latitude
              <input
                name="latitude"
                type="number"
                min={-90}
                max={90}
                step="any"
                defaultValue={location?.lat}
                required
              />
            </label>
            <label>
              Longitude
              <input
                name="longitude"
                type="number"
                min={-180}
                max={180}
                step="any"
                defaultValue={location?.lng}
                required
              />
            </label>
          </div>
          <p className="hint">
            Use the “Pick on map” control to fill coordinates, or enter a known
            location.
          </p>
          <button className="primary">
            Add to my day
            <Icon name="plus" size={18} />
          </button>
        </form>
      )}
    </Dialog>
  );
}
export function AddActivityDialog({
  state,
  stopId,
  onApply,
  onClose,
}: {
  state: WorkspaceTrip;
  stopId: string;
  onApply: (change: TripModification) => Promise<boolean>;
  onClose: () => void;
}) {
  const [error, setError] = useState("");
  const stop = state.trip.stops.find((s) => s.id === stopId)!;
  const available =
    stop.durationMinutes -
    state.activities
      .filter((a) => a.stopId === stopId && a.type === "USER_TASK")
      .reduce((sum, a) => sum + a.durationMinutes, 0);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    if (
      await onApply({
        type: "ADD_ACTIVITY",
        activity: {
          id: `task-${crypto.randomUUID()}`,
          type: "USER_TASK",
          stopId,
          title: String(data.get("title")),
          durationMinutes: Number(data.get("minutes")),
          completed: false,
        },
      })
    )
      onClose();
    else
      setError(
        "This activity doesn't fit. Increase the stop duration or choose a shorter activity.",
      );
  }
  return (
    <Dialog
      title="A little time for you."
      subtitle={`Plan something to do at ${stop.name}. ${available} minutes available within this stop.`}
      onClose={onClose}
    >
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {available < 5 ? (
        <p className="notice">
          This stop is full. Increase its duration before adding another
          activity.
        </p>
      ) : (
        <form onSubmit={submit}>
          <label>
            What would you like to do?
            <input
              name="title"
              required
              maxLength={160}
              placeholder="Read CPSC notes, sketch, catch up with a friend…"
              autoFocus
            />
          </label>
          <label>
            Time to set aside (minutes)
            <input
              name="minutes"
              type="number"
              min={5}
              max={available}
              step={5}
              defaultValue={Math.min(25, available)}
              required
            />
          </label>
          <p className="hint">
            This uses time already set aside at the stop. It moves with the stop
            if your plan changes.
          </p>
          <button className="primary">
            Add activity
            <Icon name="plus" size={18} />
          </button>
        </form>
      )}
    </Dialog>
  );
}
