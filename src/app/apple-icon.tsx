import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        alignItems: "center",
        background: "#fffefa",
        display: "flex",
        height: "100%",
        justifyContent: "center",
        width: "100%",
      }}
    >
      <svg width="156" height="156" viewBox="24 12 190 205" fill="none">
        <path
          d="M40 199V72C40 43 59 27 87 27H98C130 27 150 46 150 76C150 106 130 125 98 125H69L99 194L129 140L159 194"
          stroke="#171915"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="15"
        />
        <path
          d="M159 194L197 125"
          stroke="#829B55"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="15"
        />
      </svg>
    </div>,
    size,
  );
}
