"use client";
import { useEffect, useId, useRef, useState } from "react";
import { z } from "zod";
import {
  candidatePlaceSchema,
  type CandidatePlace,
  type Location,
} from "@/types/trip";
import { Icon } from "./Icon";
import { predictionsSchema, type PlacePrediction } from "@/types/place-search";

const resultsSchema = z.object({
  source: z.enum(["demo", "live"]),
  places: z.array(candidatePlaceSchema),
});
export function PlaceSearch({
  label,
  onSelect,
  near,
  budget = "any",
  category = "attraction",
  initialQuery = "",
  favorites = [],
  onFavorite,
  disabled = false,
}: {
  label: string;
  onSelect: (place: CandidatePlace) => void;
  near?: Location;
  budget?: string;
  category?: CandidatePlace["category"];
  initialQuery?: string;
  favorites?: CandidatePlace[];
  onFavorite?: (place: CandidatePlace) => void;
  disabled?: boolean;
}) {
  const inputId = useId();
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<CandidatePlace[]>([]);
  const [source, setSource] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [sort, setSort] = useState("match");
  const revision = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const controller = useRef<AbortController | null>(null);
  const session = useRef<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [suggestions, setSuggestions] = useState<PlacePrediction[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [predictionSource, setPredictionSource] = useState("");
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const listId = `${inputId}-suggestions`;
  // Query whose suggestions are scheduled or loading; cleared once settled.
  const pendingQuery = useRef<string | null>(null);
  useEffect(() => {
    // React can run this cleanup and setup again without unmounting (Strict
    // Mode, restored Activity). Restart a lookup the cleanup cancelled, or the
    // list stays on "Finding suggestions…" with no request in flight.
    if (pendingQuery.current !== null) {
      const text = pendingQuery.current,
        token = revision.current;
      timer.current = setTimeout(() => void suggest(text, token), 300);
    }
    return stopRequests;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount/unmount only
  }, []);
  useEffect(() => {
    if (open && active >= 0)
      document
        .getElementById(`${listId}-${active}`)
        ?.scrollIntoView({ block: "nearest" });
  }, [active, listId, open]);
  // Invalidates scheduled and in-flight requests but keeps pendingQuery, so an
  // effect re-run can restart it.
  function stopRequests() {
    if (timer.current) clearTimeout(timer.current);
    controller.current?.abort();
    revision.current++;
  }
  function cancelPending() {
    pendingQuery.current = null;
    stopRequests();
  }
  async function post(url: string, body: unknown) {
    controller.current = new AbortController();
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.current.signal,
    });
    const json = await response.json();
    if (!response.ok)
      throw new Error(json.error?.message ?? "Place search failed.");
    return json;
  }
  async function suggest(text: string, token: number) {
    session.current ??= crypto.randomUUID();
    try {
      const data = predictionsSchema.parse(
        await post("/api/autocomplete", {
          query: text,
          near,
          sessionToken: session.current,
        }),
      );
      if (revision.current !== token) return;
      setSuggestions(data.suggestions);
      setPredictionSource(data.source);
      setOpen(true);
    } catch (e) {
      if (revision.current === token)
        setError(e instanceof Error ? e.message : "Suggestions unavailable.");
    } finally {
      if (revision.current === token) {
        pendingQuery.current = null;
        setLoadingSuggestions(false);
      }
    }
  }
  function changeQuery(text: string) {
    cancelPending();
    setQuery(text);
    setResults([]);
    setSuggestions([]);
    setActive(-1);
    setError("");
    setBusy(false);
    setOpen(text.trim().length >= 2);
    setLoadingSuggestions(text.trim().length >= 2);
    if (text.trim().length >= 2) {
      const token = revision.current;
      pendingQuery.current = text;
      timer.current = setTimeout(() => void suggest(text, token), 300);
    } else session.current = null;
  }
  async function selectPrediction(prediction: PlacePrediction) {
    cancelPending();
    const token = revision.current;
    const sessionToken = session.current ?? crypto.randomUUID();
    session.current = null;
    setOpen(false);
    setLoadingSuggestions(false);
    setBusy(true);
    setError("");
    try {
      const data = z.object({ place: candidatePlaceSchema }).parse(
        await post("/api/place-details", {
          placeId: prediction.placeId,
          sessionToken,
          category,
        }),
      );
      if (revision.current !== token) return;
      setSuggestions([]);
      setResults([]);
      setQuery("");
      setBusy(false);
      onSelect(data.place);
    } catch (e) {
      if (revision.current === token)
        setError(e instanceof Error ? e.message : "Could not load this place.");
    } finally {
      if (revision.current === token) setBusy(false);
    }
  }
  const km = (p: CandidatePlace) =>
    near
      ? Math.hypot(
          (p.location.lat - near.lat) * 111,
          (p.location.lng - near.lng) *
            111 *
            Math.cos((near.lat * Math.PI) / 180),
        )
      : 0;
  const isFavorite = (p: CandidatePlace) =>
    favorites.some((f) => f.id === p.id);
  const score = (p: CandidatePlace) =>
    (isFavorite(p) ? 8 : 0) +
    (p.rating ?? 3) * Math.min(1, (p.ratingCount ?? 0) / 50) -
    Math.min(km(p), 50) / 10;
  const sorted = [...results].sort((a, b) =>
    sort === "rating"
      ? (b.rating ?? 0) - (a.rating ?? 0)
      : sort === "nearby"
        ? km(a) - km(b)
        : score(b) - score(a),
  );
  async function search() {
    if (query.trim().length < 2) return;
    cancelPending();
    const token = revision.current;
    session.current = null;
    setOpen(false);
    setSuggestions([]);
    setLoadingSuggestions(false);
    setBusy(true);
    setError("");
    setResults([]);
    try {
      const json = await post("/api/search", { query, near, budget, category });
      const data = resultsSchema.parse(json);
      if (token !== revision.current) return;
      setResults(data.places);
      setSource(data.source);
      if (!data.places.length)
        setError(
          data.source === "demo"
            ? "No sample matches. Configure the server Places key to search real locations."
            : "No places found. Try a more specific name, address, or city.",
        );
    } catch (e) {
      if (token === revision.current)
        setError(e instanceof Error ? e.message : "Search failed.");
    } finally {
      if (token === revision.current) setBusy(false);
    }
  }
  return (
    <section
      className="place-search"
      aria-label={label}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          if (loadingSuggestions || open) {
            cancelPending();
            setLoadingSuggestions(false);
          }
          setOpen(false);
          setActive(-1);
        }
      }}
    >
      <label htmlFor={inputId}>{label}</label>
      <div className="autocomplete-field">
        <div className="search-input-row autocomplete-input-row">
          <Icon name="search" size={18} />
          <input
            ref={inputRef}
            id={inputId}
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={open}
            aria-controls={open ? listId : undefined}
            aria-activedescendant={
              open && active >= 0 && suggestions[active]
                ? `${listId}-${active}`
                : undefined
            }
            autoComplete="off"
            maxLength={200}
            value={query}
            disabled={disabled}
            placeholder="Search a place or address"
            onChange={(e) => changeQuery(e.target.value)}
            onFocus={() => {
              if (suggestions.length) setOpen(true);
            }}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing) return;
              if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                if (!suggestions.length) return;
                e.preventDefault();
                setOpen(true);
                setActive((index) =>
                  e.key === "ArrowDown"
                    ? (index + 1) % suggestions.length
                    : index <= 0
                      ? suggestions.length - 1
                      : index - 1,
                );
              } else if (e.key === "Enter") {
                e.preventDefault();
                if (busy) return;
                if (open && suggestions.length)
                  void selectPrediction(suggestions[Math.max(0, active)]);
                else void search();
              } else if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                cancelPending();
                setOpen(false);
                setActive(-1);
                setLoadingSuggestions(false);
                setBusy(false);
              }
            }}
          />
          {query && (
            <button
              type="button"
              className="icon-button"
              aria-label={`Clear ${label}`}
              disabled={disabled}
              onClick={() => {
                changeQuery("");
                inputRef.current?.focus();
              }}
            >
              <Icon name="close" size={15} />
            </button>
          )}
          <button
            type="button"
            className="icon-button search-submit"
            aria-label="Search"
            title="Search all results"
            disabled={disabled || busy || query.trim().length < 2}
            onClick={() => void search()}
          >
            <Icon name="arrow" size={17} />
          </button>
        </div>
        {open && (
          <div className="autocomplete-dropdown">
            <ul id={listId} role="listbox" aria-label={`${label} suggestions`}>
              {suggestions.map((p, index) => (
                <li
                  key={p.placeId}
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={active === index}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => {
                    if (!disabled) void selectPrediction(p);
                  }}
                >
                  <span className="prediction-icon">
                    <Icon name="pin" size={18} />
                  </span>
                  <span>
                    <strong>{p.name}</strong>
                    <small>{p.address}</small>
                  </span>
                  <Icon name="arrow" size={14} />
                </li>
              ))}
            </ul>
            {loadingSuggestions ? (
              <p className="autocomplete-message">Finding places…</p>
            ) : !suggestions.length && !error ? (
              <p className="autocomplete-message">
                No suggestions. Try a name with a city, or press Enter to search
                all results.
              </p>
            ) : null}
            {suggestions.length > 0 && (
              <div className="autocomplete-attribution">
                {predictionSource === "live" ? "Google Maps" : "Sample places"}
                <span>↑ ↓ to browse · Enter to select</span>
              </div>
            )}
          </div>
        )}
      </div>
      <span className="search-announcement" aria-live="polite">
        {busy
          ? "Loading place…"
          : loadingSuggestions
            ? "Finding suggestions…"
            : open
              ? `${suggestions.length} suggestions available`
              : ""}
      </span>
      {error && (
        <p className="search-error" role="alert">
          {error}
        </p>
      )}
      {results.length > 0 && (
        <>
          <div className="search-results-heading">
            <span>
              {source === "live" ? "Google Maps results" : "Sample results"} ·
              choose a place
            </span>
            <select
              aria-label={`Sort ${label}`}
              value={sort}
              onChange={(e) => setSort(e.target.value)}
            >
              <option value="match">Best match</option>
              <option value="rating">Highest rated</option>
              {near && <option value="nearby">Closest</option>}
            </select>
          </div>
          <p className="hint">
            Best match weighs your saved favourites, rating confidence, and
            straight-line distance. Travel detours are calculated after
            selection.
          </p>
          <div className="search-results">
            {sorted.map((p, index) => (
              <div key={p.id} className="place-result">
                <button
                  type="button"
                  onClick={() => {
                    cancelPending();
                    setOpen(false);
                    setSuggestions([]);
                    onSelect(p);
                    setResults([]);
                    setQuery("");
                  }}
                  disabled={disabled}
                >
                  <strong>
                    <span className="rank-badge">{index + 1}</span>
                    {p.name}
                  </strong>
                  <small>{p.address}</small>
                  <small>
                    {isFavorite(p) ? "Favourite · " : ""}
                    {p.rating ? `${p.rating} ★ (${p.ratingCount ?? 0}) · ` : ""}
                    {near ? `${km(p).toFixed(1)} km away · ` : ""}
                    {p.priceLevel
                      ?.replace("PRICE_LEVEL_", "")
                      .toLowerCase()
                      .replaceAll("_", " ")}
                  </small>
                </button>
                {onFavorite && (
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`${isFavorite(p) ? "Unsave" : "Save"} ${p.name}`}
                    aria-pressed={isFavorite(p)}
                    onClick={() => onFavorite(p)}
                  >
                    <Icon name="attraction" size={17} />
                  </button>
                )}
                {p.mapsUrl && (
                  <a
                    href={p.mapsUrl}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`View ${p.name} on Google Maps`}
                  >
                    ↗
                  </a>
                )}
              </div>
            ))}
          </div>
          <p className="hint">
            {source === "live"
              ? "Place information from Google Maps. Ratings and prices may be unavailable."
              : "Fictional venues / sample endpoints. Real internet search requires Places API (New)."}
          </p>
        </>
      )}
    </section>
  );
}
