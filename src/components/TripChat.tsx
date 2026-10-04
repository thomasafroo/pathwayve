"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Icon } from "./Icon";

export type TripChatMessage = {
  id: string;
  role: "assistant" | "user";
  text: string;
};

export function TripChat({
  compact,
  messages,
  onSend,
  onClose,
}: {
  compact: boolean;
  messages: TripChatMessage[];
  onSend: (note: string) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState("");
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" });
  }, [messages]);
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
      <div className="chat-messages" role="log" aria-label="Trip messages">
        {!messages.length && (
          <p className="chat-empty">
            Ask about the route, timing, weather, or what to bring.
          </p>
        )}
        {messages.map((message) => (
          <p
            className={`chat-message ${message.role}`}
            key={message.id}
            aria-label={message.role === "user" ? "You" : "Assistant"}
          >
            {message.text}
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
          aria-label="Send message"
          title="Send message"
        >
          <Icon name="send" size={15} />
        </button>
      </form>
    </section>
  );
}
