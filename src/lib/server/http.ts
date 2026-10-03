import "server-only";
import { z } from "zod";
export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export async function handleApi<T>(work: () => Promise<T>) {
  try {
    return Response.json(await work(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof z.ZodError)
      return Response.json(
        {
          error: {
            code: "VALIDATION",
            message: error.issues
              .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
              .join("; "),
          },
        },
        { status: 400 },
      );
    if (error instanceof SyntaxError)
      return Response.json(
        {
          error: {
            code: "INVALID_JSON",
            message: "Send a valid JSON request body.",
          },
        },
        { status: 400 },
      );
    if (error instanceof AppError)
      return Response.json(
        { error: { code: error.code, message: error.message } },
        { status: error.status },
      );
    // Do not log raw provider errors: they may include request text or credentials.
    console.error(
      "PathWayve request failed:",
      error instanceof Error ? error.name : "UnknownError",
    );
    return Response.json(
      {
        error: {
          code: "INTERNAL",
          message:
            "The planner could not complete this request. Please try again.",
        },
      },
      { status: 500 },
    );
  }
}
export async function readJson(request: Request): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) throw new AppError("INVALID_JSON", "A JSON body is required.");
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 128 * 1024) {
      await reader.cancel();
      throw new AppError("BODY_TOO_LARGE", "Request exceeds 128 KB.", 413);
    }
    chunks.push(value);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
export async function googlePost(
  url: string,
  key: string,
  fields: string,
  body: unknown,
): Promise<unknown> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": fields,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  if (!response.ok)
    throw new AppError(
      "PROVIDER_ERROR",
      "Google could not complete the request. Check enabled APIs, key restrictions, billing, and quota.",
      502,
    );
  return response.json();
}
