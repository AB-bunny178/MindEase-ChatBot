import React, { useState, useEffect, useRef } from "react";
import { Send, Mic, MicOff } from "lucide-react";

/**
 * Improved Chat UI:
 * - auto-scrolls to bottom
 * - loading / sending state
 * - prevent duplicate quick sends
 * - Enter to send, Shift+Enter newline
 * - sticky input on mobile
 * - simple typing indicator
 *
 * Uses REACT_APP_API_URL env var for backend:
 * const API = process.env.REACT_APP_API_URL || "";
 */

export default function App() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([]); // { role, text, mood, ts }
  const [listening, setListening] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [sending, setSending] = useState(false);
  const [typing, setTyping] = useState(false);

  const recognitionRef = useRef(null);
  const messagesRef = useRef(null); // container to scroll
  const lastSentRef = useRef(""); // prevent quick duplicates

  const API = process.env.REACT_APP_API_URL || ""; // <-- env-aware

  // Initialize speech recognition (if available)
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const rec = new SpeechRecognition();
    rec.lang = "en-US";
    rec.interimResults = false;
    rec.onresult = (e) => {
      const text = e.results[0][0].transcript;
      setInput(text);
      handleSend(text, true);
    };
    rec.onend = () => setListening(false);
    recognitionRef.current = rec;
  }, []);

  // auto-scroll when messages change
  useEffect(() => {
    if (!messagesRef.current) return;
    // small timeout to allow DOM update
    const t = setTimeout(() => {
      messagesRef.current.scrollTo({
        top: messagesRef.current.scrollHeight,
        behavior: "smooth",
      });
    }, 50);
    return () => clearTimeout(t);
  }, [messages, typing]);

  // utility to create message object
  const mkMsg = (role, text, mood) => ({
    role,
    text,
    mood,
    ts: new Date().toISOString(),
  });

  // Start voice listening
  function startListening() {
    if (!recognitionRef.current) {
      alert("Speech recognition not supported in this browser.");
      return;
    }
    try {
      setListening(true);
      recognitionRef.current.start();
    } catch (e) {
      setListening(false);
      console.warn("speech start error", e);
    }
  }

  // core send logic, used by button, enter, and voice
  async function handleSend(raw, isVoice = false) {
    const msg = (raw || "").trim();
    if (!msg) return;
    if (sending) return; // avoid concurrent sends
    if (lastSentRef.current && lastSentRef.current === msg) {
      // quick duplicate prevention
      // but still allow after a short cooldown
      console.log("duplicate prevented");
      return;
    }

    lastSentRef.current = msg;
    setSending(true);
    setTyping(true);

    // add user message immediately
    setMessages((prev) => [...prev, mkMsg("user", msg)]);

    // CLEAR INPUT IMMEDIATELY so the input bar empties right away
    setInput("");

    try {
      const url = API ? `${API}/chat` : `http://localhost:5000/chat`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg, voice: isVoice }),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = await res.json();

      // server may return { reply, mood, crisis }
      const botText = data.reply ?? data.message?.text ?? "No reply.";
      const mood = data.mood ?? data.message?.mood;

      // show bot typing briefly for smoothness
      setTyping(true);
      // small delay to mimic natural typing (optional)
      await new Promise((r) => setTimeout(r, 250));

      setMessages((prev) => [...prev, mkMsg("bot", botText, mood)]);

      // speak out if voice was used and enabled
      if (isVoice && voiceEnabled && botText) {
        const u = new SpeechSynthesisUtterance(botText);
        u.lang = "en-US";
        window.speechSynthesis.speak(u);
      }
    } catch (err) {
      console.error("send error", err);
      setMessages((prev) => [...prev, mkMsg("bot", "❌ Unable to contact server.")]);
    } finally {
      setSending(false);
      setTyping(false);
      // soft cooldown to allow same message later
      setTimeout(() => (lastSentRef.current = ""), 1200);
    }
  }

  // handle Enter key (send) / Shift+Enter newline
  const onKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend(input, false);
    }
  };

  return (
    <div
      className="min-h-screen flex flex-col items-center px-4 py-6"
      style={{ background: "linear-gradient(180deg,#C9A7FF 0%, #F3B2D9 100%)" }}
    >
      <h1 className="text-3xl md:text-4xl font-extrabold mb-6 text-white drop-shadow-md">
        MindEase — Therapist Bot
      </h1>

      <div className="w-full max-w-lg">
        {/* Controls */}
        <div className="flex items-center justify-between mb-4 gap-3">
          <div className="flex items-center gap-3">
            <button
              onClick={startListening}
              disabled={listening}
              className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/20 backdrop-blur-lg text-white shadow-sm hover:bg-white/30 transition"
            >
              {listening ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
              <span className="text-sm">Speak</span>
            </button>

            <label className="flex items-center gap-2 text-white/90 select-none">
              <input
                type="checkbox"
                checked={voiceEnabled}
                onChange={(e) => setVoiceEnabled(e.target.checked)}
                className="accent-purple-600"
              />
              <span className="text-sm">Voice Replies</span>
            </label>
          </div>

          <div className="text-sm text-white/90">
            {sending ? "Sending..." : null}
          </div>
        </div>

        {/* Conversation container */}
        <div
          ref={messagesRef}
          className="bg-white/20 rounded-2xl backdrop-blur-xl shadow-lg p-4 flex flex-col gap-3 overflow-y-auto"
          style={{ minHeight: 300, maxHeight: "60vh" }}
        >
          {messages.length === 0 && (
            <div className="text-white/80 italic">No messages yet. Say hi 👋</div>
          )}

          {messages.map((m, idx) => (
            <div
              key={`${m.ts}-${idx}`}
              className={`p-3 rounded-2xl max-w-[85%] ${m.role === "bot" ? "bg-white/40 text-purple-900 self-start" : "bg-white/70 text-blue-900 self-end"}`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <strong className="capitalize text-sm">{m.role}</strong>
                <span className="text-xs text-black/60">{new Date(m.ts).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
              </div>
              <div className="mt-1 whitespace-pre-wrap">{m.text}</div>
              {m.mood !== undefined && <div className="text-xs opacity-60 mt-2">Mood score: {m.mood}</div>}
            </div>
          ))}

          {/* typing indicator */}
          {typing && (
            <div className="p-3 rounded-2xl max-w-[55%] bg-white/40 text-purple-900 self-start">
              <div className="animate-pulse text-sm">MindEase is typing…</div>
            </div>
          )}
        </div>

        {/* Sticky input bar */}
        <div className="mt-4 w-full">
          <div className="w-full bg-white/30 rounded-full backdrop-blur-xl p-2 shadow-md flex items-center gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Type your message..."
              className="flex-1 resize-none bg-transparent outline-none text-white placeholder-white/70 px-3 py-2 max-h-40"
              rows={1}
            />
            <button
              onClick={() => handleSend(input, false)}
              disabled={sending || !input.trim()}
              className="w-12 h-12 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 flex items-center justify-center text-white shadow-md hover:opacity-90 transition disabled:opacity-50"
              title="Send"
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
