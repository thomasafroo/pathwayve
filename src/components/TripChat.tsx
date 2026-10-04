"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { TripRequest } from "@/types/trip";
import { workspaceSchema, type WorkspaceTrip } from "@/types/workspace";
import type { ScheduleDocument } from "@/types/schedule";
import { Icon } from "./Icon";

import type { PlanningConstraints } from "@/types/planning-constraints";

export type ChatMessage = { role: "user" | "assistant"; text: string };
type SavedSummary = { id: string; name: string; status: string };

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
    persisted?: boolean,
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
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" });
  }, [messages, error]);
  useEffect(() => {
    let active = true;
    const refreshSaved = () =>
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
    void refreshSaved();
    window.addEventListener("schedules-changed", refreshSaved);
    return () => {
      active = false;
      window.removeEventListener("schedules-changed", refreshSaved);
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
      const constraints = getConstraints();
      const snapshot = JSON.stringify(constraints);
      if (snapshot !== constraintSnapshot.current) {
        requestId.current = crypto.randomUUID();
        constraintSnapshot.current = snapshot;
      }
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
          constraints,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          requestId: requestId.current,
        }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(
          data.error?.message ||
            "We couldn’t generate your schedule. Please try again.",
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
              ? `Draft “${schedule.name}” is ready. Review it, then choose Save schedule to keep it.`
              : `Draft “${schedule.name}” includes activities that still need planning. Review the conflicts before saving.`),
        },
      ]);
      setDraft("");
      setConversation([]);
      requestId.current = null;
    } catch (err) {
      // Keep the prompt so the user can retry generation.
      setError(
        err instanceof Error ? err.message : "Unable to generate schedule.",
      );
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
      onSaved(data, null, true);
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
      <p className="hint chat-constraints-note">
        Required and locked stops are protected. Ask to remove optional stops in
        chat. General place requests search within your route radius.
      </p>
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
          title="Generate a draft schedule"
        >
          <Icon name="send" size={15} />
        </button>
      </form>
    </section>
  );
}
