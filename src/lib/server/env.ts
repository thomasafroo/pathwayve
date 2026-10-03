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
