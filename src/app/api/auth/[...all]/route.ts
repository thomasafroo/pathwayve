import { authConfigured, getAuth } from "@/lib/server/auth";
import { handleApi } from "@/lib/server/http";
export const runtime = "nodejs";
async function handler(request: Request) {
  if (
    !authConfigured() &&
    new URL(request.url).pathname.endsWith("/get-session")
  )
    return Response.json(null, { headers: { "Cache-Control": "no-store" } });
  try {
    return await (await getAuth()).handler(request);
  } catch (error) {
    return handleApi(async () => {
      throw error;
    });
  }
}
export { handler as GET, handler as POST };
