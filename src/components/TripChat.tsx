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
  // Clarification turns sent back to Gemini with the next prompt.
  const [conversation, setConversation] = useState<string[]>([]);
  const requestId = useRef<string | null>(null);
  const sending = useRef(false);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" });
  }, [messages, error]);
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
    if (busy || sending.current || !text || !ready) return;
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
          disabled={busy}
          onChange={(event) => {
            setDraft(event.target.value);
            requestId.current = null;
          }}
        />
        <button
          type="submit"
          disabled={!ready || busy || !draft.trim()}
          aria-label="Send message"
          title="Generate and save schedule"
        >
          <Icon name="send" size={15} />
        </button>
      </form>
    </section>
  );
}
