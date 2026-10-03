import "server-only";
import { AppError } from "./http";
export function dataMode(): "demo" | "live" {
  const mode = process.env.DATA_MODE ?? "demo";
  if (mode !== "demo" && mode !== "live")
    throw new AppError("CONFIGURATION", "DATA_MODE must be demo or live.", 503);
  return mode;
}
export function requireEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value)
    throw new AppError(
      "CONFIGURATION",
      `Configure ${name} on the server to use live mode.`,
      503,
    );
  return value;
}

// Real geographic data can be used without enabling an AI planner.
export function mapsMode(): "demo" | "live" {
  const configured = process.env.MAPS_DATA_MODE;
  if (configured === "demo" || configured === "live") return configured;
  return process.env.GOOGLE_MAPS_SERVER_API_KEY?.trim() ? "live" : dataMode();
}
