import type { CSSProperties } from "react";

const paths = {
  arrow: "M5 12h14m-6-6 6 6-6 6",
  pin: "M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0ZM15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z",
  route: "M5 5h9a4 4 0 0 1 0 8H9a4 4 0 0 0 0 8h10M5 2v6m11 10 3 3-3 3",
  clock: "M12 8v5l3 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z",
  coffee:
    "M4 8h12v9a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V8Zm12 1h2a3 3 0 1 1 0 6h-2M7 2v3m5-3v3",
  park: "m12 2-7 9h3l-5 7h18l-5-7h3L12 2Zm0 16v4",
  bookstore:
    "M12 5v16M12 5C8 2 4 3 2 4v16c4-2 7-1 10 1 3-2 6-3 10-1V4c-2-1-6-2-10 1Z",
  food: "M5 2v7m-3-7v5a3 3 0 0 0 6 0V2M5 10v12M20 2c-4 3-5 7-4 11h4m0-11v20",
  shopping: "M3 7h18l-1 15H4L3 7Zm5 0V5a4 4 0 0 1 8 0v2",
  attraction: "m12 2 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1 3-6Z",
  transit:
    "M5 17h14V6a3 3 0 0 0-3-3H8a3 3 0 0 0-3 3v11Zm0-7h14M8 14h.01M16 14h.01M7 17l-2 5m12-5 2 5M6 20h12",
  walking:
    "m13 7-4 5-4 1m8-6 3 5 4 1M10 12l3 4-1 6M9 14l-4 7M16 3a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z",
  driving: "m3 10 2-6h14l2 6M3 10h18v9H3v-9Zm0 9v3m18-3v3M6 14h2m8 0h2",
  lock: "M5 10h14v12H5V10Zm3 0V6a4 4 0 0 1 8 0v4m-4 5v3",
  unlock: "M5 10h14v12H5V10Zm3 0V6a4 4 0 0 1 8 0m-4 9v3",
  plus: "M12 5v14M5 12h14",
  close: "m6 6 12 12M6 18 18 6",
  up: "m6 15 6-6 6 6",
  down: "m6 9 6 6 6-6",
  rain: "M6 15a5 5 0 1 1 2-9 6 6 0 0 1 11 2 4 4 0 0 1-1 8M8 18l-1 3m6-3-1 3m6-3-1 3",
  sparkle: "m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z",
  check: "m5 12 4 4L19 6",
  download: "M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4",
  undo: "m9 3-6 6 6 6M3 9h10a7 7 0 0 1 0 14",
  layers: "m12 3 10 6-10 6L2 9l10-6Zm-10 12 10 6 10-6M2 12l10 6 10-6",
} as const;
export type IconName = keyof typeof paths;
export function Icon({
  name,
  size = 20,
  style,
}: {
  name: IconName;
  size?: number;
  style?: CSSProperties;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={style}
    >
      <path d={paths[name]} />
    </svg>
  );
}
