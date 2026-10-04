import { beginGoogleConnection } from "@/lib/server/google-calendar-auth";
import { AppError, handleApi } from "@/lib/server/http";
export const runtime = "nodejs";
export async function POST(request: Request) {
  return handleApi(async () => {
    if (request.headers.get("origin") !== new URL(request.url).origin)
      throw new AppError("ORIGIN", "Connect from this site.", 403);
    return { url: await beginGoogleConnection(request) };
  });
}
