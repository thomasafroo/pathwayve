"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { TripRequest } from "@/types/trip";
import { workspaceSchema, type WorkspaceTrip } from "@/types/workspace";
import type { ScheduleDocument } from "@/types/schedule";
import { Icon } from "./Icon";

export type ChatMessage = { role: "user" | "assistant"; text: string };

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
  const [planning, setPlanning] = useState(false);
  // Clarification turns sent back to Gemini with the next prompt.
  const [conversation, setConversation] = useState<string[]>([]);
  const requestId = useRef<string | null>(null);
  const sending = useRef(false);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" });
  }, [messages, error]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (busy || sending.current || !text) return;
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
      const response = await fetch("/api/schedules/preview", {
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
            "We couldn’t plan your schedule. Please try again.",
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
      onMessages((previous) => [
        ...previous,
        { role: "user", text },
        {
          role: "assistant",
          text:
            run.status === "feasible"
              ? `Planned “${schedule.name}”. Review your itinerary, then press Save schedule to keep it in your account.`
              : `Planned “${schedule.name}”, including activities that still need planning. Review the conflicts before saving.`,
        },
      ]);
      setDraft("");
      setConversation([]);
      requestId.current = null;
    } catch (err) {
      // Keep the draft and request id so a retry is idempotent.
      setError(err instanceof Error ? err.message : "Unable to plan schedule.");
    } finally {
      sending.current = false;
      setPlanning(false);
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
          disabled={busy || !draft.trim()}
          aria-label="Send message"
          title="Generate schedule"
        >
          <Icon name="send" size={15} />
        </button>
      </form>
    </section>
  );
}
