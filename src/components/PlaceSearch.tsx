"use client";
import { useId, useRef, useState } from "react";
import { z } from "zod";
import {
  candidatePlaceSchema,
  type CandidatePlace,
  type Location,
} from "@/types/trip";
import { Icon } from "./Icon";

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
    const token = ++revision.current;
    setBusy(true);
    setError("");
    setResults([]);
    try {
      const response = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, near, budget, category }),
      });
      const json = await response.json();
      if (!response.ok)
        throw new Error(json.error?.message ?? "Place search failed.");
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
    <section className="place-search" aria-label={label}>
      <label htmlFor={inputId}>{label}</label>
      <div className="search-input-row">
        <input
          id={inputId}
          value={query}
          disabled={disabled}
          placeholder="Search any place, address, or city"
          onChange={(e) => {
            setQuery(e.target.value);
            revision.current++;
            setResults([]);
            setError("");
            setBusy(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void search();
            }
          }}
        />
        <button
          type="button"
          className="secondary"
          disabled={disabled || busy || query.trim().length < 2}
          onClick={() => void search()}
        >
          {busy ? "Searching…" : "Search"}
        </button>
      </div>
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
