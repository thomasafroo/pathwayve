type Phase = "planning" | "ready" | "review";
export function PlanningCompanion({ phase }: { phase: Phase }) {
  return (
    <div
      className={`planning-companion ${phase}`}
      role="status"
      aria-live="polite"
    >
      <svg
        className="companion-scene"
        viewBox="0 0 136 108"
        fill="none"
        aria-hidden="true"
      >
        <ellipse cx="68" cy="99" rx="42" ry="5" fill="#dcebe4" />
        <g className="companion-person">
          <path d="M46 87c0-19 9-31 22-31s24 12 24 31" fill="#276854" />
          <path d="M62 57v8c3 5 10 5 13 0v-9" fill="#d69b75" />
          <ellipse cx="69" cy="41" rx="17" ry="20" fill="#edbc96" />
          <path
            d="M52 42c-5-16 3-27 18-26 14 0 20 11 16 24l-5-12c-9 5-17 4-23 2l-3 12"
            fill="#293d36"
          />
          <path
            d="M64 44h1m11 0h1"
            stroke="#293d36"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <path
            d="M68 53q4 3 7-1"
            stroke="#a66447"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <g className="companion-map">
            <path
              d="m34 65 23 5 23-8 24 5-4 29-23-5-23 8-22-5Z"
              fill="#fffaf0"
              stroke="#9abaac"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
            <path d="m57 70-3 29m26-37-3 29" stroke="#d4dfca" />
            <path
              d="m39 75 12 8 13-7 15 7 17-7"
              stroke="#acd2bc"
              strokeWidth="6"
              strokeLinejoin="round"
            />
            <path
              className="companion-route"
              d="m43 89 15-6 9 4 18-12 9 1"
              stroke="#276854"
              strokeWidth="2"
              strokeLinecap="round"
              strokeDasharray="3 4"
            />
            <circle cx="94" cy="76" r="3" fill="#ce9d48" />
          </g>
          <path
            d="M35 72c-10 0-10 14 0 14h4V74Zm67 0c10 0 10 14 0 14h-4V74Z"
            fill="#edbc96"
          />
        </g>
        {phase === "ready" ? (
          <g className="companion-bulb">
            <path
              d="M103 12a10 10 0 0 1 6 18v5H98v-5a10 10 0 0 1 5-18Z"
              fill="#ffe09b"
              stroke="#b8862f"
              strokeWidth="1.5"
            />
            <path
              d="M99 39h9m-7 3h5m-2-32V5m14 10 4-3m-4 17 5 2M90 15l-4-3"
              stroke="#b8862f"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </g>
        ) : (
          <g
            className="companion-questions"
            fill="#528b77"
            fontFamily="inherit"
            fontWeight="600"
          >
            <text className="question-one" x="101" y="30" fontSize="25">
              ?
            </text>
            <text className="question-two" x="27" y="38" fontSize="17">
              ?
            </text>
          </g>
        )}
      </svg>
      <div>
        <span className="companion-eyebrow">YOUR LITTLE WAYFINDER</span>
        <strong>
          {phase === "planning"
            ? "Finding your way…"
            : phase === "ready"
              ? "Aha! Your route is ready."
              : "A little more planning needed."}
        </strong>
        <p>
          {phase === "planning"
            ? "Connecting the dots for your day."
            : phase === "ready"
              ? "Take a look — your day is mapped out."
              : "Review the remaining details in your itinerary."}
        </p>
      </div>
      {phase === "planning" && (
        <span className="companion-dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
      )}
    </div>
  );
}
