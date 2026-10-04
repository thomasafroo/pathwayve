import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { z } from "zod";
import { AppError, handleApi } from "@/lib/server/http";

const transcriptSchema = z.object({
  text: z.string().trim().min(1),
});

export const maxDuration = 60;

export async function POST(request: Request) {
  return handleApi(async () => {
    const form = await request.formData();
    const audio = form.get("audio");
    if (!(audio instanceof File) || audio.size === 0)
      throw new AppError("INVALID_AUDIO", "Record audio before transcribing.");
    if (audio.size > 10 * 1024 * 1024)
      throw new AppError(
        "AUDIO_TOO_LARGE",
        "Keep voice notes under 10 MB.",
        413,
      );

    const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
    if (!apiKey)
      throw new AppError(
        "CONFIGURATION",
        "Configure ELEVENLABS_API_KEY to use voice transcription.",
        503,
      );

    try {
      const client = new ElevenLabsClient({ apiKey });
      return transcriptSchema.parse(
        await client.speechToText.convert({
          file: audio,
          modelId: "scribe_v2",
        }),
      );
    } catch {
      throw new AppError(
        "TRANSCRIPTION_FAILED",
        "ElevenLabs could not transcribe this recording. Try again.",
        502,
      );
    }
  });
}
