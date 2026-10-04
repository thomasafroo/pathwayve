import type { PlaceInsight as Insight } from "@/types/trip";

const requirementLabels = {
  seating: "Seating",
  quiet: "Quiet",
  wifi: "Wi-Fi",
} as const;

// Grounding with Google Maps requires its sources to follow the generated text
// directly, attributed to Google Maps and viewable within one interaction.
export function PlaceInsight({ insight }: { insight: Insight }) {
  const place = insight.sources.find((source) => source.kind === "place");
  const reviews = insight.sources.filter((source) => source.kind === "review");
  return (
    <div className="place-insight" aria-label="Why this stop">
      <p className="place-insight-summary">
        <span className="place-insight-label">Why this stop</span>
        {insight.summary}
      </p>
      {(insight.highlights.length > 0 || insight.verified.length > 0) && (
        <ul className="place-insight-tags">
          {insight.verified.map((requirement) => (
            <li key={requirement} className="verified">
              ✓ {requirementLabels[requirement]}
            </li>
          ))}
          {insight.highlights.map((highlight) => (
            <li key={highlight}>{highlight}</li>
          ))}
        </ul>
      )}
      {insight.concerns && (
        <p className="place-insight-concern">Heads up: {insight.concerns}</p>
      )}
      <div className="place-insight-sources">
        <span>Source:</span>
        {place ? (
          <a href={place.uri} target="_blank" rel="noreferrer">
            {place.title}
          </a>
        ) : (
          <span>
            {reviews.length === 1 ? "1 review" : `${reviews.length} reviews`}
          </span>
        )}
        <span className="google-maps-attribution">Google Maps</span>
      </div>
      {reviews.length > 0 && (
        <details className="place-insight-reviews">
          <summary>
            {reviews.length === 1
              ? "1 review used"
              : `${reviews.length} reviews used`}
          </summary>
          <ul>
            {reviews.map((review) => (
              <li key={review.uri}>
                {review.excerpt && <q>{review.excerpt}</q>}{" "}
                <a href={review.uri} target="_blank" rel="noreferrer">
                  {review.title}
                </a>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
