"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { TripRequest } from "@/types/trip";
import { workspaceSchema, type WorkspaceTrip } from "@/types/workspace";
import type { ScheduleDocument } from "@/types/schedule";
import { Icon } from "./Icon";

type SavedSummary = { id: string; name: string; status: string };
export function ChatPrompt({
  context,
  busy,
  onBusy,
  onSaved,
}: {
  context: TripRequest | null;
  busy: boolean;
  onBusy: (busy: boolean) => void;
  onSaved: (
    document: ScheduleDocument,
    workspace: WorkspaceTrip | null,
  ) => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [reply, setReply] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<SavedSummary[]>([]);
  const [showSaved, setShowSaved] = useState(false);
  const [ready, setReady] = useState(false);
  const [conversation, setConversation] = useState<string[]>([]);
  const requestId = useRef<string | null>(null);
  const sending = useRef(false);
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
    if (busy || sending.current || !prompt.trim() || !ready) return;
    sending.current = true;
    onBusy(true);
    setError("");
    setReply("");
    requestId.current ??= crypto.randomUUID();
    const combined = [...conversation, `User: ${prompt.trim()}`].join("\n");
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
        setReply(data.clarification);
        setConversation([
          ...conversation,
          `User: ${prompt.trim()}`,
          `Assistant clarification: ${data.clarification}`,
        ]);
        setPrompt("");
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
      setReply(
        run.status === "feasible"
          ? `Saved “${schedule.name}”. Review your places and any unscheduled activities.`
          : `Saved “${schedule.name}”, including activities that still need planning. Review the conflicts below.`,
      );
      setPrompt("");
      setConversation([]);
      requestId.current = null;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save schedule.");
    } finally {
      sending.current = false;
      onBusy(false);
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
      setReply(
        "Opened your saved schedule. Travel estimates reflect its last calculation.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to open schedule.");
    } finally {
      sending.current = false;
      onBusy(false);
    }
  }
  return (
    <section className="chat-dock" aria-label="AI schedule planner">
      <div className="chat-dock-heading">
        <span>
          <Icon name="sparkle" size={17} />
          Plan with PathWayve
        </span>
        <button
          type="button"
          className="text-button"
          aria-expanded={showSaved}
          onClick={() => setShowSaved(!showSaved)}
        >
          Saved schedules ({saved.length})
        </button>
      </div>
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
      {reply && (
        <p className="chat-reply" aria-live="polite">
          {reply}
        </p>
      )}
      {error && (
        <p className="chat-error" role="alert">
          {error}
        </p>
      )}
      <form onSubmit={submit} className="chat-prompt-form">
        <label className="sr-only" htmlFor="schedule-prompt">
          Describe your day
        </label>
        <textarea
          id="schedule-prompt"
          value={prompt}
          maxLength={4000}
          rows={2}
          disabled={busy}
          placeholder="From SFU to downtown tomorrow, coffee and a bookstore, home by 6…"
          onChange={(event) => {
            setPrompt(event.target.value);
            requestId.current = null;
          }}
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
        />
        <button
          className="primary"
          disabled={!ready || busy || !prompt.trim()}
          type="submit"
          aria-label="Generate and save schedule"
        >
          {busy ? "Planning…" : "Plan & save"}
          <Icon name="arrow" size={18} />
        </button>
      </form>
      <div className="chat-footnote">
        <span>
          Creates a new saved schedule · Enter to send · Shift+Enter for a new
          line
        </span>
        {conversation.length > 0 && (
          <button
            type="button"
            className="text-button"
            disabled={busy}
            onClick={() => {
              setConversation([]);
              setReply("");
              setPrompt("");
              requestId.current = null;
            }}
          >
            Start over
          </button>
        )}
      </div>
    </section>
  );
}
