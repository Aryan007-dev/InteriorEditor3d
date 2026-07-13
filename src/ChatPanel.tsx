import { useState } from "react";
import { sendMessage, type ChatMessage } from "./ai/chat";
import "./chat.css";

export default function ChatPanel() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const send = async () => {
    const userText = text.trim();
    if (!userText || busy) return;
    setBusy(true);
    setText("");
    try {
      const updated = await sendMessage(messages, userText);
      setMessages(updated);
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside className="chat-panel">
      <h3>AI Assistant</h3>
      <div className="chat-messages">
        {messages
          .filter((m) => m.role !== "system")
          .map((m, i) => (
            <div key={i} className={`chat-msg chat-msg--${m.role}`}>
              <span className="chat-msg__role">{m.role}</span>
              <span className="chat-msg__text">{m.content}</span>
            </div>
          ))}
      </div>
      <div className="chat-input">
        <input
          value={text}
          placeholder="e.g. Add a sofa at [2,0,1]"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") send();
          }}
        />
        <button type="button" onClick={send} disabled={busy}>
          {busy ? "…" : "Send"}
        </button>
      </div>
    </aside>
  );
}
