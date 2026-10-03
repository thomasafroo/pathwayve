"use client";
import { useState, type FormEvent } from "react";
import { categories, type TripRequest } from "@/types/trip";
import { endpoints, exampleRequest } from "@/lib/fixtures";

function localInput(iso: string) {
  const date = new Date(iso);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}
export function TripForm({
  busy,
  onPlan,
}: {
  busy: boolean;
  onPlan: (request: TripRequest) => Promise<void>;
}) {
  const [activities, setActivities] = useState<TripRequest["activities"]>([
    "coffee",
    "park",
    "bookstore",
    "food",
  ]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const defaults = exampleRequest();
    await onPlan({
      origin: endpoints[Number(form.get("origin"))],
      destination: endpoints[Number(form.get("destination"))],
      startTime: form.get("start")
        ? new Date(String(form.get("start"))).toISOString()
        : defaults.startTime,
      endTime: form.get("end")
        ? new Date(String(form.get("end"))).toISOString()
        : defaults.endTime,
      transportation: String(form.get("mode")) as TripRequest["transportation"],
      activities,
      preferences: String(form.get("preferences") || ""),
    });
  }
  return (
    <form onSubmit={submit} className="trip-form">
      <fieldset disabled={busy}>
        <legend>Your day, your way</legend>
        <label>
          Starting point
          <select name="origin" defaultValue="0">
            {endpoints.map((point, index) => (
              <option key={point.name} value={index}>
                {point.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Destination
          <select name="destination" defaultValue="1">
            {endpoints.map((point, index) => (
              <option key={point.name} value={index}>
                {point.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Getting around
          <select name="mode" defaultValue="transit">
            <option value="transit">Public transit</option>
            <option value="walking">Walking</option>
            <option value="driving">Driving</option>
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
          Times use your device’s timezone. Leave blank for a seven-hour trip
          starting in one hour.
        </p>
        <button
          className="text-button"
          type="button"
          onClick={(event) => {
            const form = event.currentTarget.form!;
            const request = exampleRequest();
            (form.elements.namedItem("start") as HTMLInputElement).value =
              localInput(request.startTime);
            (form.elements.namedItem("end") as HTMLInputElement).value =
              localInput(request.endTime);
          }}
        >
          Fill example times
        </button>
        <p className="field-heading">Make room for</p>
        <div className="interests">
          {categories.map((category) => (
            <label key={category} className="interest">
              <input
                type="checkbox"
                checked={activities.includes(category)}
                onChange={() =>
                  setActivities((current) =>
                    current.includes(category)
                      ? current.filter((item) => item !== category)
                      : [...current, category],
                  )
                }
              />
              {category}
            </label>
          ))}
        </div>
        <label>
          Anything else?
          <textarea
            name="preferences"
            maxLength={1000}
            rows={2}
            placeholder="Quiet cafés, inexpensive food, a scenic break…"
          />
        </label>
        <button className="primary" disabled={busy || !activities.length}>
          {busy ? "Putting your day together…" : "Plan my day →"}
        </button>
      </fieldset>
    </form>
  );
}
