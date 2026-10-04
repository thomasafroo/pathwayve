"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { TripRequest } from "@/types/trip";
import { workspaceSchema, type WorkspaceTrip } from "@/types/workspace";
import type { ScheduleDocument } from "@/types/schedule";
import { PlanningCompanion } from "./PlanningCompanion";
import { BrandLogo } from "./BrandLogo";
import { Icon } from "./Icon";

import type { PlanningConstraints } from "@/types/planning-constraints";

export type ChatMessage = { role: "user" | "assistant"; text: string };

export function TripChat({
  compact,
  messages,
  onMessages,
  context,
  getConstraints,
  busy,
  onBusy,
  onSaved,
  onClose,
}: {
  compact: boolean;
  messages: ChatMessage[];
  onMessages: (update: (previous: ChatMessage[]) => ChatMessage[]) => void;
  context: TripRequest | null;
  getConstraints: () => PlanningConstraints | null;
  busy: boolean;
  onBusy: (busy: boolean) => void;
  onSaved: (
    document: ScheduleDocument,
    workspace: WorkspaceTrip | null,
  ) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [newTrip, setNewTrip] = useState(false);
  const [error, setError] = useState("");
  const [planning, setPlanning] = useState(false);
  const [planOutcome, setPlanOutcome] = useState<"ready" | "review" | null>(
    null,
  );
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [listening, setListening] = useState(false);
  // Clarification turns sent back to Gemini with the next prompt.
  const [conversation, setConversation] = useState<string[]>([]);
  const requestId = useRef<string | null>(null);
  const sending = useRef(false);
  const constraintSnapshot = useRef("");
  const composer = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const input = composer.current;
    if (!input) return;
    const resize = () => {
      input.style.height = "auto";
      input.style.height = `${Math.min(input.scrollHeight + 2, 160)}px`;
    };
    resize();
    const observer = new ResizeObserver(() => {
      if (input.clientWidth !== width) {
        width = input.clientWidth;
        resize();
      }
    });
    let width = input.clientWidth;
    observer.observe(input);
    return () => observer.disconnect();
  }, [draft, compact]);
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
  }, [messages, error, planning, planOutcome]);
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
  async function submit(event: FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (busy || transcribing || sending.current || !text) return;
    sending.current = true;
    onBusy(true);
    setPlanning(true);
    setPlanOutcome(null);
    setError("");
    requestId.current ??= crypto.randomUUID();
    // A complete journey description replaces the previous trip. Short follow-ups
    // continue editing it; the checkbox also handles less explicit new requests.
    const newDescription =
      /\b(?:heading|going|travel(?:ling|ing)?|trip)\s+from\b[\s\S]+?\bto\s+\S/i.test(
        text,
      ) || /^from\s+.+?\s+to\s+\S/i.test(text);
    const replaceTrip = newTrip || newDescription;
    const combined = [
      ...(newDescription ? [] : conversation),
      `User: ${text}`,
    ].join("\n");
    try {
      const currentConstraints = getConstraints();
      const constraints =
        replaceTrip && currentConstraints
          ? {
              ...currentConstraints,
              selectedStops: [],
              origin: null,
              destination: null,
              startTime: undefined,
              endTime: undefined,
            }
          : currentConstraints;
      const snapshot = JSON.stringify(constraints);
      if (snapshot !== constraintSnapshot.current) {
        requestId.current = crypto.randomUUID();
        constraintSnapshot.current = snapshot;
      }
      if (combined.length > 4000)
        throw new Error(
          "Please start a shorter request (up to 4,000 characters).",
        );
      const response = await fetch("/api/schedules/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: combined,
          context: replaceTrip ? null : context,
          constraints,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          requestId: requestId.current,
        }),
      });
      const data = await response.json();
      if (unmounted.current) return;
      if (!response.ok)
        throw new Error(
          data.error?.message ||
            "We couldn’t plan your schedule. Please try again.",
        );
      if (data.clarification) {
        setNewTrip(replaceTrip);
        onMessages((previous) => [
          ...previous,
          { role: "user", text },
          { role: "assistant", text: data.clarification },
        ]);
        setConversation([
          ...(newDescription ? [] : conversation),
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
      setPlanOutcome(run.status === "feasible" ? "ready" : "review");
      const resultingPlaceIds = new Set(
        document.schedule_items.map((item) => item.place_id).filter(Boolean),
      );
      const removed = (constraints?.selectedStops ?? []).filter(
        (stop) => !resultingPlaceIds.has(stop.id),
      );
      const changeSummary = removed.length
        ? `Removed ${removed.map((stop) => stop.name).join(", ")} from this itinerary. `
        : "";
      onMessages((previous) => [
        ...previous,
        { role: "user", text },
        {
          role: "assistant",
          text:
            changeSummary +
            (run.status === "feasible"
              ? `Planned “${schedule.name}”. Review your itinerary, then press Save schedule to keep it in your account.`
              : `Planned “${schedule.name}”, including activities that still need planning. Review the conflicts before saving.`),
        },
      ]);
      setDraft("");
      setNewTrip(false);
      setConversation([]);
      requestId.current = null;
    } catch (err) {
      if (unmounted.current) return;
      // Keep the draft and request id so a retry is idempotent.
      setError(err instanceof Error ? err.message : "Unable to plan schedule.");
    } finally {
      sending.current = false;
      setPlanning(false);
      if (!unmounted.current) onBusy(false);
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
  function startOver() {
    setPlanOutcome(null);
    setConversation([]);
    setDraft("");
    setError("");
    onMessages(() => []);
    requestId.current = null;
  }
  return (
    <section
      id="trip-chat"
      className={`trip-chat ${compact ? "compact" : ""} ${planning || planOutcome ? "has-companion" : ""}`}
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
          <BrandLogo compact className="chat-brand-mark" />
          Plan with PathWayve
        </h2>
        <div className="chat-header-actions">
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
        {(planning || planOutcome) && (
          <PlanningCompanion phase={planning ? "planning" : planOutcome!} />
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
      <p className="hint chat-constraints-note">
        Required and locked stops are protected. Ask to remove optional stops in
        chat. General place requests search within your route radius.
      </p>
      <div className="chat-mode-bar">
        <span>
          {newTrip
            ? "Fresh start · replaces the current trip"
            : "Keep building on your current trip"}
        </span>
        <label className="chat-new-trip">
          <input
            type="checkbox"
            checked={newTrip}
            disabled={busy}
            onChange={(event) => {
              setNewTrip(event.target.checked);
              setConversation([]);
            }}
          />
          <span className="chat-mode-switch" aria-hidden="true" />
          Start a new trip
        </label>
      </div>
      <form className="chat-composer" onSubmit={submit}>
        <textarea
          ref={composer}
          rows={1}
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
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
          disabled={busy || transcribing || !draft.trim()}
          aria-label="Send message"
          title={transcribing ? "Transcribing voice" : "Generate schedule"}
        >
          <Icon name="send" size={15} />
        </button>
      </form>
    </section>
  );
}
