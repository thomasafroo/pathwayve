"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { TripRequest } from "@/types/trip";
import { workspaceSchema, type WorkspaceTrip } from "@/types/workspace";
import type { ScheduleDocument } from "@/types/schedule";
import { Icon } from "./Icon";

export type ChatMessage = { role: "user" | "assistant"; text: string };
type SavedSummary = { id: string; name: string; status: string };

export function TripChat({
  compact,
  messages,
  onMessages,
  context,
  busy,
  onBusy,
  onSaved,
  onClose,
}: {
  compact: boolean;
  messages: ChatMessage[];
  onMessages: (update: (previous: ChatMessage[]) => ChatMessage[]) => void;
  context: TripRequest | null;
  busy: boolean;
  onBusy: (busy: boolean) => void;
  onSaved: (
    document: ScheduleDocument,
    workspace: WorkspaceTrip | null,
  ) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<SavedSummary[]>([]);
  const [showSaved, setShowSaved] = useState(false);
  const [ready, setReady] = useState(false);
  const [planning, setPlanning] = useState(false);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [listening, setListening] = useState(false);
  // Clarification turns sent back to Gemini with the next prompt.
  const [conversation, setConversation] = useState<string[]>([]);
  const requestId = useRef<string | null>(null);
  const sending = useRef(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const stopFallback = useRef<ReturnType<typeof setTimeout> | null>(null);
  const maxRecordingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const silenceFrame = useRef<number | null>(null);
  const audioContext = useRef<AudioContext | null>(null);
  const unmounted = useRef(false);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" });
  }, [messages, error]);
  useEffect(() => {
    // React Strict Mode runs this effect's cleanup once during development.
    // Reset the flag when the effect is active so completed recordings are not
    // mistaken for events from an unmounted component.
    unmounted.current = false;
    return () => {
      unmounted.current = true;
      if (stopFallback.current) clearTimeout(stopFallback.current);
      if (maxRecordingTimer.current) clearTimeout(maxRecordingTimer.current);
      if (silenceFrame.current) cancelAnimationFrame(silenceFrame.current);
      void audioContext.current?.close();
      if (recorder.current?.state !== "inactive") recorder.current?.stop();
      stream.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);
  useEffect(() => {
    let active = true;
    fetch("/api/schedules")
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok)
          throw new Error(
            data.error?.message || "Saved schedules are unavailable.",
          );
        if (active) setSaved(data);
      })
      .catch((err) => {
        if (active) setError(err.message);
      })
      .finally(() => {
        if (active) setReady(true);
      });
    return () => {
      active = false;
    };
  }, []);
  async function submit(event: FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (busy || transcribing || sending.current || !text || !ready) return;
    sending.current = true;
    onBusy(true);
    setPlanning(true);
    setError("");
    requestId.current ??= crypto.randomUUID();
    const combined = [...conversation, `User: ${text}`].join("\n");
    try {
      if (combined.length > 4000)
        throw new Error(
          "Please start a shorter request (up to 4,000 characters).",
        );
      const response = await fetch("/api/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: combined,
          context,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          requestId: requestId.current,
        }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(
          data.error?.message ||
            "We couldn’t save your schedule. Please try again.",
        );
      if (data.clarification) {
        onMessages((previous) => [
          ...previous,
          { role: "user", text },
          { role: "assistant", text: data.clarification },
        ]);
        setConversation([
          ...conversation,
          `User: ${text}`,
          `Assistant clarification: ${data.clarification}`,
        ]);
        setDraft("");
        requestId.current = null;
        return;
      }
      const document = data.document as ScheduleDocument;
      const schedule = document.schedules[0],
        run = document.schedule_runs[0];
      const workspace = data.workspace
        ? workspaceSchema.parse(data.workspace)
        : null;
      onSaved(document, workspace);
      setSaved((current) =>
        [
          { id: schedule.id, name: schedule.name, status: run.status },
          ...current.filter((item) => item.id !== schedule.id),
        ].slice(0, 30),
      );
      onMessages((previous) => [
        ...previous,
        { role: "user", text },
        {
          role: "assistant",
          text:
            run.status === "feasible"
              ? `Saved “${schedule.name}”. Review your places and any unscheduled activities.`
              : `Saved “${schedule.name}”, including activities that still need planning. Review the conflicts in the itinerary.`,
        },
      ]);
      setDraft("");
      setConversation([]);
      requestId.current = null;
    } catch (err) {
      // Keep the draft and request id so a retry is idempotent.
      setError(err instanceof Error ? err.message : "Unable to save schedule.");
    } finally {
      sending.current = false;
      setPlanning(false);
      onBusy(false);
    }
  }
  async function transcribe(audio: Blob) {
    setTranscribing(true);
    setError("");
    try {
      const form = new FormData();
      form.append(
        "audio",
        audio,
        `pathwayve-voice.${audio.type.includes("mp4") ? "m4a" : "webm"}`,
      );
      const response = await fetch("/api/transcribe", {
        method: "POST",
        body: form,
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error?.message || "Voice transcription failed.");
      const text = String(data.text || "").trim();
      if (!text) throw new Error("No speech was detected.");
      setDraft((current) => [current.trim(), text].filter(Boolean).join(" "));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Voice transcription failed.",
      );
    } finally {
      setTranscribing(false);
    }
  }
  function stopRecording() {
    const currentRecorder = recorder.current;
    setRecording(false);
    setListening(false);
    if (maxRecordingTimer.current) clearTimeout(maxRecordingTimer.current);
    if (silenceFrame.current) cancelAnimationFrame(silenceFrame.current);
    void audioContext.current?.close();
    audioContext.current = null;
    if (!currentRecorder || currentRecorder.state === "inactive") {
      stream.current?.getTracks().forEach((track) => track.stop());
      stream.current = null;
      recorder.current = null;
      chunks.current = [];
      return;
    }
    try {
      currentRecorder.requestData();
      currentRecorder.stop();
    } catch {
      stream.current?.getTracks().forEach((track) => track.stop());
      stream.current = null;
      recorder.current = null;
      chunks.current = [];
      setError("Could not finish voice input. Try again.");
      return;
    }
    stopFallback.current = setTimeout(() => {
      if (recorder.current === currentRecorder) {
        stream.current?.getTracks().forEach((track) => track.stop());
        stream.current = null;
        recorder.current = null;
        chunks.current = [];
        setError("Could not finish voice input. Try again.");
      }
    }, 3000);
  }
  function monitorSilence(nextStream: MediaStream) {
    const AudioContextClass =
      window.AudioContext ??
      (window as typeof window & { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass({ sampleRate: 16_000 });
    audioContext.current = context;
    const analyser = context.createAnalyser();
    analyser.fftSize = 1024;
    context.createMediaStreamSource(nextStream).connect(analyser);
    const samples = new Uint8Array(analyser.fftSize);
    let heardSpeech = false,
      silentSince = 0;
    const tick = () => {
      analyser.getByteTimeDomainData(samples);
      const volume =
        samples.reduce((sum, sample) => sum + Math.abs(sample - 128), 0) /
        samples.length;
      if (volume > 3) {
        heardSpeech = true;
        silentSince = 0;
      } else if (heardSpeech) silentSince ||= performance.now();

      if (heardSpeech && silentSince && performance.now() - silentSince > 1400)
        stopRecording();
      else silenceFrame.current = requestAnimationFrame(tick);
    };
    silenceFrame.current = requestAnimationFrame(tick);
  }
  async function toggleRecording() {
    if (recording) {
      stopRecording();
      return;
    }
    if (!navigator.mediaDevices || typeof MediaRecorder === "undefined") {
      setError("Voice input is not supported in this browser.");
      return;
    }
    setError("");
    try {
      chunks.current = [];
      const nextStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      stream.current = nextStream;
      const nextRecorder = new MediaRecorder(nextStream);
      recorder.current = nextRecorder;
      nextRecorder.addEventListener("dataavailable", (event) => {
        if (event.data.size) chunks.current.push(event.data);
      });
      nextRecorder.addEventListener("stop", () => {
        if (stopFallback.current) clearTimeout(stopFallback.current);
        if (maxRecordingTimer.current) clearTimeout(maxRecordingTimer.current);
        if (silenceFrame.current) cancelAnimationFrame(silenceFrame.current);
        void audioContext.current?.close();
        audioContext.current = null;
        stream.current?.getTracks().forEach((track) => track.stop());
        stream.current = null;
        recorder.current = null;
        const audio = new Blob(chunks.current, {
          type: nextRecorder.mimeType || "audio/webm",
        });
        chunks.current = [];
        if (unmounted.current) return;
        setRecording(false);
        setListening(false);
        if (audio.size) void transcribe(audio);
        else setError("No audio was captured. Try again.");
      });
      nextRecorder.addEventListener("error", () => {
        stopRecording();
        setError("Voice recording failed. Try again.");
      });
      // A timeslice ensures audio is available even when a browser delays the
      // final dataavailable event until recording has fully stopped.
      nextRecorder.start(250);
      setRecording(true);
      setListening(true);
      monitorSilence(nextStream);
      maxRecordingTimer.current = setTimeout(stopRecording, 20_000);
    } catch (err) {
      setRecording(false);
      setListening(false);
      setError(
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "Allow microphone access to use voice input."
          : "Could not start voice input.",
      );
    }
  }
  async function load(id: string) {
    if (busy || sending.current) return;
    sending.current = true;
    onBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/schedules/${id}`);
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error?.message || "Unable to open this schedule.");
      onSaved(data, null);
      setShowSaved(false);
      onMessages((previous) => [
        ...previous,
        {
          role: "assistant",
          text: "Opened your saved schedule. Travel estimates reflect its last calculation.",
        },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to open schedule.");
    } finally {
      sending.current = false;
      onBusy(false);
    }
  }
  function startOver() {
    setConversation([]);
    setDraft("");
    setError("");
    onMessages(() => []);
    requestId.current = null;
  }
  return (
    <section
      id="trip-chat"
      className={`trip-chat ${compact ? "compact" : ""}`}
      aria-label="Trip chat"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <header>
        <h2>
          <Icon name="sparkle" size={15} />
          Plan with PathWayve
        </h2>
        <div className="chat-header-actions">
          <button
            type="button"
            className="text-button"
            aria-expanded={showSaved}
            onClick={() => setShowSaved(!showSaved)}
          >
            Saved schedules ({saved.length})
          </button>
          {messages.length > 0 && (
            <button
              type="button"
              className="text-button"
              disabled={busy}
              onClick={startOver}
            >
              Start over
            </button>
          )}
          <button
            className="icon-button"
            aria-label="Close chat panel"
            title="Close chat"
            onClick={onClose}
          >
            <Icon name="close" size={16} />
          </button>
        </div>
      </header>
      {showSaved && (
        <div className="saved-schedule-list" aria-label="Saved schedules">
          {saved.length ? (
            saved.map((item) => (
              <button
                type="button"
                key={item.id}
                disabled={busy}
                onClick={() => void load(item.id)}
              >
                <strong>{item.name}</strong>
                <span>{item.status}</span>
              </button>
            ))
          ) : (
            <p>Your saved schedules will appear here in this browser.</p>
          )}
        </div>
      )}
      <div className="chat-messages" role="log" aria-label="Conversation">
        {!messages.length && (
          <p className="chat-empty">
            Describe your day, e.g. “From SFU to downtown tomorrow, coffee and a
            bookstore, home by 6.”
          </p>
        )}
        {messages.map((message, index) => (
          <p className={`chat-message ${message.role}`} key={index}>
            {message.text}
          </p>
        ))}
        {planning && (
          <p className="chat-message assistant pending">Planning…</p>
        )}
        {listening && (
          <p className="chat-message assistant pending">
            Listening… pause or tap the mic to finish.
          </p>
        )}
        {transcribing && (
          <p className="chat-message assistant pending">Transcribing…</p>
        )}
        {error && (
          <p className="chat-error" role="alert">
            {error}
          </p>
        )}
        <div ref={end} />
      </div>
      <form className="chat-composer" onSubmit={submit}>
        <input
          autoFocus
          aria-label="Chat message"
          placeholder="Describe your day"
          maxLength={4000}
          value={draft}
          disabled={busy || transcribing}
          onChange={(event) => {
            setDraft(event.target.value);
            requestId.current = null;
          }}
        />
        <button
          type="button"
          className={`voice-button ${recording ? "recording" : ""}`}
          disabled={busy || transcribing}
          aria-label={recording ? "Stop voice input" : "Start voice input"}
          title={recording ? "Stop voice input" : "Start voice input"}
          aria-pressed={recording}
          onClick={() => void toggleRecording()}
        >
          <Icon name={recording ? "close" : "mic"} size={15} />
        </button>
        <button
          type="submit"
          disabled={!ready || busy || transcribing || !draft.trim()}
          aria-label="Send message"
          title={
            transcribing ? "Transcribing voice" : "Generate and save schedule"
          }
        >
          <Icon name="send" size={15} />
        </button>
      </form>
    </section>
  );
}
