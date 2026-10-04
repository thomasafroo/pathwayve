"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Icon } from "./Icon";

export function TripChat({
  compact,
  notes,
  onSend,
  onClose,
}: {
  compact: boolean;
  notes: string[];
  onSend: (note: string) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState("");
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" });
  }, [notes]);
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!draft.trim()) return;
    onSend(draft.trim());
    setDraft("");
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
        <h2>Chat</h2>
        <button
          className="icon-button"
          aria-label="Close chat panel"
          title="Close chat"
          onClick={onClose}
        >
          <Icon name="close" size={16} />
        </button>
      </header>
      <div className="chat-messages" role="log" aria-label="Trip notes">
        {!notes.length && (
          <p className="chat-empty">
            What would you like to remember for this trip?
          </p>
        )}
        {notes.map((note, index) => (
          <p className="chat-message" key={index}>
            {note}
          </p>
        ))}
        <div ref={end} />
      </div>
      <form className="chat-composer" onSubmit={submit}>
        <input
          autoFocus
          aria-label="Chat message"
          placeholder="Type a message"
          maxLength={1000}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
        <button
          type="submit"
          disabled={!draft.trim()}
          aria-label="Save message"
          title="Save message"
        >
          <Icon name="send" size={15} />
        </button>
      </form>
    </section>
  );
}
