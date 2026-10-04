import { bringAdviceRequestSchema } from "@/types/trip";
import { classifyBringAdvice } from "@/lib/bring-advice";
import { handleApi, readJson } from "@/lib/server/http";

export async function POST(request: Request) {
  return handleApi(async () => {
    const { weather } = bringAdviceRequestSchema.parse(await readJson(request));
    return { advice: classifyBringAdvice(weather) };
  });
}
