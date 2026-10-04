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

    const body = new FormData();
    body.append("file", audio, audio.name || "voice.webm");
    body.append("model_id", "scribe_v2");

    const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
    if (!apiKey)
      throw new AppError(
        "CONFIGURATION",
        "Configure ELEVENLABS_API_KEY to use voice transcription.",
        503,
      );

    const response = await fetch(
      "https://api.elevenlabs.io/v1/speech-to-text",
      {
        method: "POST",
        headers: { "xi-api-key": apiKey },
        body,
        signal: AbortSignal.timeout(60_000),
        cache: "no-store",
      },
    );

    if (!response.ok)
      throw new AppError(
        "TRANSCRIPTION_FAILED",
        "ElevenLabs could not transcribe this recording. Try again.",
        502,
      );

    return transcriptSchema.parse(await response.json());
  });
}
