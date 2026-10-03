"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { respond } from "../lib/jev-chat/engine";
import { hometownPlan } from "../lib/jev-chat/hometown";
import { stateCapitalPlan } from "../lib/jev-chat/state-capitals";
import { readChatStorage, serializeChats } from "../lib/jev-chat/storage";
import type { EngineResult } from "../lib/jev-chat/types";
import {
  personalityIds,
  personalityLabels,
  type Personality,
} from "../lib/jev-chat/personality";
import { JevResponseDetails } from "./JevResponseDetails";
import { ConfidenceBar } from "./ConfidenceBar";
import { JevChatProse } from "./JevChatProse";
import {
  ArrowUp,
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronRight,
  Copy,
  Download,
  FileText,
  History,
  Info,
  MessageSquare,
  Plus,
  ShieldCheck,
  SlidersHorizontal,
  Square,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import { API_KEY_EVENT, apiKeyRevision } from "../lib/api-key";
import { download, errorMessage, percent, runJev } from "../lib/client";
import {
  CHAT_STORAGE,
  chatCandidates,
  chatPayload,
  demoDecision,
  newChat,
  readChatDecision,
  sampleNotes,
  spaces,
  type ChatMessage,
  type Decision,
  type ChatSession,
  type ChatSpace,
} from "../lib/jevChat";

export function JevChatLab() {
  const [chats, setChats] = useState<ChatSession[]>([]);
  const [activeId, setActiveId] = useState("");
  const [ready, setReady] = useState(false);
  const [panel, setPanel] = useState<"guide" | "notes" | null>(null);
  const [history, setHistory] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("Preparing a response…");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [storageIssue, setStorageIssue] = useState("");
  const [recoveryRaw, setRecoveryRaw] = useState<string | null>(null);
  const [copied, setCopied] = useState("");
  const controller = useRef<AbortController | null>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const historyRef = useRef<HTMLElement>(null);
  const closeFocus = useRef<HTMLElement | null>(null);
  const chat = chats.find((c) => c.id === activeId) ?? chats[0];
  const last = chat?.messages.at(-1);
  const pending = last?.role === "user";
  const full = (chat?.messages.length ?? 0) >= 40;

  useEffect(() => {
    let mounted = true;
    void (async () => {
      let saved: ChatSession[] = [];
      try {
        const raw = localStorage.getItem(CHAT_STORAGE);
        const restored = await readChatStorage(raw);
        if (!mounted) return;
        saved = restored.chats;
        if (restored.issue) {
          setRecoveryRaw(raw ?? "");
          setStorageIssue(restored.issue);
        }
      } catch {
        if (!mounted) return;
        setRecoveryRaw("");
        setStorageIssue(
          "Browser storage could not be read. Automatic saving is paused to preserve existing history.",
        );
      }
      if (!mounted) return;
      const initial = saved.length ? saved : [newChat()];
      setChats(initial);
      setActiveId(initial[0].id);
      setReady(true);
    })();
    const stop = (event: Event) => {
      if (
        event instanceof StorageEvent &&
        event.key !== null &&
        event.key !== "typesafe-api-key-revision" &&
        event.key !== "typesafe-api-key-override"
      )
        return;
      if (controller.current) {
        controller.current.abort();
        setNotice(
          "Request stopped because API key settings changed. Retry with the current key.",
        );
      }
    };
    window.addEventListener(API_KEY_EVENT, stop);
    window.addEventListener("storage", stop);
    return () => {
      mounted = false;
      controller.current?.abort();
      window.removeEventListener(API_KEY_EVENT, stop);
      window.removeEventListener("storage", stop);
    };
  }, []);
  useEffect(() => {
    if (!ready || recoveryRaw !== null) return;
    try {
      localStorage.setItem(CHAT_STORAGE, serializeChats(chats));
      setStorageIssue("");
    } catch (cause) {
      setStorageIssue(
        cause instanceof Error && cause.message.startsWith("Chat storage limit")
          ? cause.message
          : "Browser storage is unavailable or full. Export your conversation to keep a copy. Your last saved history is preserved.",
      );
    }
  }, [chats, ready, recoveryRaw]);
  useEffect(() => {
    scroll.current?.scrollTo({
      top: chat?.messages.length ? scroll.current.scrollHeight : 0,
      behavior: "instant",
    });
  }, [activeId, chat?.messages.length, busy]);
  useEffect(() => {
    if (!panel && !history) return;
    closeFocus.current = document.activeElement as HTMLElement;
    const container = panel ? panelRef.current : historyRef.current;
    container?.querySelector<HTMLButtonElement>("[data-close]")?.focus();
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPanel(null);
        setHistory(false);
      }
      if (
        event.key !== "Tab" ||
        !window.matchMedia("(max-width: 1000px)").matches
      )
        return;
      const controls = Array.from(
        container?.querySelectorAll<HTMLElement>(
          "button, a[href], textarea, select, summary",
        ) ?? [],
      ).filter(
        (el) =>
          el.getClientRects().length > 0 && !(el as HTMLButtonElement).disabled,
      );
      if (!controls.length) return;
      if (event.shiftKey && document.activeElement === controls[0]) {
        event.preventDefault();
        controls.at(-1)?.focus();
      } else if (
        !event.shiftKey &&
        document.activeElement === controls.at(-1)
      ) {
        event.preventDefault();
        controls[0].focus();
      }
    };
    window.addEventListener("keydown", keyboard);
    return () => {
      window.removeEventListener("keydown", keyboard);
      closeFocus.current?.focus();
    };
  }, [panel, history]);
  function patch(update: Partial<ChatSession>) {
    setChats((all) =>
      all.map((c) => (c.id === chat?.id ? { ...c, ...update } : c)),
    );
  }
  function create() {
    if (busy) return;
    if (chats.length >= 12) {
      setNotice(
        "You have 12 saved chats. Export and delete one before starting another.",
      );
      return;
    }
    const next = newChat(chat?.space, chat?.mode);
    next.engine = chat?.engine ?? "compose";
    next.style = chat?.style ?? "balanced";
    next.personality = chat?.personality ?? "default";
    setChats((all) => [next, ...all]);
    setActiveId(next.id);
    setHistory(false);
    setError("");
    setNotice("");
    composer.current?.focus();
  }
  function selectSpace(space: ChatSpace) {
    patch({ space, notes: space === "notes" ? sampleNotes : "" });
    if (space === "notes") setPanel("notes");
  }
  async function send(retry = false) {
    if (
      !chat ||
      controller.current ||
      full ||
      (!retry && (!chat.draft.trim() || pending))
    )
      return;
    const messages: ChatMessage[] = retry
      ? chat.messages
      : [
          ...chat.messages,
          { id: crypto.randomUUID(), role: "user", text: chat.draft.trim() },
        ];
    let candidates, payload;
    try {
      candidates = chatCandidates(chat.space, chat.notes);
      payload = chatPayload(
        messages.map(({ role, text }) => ({ role, text })),
        candidates,
      );
    } catch (e) {
      setError(errorMessage(e));
      return;
    }
    const abort = new AbortController();
    controller.current = abort;
    const revision = apiKeyRevision();
    const id = chat.id;
    setBusy(true);
    setError("");
    setNotice("");
    if (!retry)
      patch({
        messages,
        draft: "",
        title: chat.messages.length
          ? chat.title
          : chat.draft.trim().slice(0, 60),
      });
    try {
      let engineResult: EngineResult | undefined;
      let result: Decision | undefined;
      if (
        chat.engine === "compose" ||
        hometownPlan(messages.at(-1)!.text) ||
        stateCapitalPlan(messages.at(-1)!.text)
      ) {
        engineResult = await respond(
          {
            messages: messages.map((m) => ({
              role: m.role,
              text: m.text,
              ...(m.engineResult?.story ? { story: m.engineResult.story } : {}),
              ...(m.engineResult
                ? { options: m.engineResult.options }
                : m.decision
                  ? { options: m.decision.prompts }
                  : {}),
            })),
            topic: chat.space,
            notes: chat.notes,
            mode: chat.mode,
            style: chat.style ?? "balanced",
            personality: chat.personality ?? "default",
          },
          {
            transport: runJev,
            signal: abort.signal,
            onProgress: (event) => setProgress(event.label),
          },
        );
      } else
        result =
          chat.mode === "demo"
            ? demoDecision(messages.at(-1)!.text, candidates)
            : readChatDecision(await runJev(payload, abort.signal), candidates);
      if (abort.signal.aborted || revision !== apiKeyRevision()) return;
      setChats((all) =>
        all.map((c) =>
          c.id === id
            ? {
                ...c,
                ...(engineResult?.story
                  ? { style: engineResult.story.style }
                  : {}),
                messages: [
                  ...messages,
                  {
                    id: crypto.randomUUID(),
                    role: "assistant",
                    text: engineResult?.text ?? result!.text,
                    ...(engineResult ? { engineResult } : { decision: result }),
                  },
                ],
              }
            : c,
        ),
      );
    } catch (e) {
      if (!abort.signal.aborted && revision === apiKeyRevision())
        setError(errorMessage(e));
    } finally {
      if (controller.current === abort) {
        controller.current = null;
        setBusy(false);
        composer.current?.focus();
      }
    }
  }
  async function copy(message: ChatMessage) {
    try {
      await navigator.clipboard.writeText(message.text);
      setCopied(message.id);
    } catch {
      setNotice(
        "Clipboard access is unavailable. Select the reply text to copy it.",
      );
    }
  }
  function editPending() {
    if (!chat || !pending || busy) return;
    patch({ messages: chat.messages.slice(0, -1), draft: last.text });
    setError("");
    setNotice("");
    composer.current?.focus();
  }
  if (!chat)
    return (
      <div className="jev-chat-studio" aria-busy="true">
        Loading your conversations…
      </div>
    );
  const modeLabel = chat.mode === "demo" ? "Local demo" : "Live Jev";
  const suggested =
    last?.engineResult?.options ?? last?.decision?.prompts ?? [];
  return (
    <div className="jev-chat-studio">
      <header className="jc-toolbar">
        <div className="jc-identity">
          <span className="jc-mark">
            <MessageSquare size={18} />
          </span>
          <div>
            <h1>Jev Chat</h1>
            <span>Conversation, by choice.</span>
          </div>
        </div>
        <div className="jc-toolbar-middle">
          <span className="jc-dot" />
          Jev only
          <span className="jc-divider" />
          Jev + scripted language
        </div>
        <div className="jc-tools">
          <button
            className="jc-icon jc-history-toggle"
            aria-label="Conversation history"
            onClick={() => {
              setHistory(true);
              setPanel(null);
            }}
          >
            <History size={18} />
          </button>
          <button
            className="jc-guide-button"
            aria-expanded={panel === "guide"}
            onClick={() => {
              setPanel(panel === "guide" ? null : "guide");
              setHistory(false);
            }}
          >
            <BookOpen size={16} />
            <span>Guide</span>
          </button>
        </div>
      </header>
      <div className="jc-workspace">
        {(history || panel) && (
          <button
            className="jc-backdrop"
            aria-label="Close side panel"
            onClick={() => {
              setPanel(null);
              setHistory(false);
            }}
          />
        )}
        <aside
          ref={historyRef}
          className={`jc-history ${history ? "jc-history-open" : ""}`}
          aria-label="Saved conversations"
        >
          <div className="jc-rail-heading">
            <span>YOUR SPACE</span>
            <button
              className="jc-icon jc-mobile-close"
              data-close
              aria-label="Close history"
              onClick={() => setHistory(false)}
            >
              <X size={16} />
            </button>
          </div>
          <button className="jc-new" disabled={busy} onClick={create}>
            <Plus size={17} />
            New conversation
          </button>
          <div className="jc-history-list">
            {chats.map((c) => (
              <button
                key={c.id}
                disabled={busy}
                className={`jc-thread ${c.id === chat.id ? "is-active" : ""}`}
                aria-current={c.id === chat.id ? "true" : undefined}
                onClick={() => {
                  setActiveId(c.id);
                  setError("");
                  setNotice("");
                  setHistory(false);
                  setPanel(null);
                }}
              >
                <MessageSquare size={15} />
                <span>
                  <strong>{c.title}</strong>
                  <small>
                    {spaces[c.space].title} ·{" "}
                    {c.mode === "demo" ? "Demo" : "Live"}
                  </small>
                </span>
              </button>
            ))}
          </div>
          <div className="jc-rail-note">
            <ShieldCheck size={19} />
            <strong>A different kind of chat</strong>
            <p>
              Every reply has an origin. Open a decision to see what was
              selected.
            </p>
            <button
              onClick={() => {
                setPanel("guide");
                setHistory(false);
              }}
            >
              Explore the guide <ArrowUpRight size={14} />
            </button>
          </div>
          <div className="jc-storage-note">
            Saved on this device · {chats.length}/12
          </div>
          <Link className="jc-back" href="/">
            ← All playgrounds
          </Link>
        </aside>
        <section className="jc-conversation" aria-label="Chat workspace">
          <div className="jc-threadbar">
            <div>
              <span className={`jc-mode ${chat.mode}`}>{modeLabel}</span>
              <span className="jc-topic">{spaces[chat.space].title}</span>
            </div>
            <div className="jc-tools">
              <button
                className="jc-icon"
                aria-label="Edit source notes"
                title="Source notes"
                disabled={chat.space !== "notes"}
                onClick={() => setPanel(panel === "notes" ? null : "notes")}
              >
                <FileText size={16} />
              </button>
              <button
                className="jc-icon"
                aria-label="Export conversation"
                title="Export conversation"
                disabled={!chat.messages.length || busy}
                onClick={() =>
                  download("jev-chat.json", {
                    format: "jev-chat-v1",
                    ...chat,
                    draft: "",
                    boundary:
                      "Jev and scripted composition. Sources, authored content and fiction have distinct provenance. Hashes verify integrity, not factual correctness.",
                  })
                }
              >
                <Download size={16} />
              </button>
              <button
                className="jc-icon"
                aria-label="Delete conversation"
                title="Delete conversation"
                disabled={busy}
                onClick={() => {
                  if (
                    !window.confirm(
                      "Delete this conversation from this browser? Export it first if you need a copy.",
                    )
                  )
                    return;
                  const remaining = chats.filter((c) => c.id !== chat.id);
                  const next = remaining.length ? remaining : [newChat()];
                  setChats(next);
                  setActiveId(next[0].id);
                  setError("");
                  setNotice("");
                }}
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
          <div className="jc-engine-bar">
            <label>
              Engine{" "}
              <select
                aria-label="Response engine"
                value={chat.engine ?? "baseline"}
                disabled={busy || chat.messages.length > 0}
                onChange={(e) =>
                  patch({ engine: e.target.value as "compose" | "baseline" })
                }
              >
                <option value="compose">Compose</option>
                <option value="baseline">Baseline</option>
              </select>
            </label>
            {chat.engine === "compose" && (
              <>
                <label>
                  Detail{" "}
                  <select
                    aria-label="Response detail"
                    value={chat.style ?? "balanced"}
                    disabled={busy}
                    onChange={(e) =>
                      patch({
                        style: e.target.value as
                          "concise" | "balanced" | "detailed",
                      })
                    }
                  >
                    <option value="concise">Concise</option>
                    <option value="balanced">Balanced</option>
                    <option value="detailed">Detailed</option>
                  </select>
                </label>
                <label>
                  Personality{" "}
                  <select
                    aria-label="Chat personality"
                    value={chat.personality ?? "default"}
                    disabled={busy}
                    onChange={(e) =>
                      patch({ personality: e.target.value as Personality })
                    }
                  >
                    {personalityIds.map((id) => (
                      <option key={id} value={id}>
                        {personalityLabels[id]}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}
          </div>
          <div className="jc-scroll" ref={scroll}>
            {!chat.messages.length ? (
              <div className="jc-welcome">
                <div className="jc-orbit" aria-hidden="true">
                  <MessageSquare size={32} />
                  <span />
                  <i />
                </div>
                <div className="jc-eyebrow">LANGUAGE IN. DECISIONS OUT.</div>
                <h2>
                  A conversation with context.
                  <br />
                  <em>An answer with an origin.</em>
                </h2>
                <p className="jc-intro">
                  A conversation shaped by Jev and scripted language.
                  <br />
                  Explore an idea. Follow the evidence. Inspect the composition.
                </p>
                <div
                  className="jc-space-picker"
                  aria-label="Conversation topic"
                >
                  {(Object.keys(spaces) as ChatSpace[]).map((space) => (
                    <button
                      key={space}
                      aria-pressed={chat.space === space}
                      onClick={() => selectSpace(space)}
                    >
                      {space === "guide" ? (
                        <Zap size={15} />
                      ) : space === "support" ? (
                        <MessageSquare size={15} />
                      ) : (
                        <FileText size={15} />
                      )}{" "}
                      {spaces[space].title}
                    </button>
                  ))}
                </div>
                <p className="jc-topic-description">
                  {spaces[chat.space].description}
                </p>
                <div className="jc-starters">
                  {spaces[chat.space].prompts.map((p, i) => (
                    <button
                      key={p}
                      onClick={() => {
                        patch({ draft: p });
                        composer.current?.focus();
                      }}
                    >
                      <span className="jc-starter-label">
                        {["GET STARTED", "GO DEEPER", "EXPLORE"][i]}
                      </span>
                      <span>{p}</span>
                      <ArrowUpRight size={17} />
                    </button>
                  ))}
                </div>
                <div className="jc-first-tip">
                  <Info size={14} />
                  {chat.mode === "demo"
                    ? "Start without a key. Local demo uses scripted rules, without model calls."
                    : "Live mode sends this conversation and reply material to TypeSafe."}
                </div>
              </div>
            ) : (
              <div
                className="jc-messages"
                role="log"
                aria-label="Conversation messages"
                aria-live="polite"
              >
                <div className="jc-thread-intro">
                  <span>{spaces[chat.space].title}</span>
                  <p>
                    {chat.space === "support"
                      ? "Synthetic support scenario · recommendations only"
                      : chat.space === "notes"
                        ? "Exact passages · verify against your source"
                        : "Jev decisions · scripted composition · source provenance"}
                  </p>
                </div>
                {chat.messages.map((message) => (
                  <article
                    key={message.id}
                    className={`jc-message jc-${message.role}`}
                  >
                    <div className="jc-message-body">
                      <div className="jc-message-author">
                        {message.role === "assistant" && (
                          <span className="jc-avatar" aria-hidden="true">
                            <MessageSquare size={15} />
                          </span>
                        )}
                        {message.role === "user" ? "You" : "Jev"}
                        {message.engineResult && (
                          <span>
                            {message.engineResult.trace.semanticVerification ===
                            "scripted-knowledge"
                              ? `Built-in knowledge · ${message.engineResult.provenance === "live" ? "live" : "demo"} mode`
                              : message.engineResult.trace
                                    .semanticVerification ===
                                  "scripted-personality"
                                ? `Hometown preference · ${message.engineResult.provenance === "live" ? "live" : "demo"} mode`
                                : message.engineResult.trace
                                      .semanticVerification === "scripted-help"
                                  ? `Scripted help · ${message.engineResult.provenance === "live" ? "live" : "demo"} mode`
                                  : message.engineResult.provenance === "demo"
                                    ? "Local demo"
                                    : "Live Jev"}{" "}
                            ·{" "}
                            {message.engineResult.status === "answered"
                              ? "Composed response"
                              : "Needs context"}
                          </span>
                        )}
                        {message.decision && (
                          <span>
                            {message.decision.provenance === "demo"
                              ? "Local demo"
                              : "Live Jev"}{" "}
                            ·{" "}
                            {message.decision.uncertain
                              ? "Needs context"
                              : message.decision.source
                                ? "Source passage"
                                : "Approved reply"}
                          </span>
                        )}
                      </div>
                      <JevChatProse
                        text={message.text}
                        sections={message.engineResult?.sections}
                        source={message.decision?.source}
                      />
                      {message.engineResult && (
                        <div className="jc-response-footer">
                          <JevResponseDetails
                            notes={chat.notes}
                            result={message.engineResult}
                            restored={message.restored}
                          />
                          <button
                            className="jc-icon"
                            aria-label={
                              copied === message.id
                                ? "Reply copied"
                                : "Copy reply"
                            }
                            onClick={() => copy(message)}
                          >
                            {copied === message.id ? (
                              <Check size={14} />
                            ) : (
                              <Copy size={14} />
                            )}
                          </button>
                        </div>
                      )}
                      {message.decision && (
                        <>
                          <div className="jc-answer-tools">
                            <details>
                              <summary>
                                <SlidersHorizontal size={13} />
                                Decision details
                              </summary>
                              <div className="jc-decision">
                                <dl>
                                  <div>
                                    <dt>Selected ID</dt>
                                    <dd>{message.decision.selected}</dd>
                                  </div>
                                  <div>
                                    <dt>Displayed reply</dt>
                                    <dd>{message.decision.id}</dd>
                                  </div>
                                  {message.decision.provenance === "demo" && (
                                    <div>
                                      <dt>Confidence</dt>
                                      <dd>Not measured</dd>
                                    </div>
                                  )}
                                  <div>
                                    <dt>Origin</dt>
                                    <dd>
                                      {message.decision.source ??
                                        "Authored reply library"}
                                    </dd>
                                  </div>
                                </dl>
                                {message.decision.provenance !== "demo" && (
                                  <ConfidenceBar
                                    label="Confidence"
                                    value={message.decision.confidence}
                                  />
                                )}
                                <p>
                                  {message.decision.uncertain
                                    ? "The available material or decision confidence did not support a direct answer."
                                    : "Selection is not proof of correctness. Check the reply against your question."}
                                </p>
                              </div>
                            </details>
                            <button
                              className="jc-icon"
                              aria-label={
                                copied === message.id
                                  ? "Reply copied"
                                  : "Copy reply"
                              }
                              onClick={() => copy(message)}
                            >
                              {copied === message.id ? (
                                <Check size={14} />
                              ) : (
                                <Copy size={14} />
                              )}
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </article>
                ))}
                {busy && (
                  <div className="jc-working" role="status">
                    <span className="jc-dot" />
                    {progress}
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="jc-compose-area">
            {storageIssue && (
              <div className="jc-notice" role="status">
                <span>{storageIssue}</span>
                {recoveryRaw !== null && (
                  <div>
                    {recoveryRaw && (
                      <button
                        onClick={() => {
                          const url = URL.createObjectURL(
                            new Blob([recoveryRaw], {
                              type: "application/json",
                            }),
                          );
                          const link = document.createElement("a");
                          link.href = url;
                          link.download = "jev-chat-stored-history.json";
                          link.click();
                          setTimeout(() => URL.revokeObjectURL(url), 1000);
                        }}
                      >
                        Export stored history
                      </button>
                    )}
                    <button
                      onClick={() => {
                        if (
                          !window.confirm(
                            "Replace stored history with the visible conversations? Export the stored history first; this cannot be undone.",
                          )
                        )
                          return;
                        try {
                          localStorage.setItem(
                            CHAT_STORAGE,
                            serializeChats(chats),
                          );
                          setRecoveryRaw(null);
                          setStorageIssue("");
                        } catch {
                          setStorageIssue(
                            "History could not be saved. The original stored data is still preserved.",
                          );
                        }
                      }}
                    >
                      Replace stored history
                    </button>
                  </div>
                )}
              </div>
            )}
            {error && (
              <div className="jc-alert" role="alert">
                {error}
              </div>
            )}
            {notice && (
              <div className="jc-notice" role="status">
                {notice}
                <button
                  className="jc-icon"
                  aria-label="Dismiss notice"
                  onClick={() => setNotice("")}
                >
                  <X size={14} />
                </button>
              </div>
            )}
            {full ? (
              <div className="jc-notice">
                This conversation reached its 40-message limit. Export it and
                start a new chat.
              </div>
            ) : pending && !busy ? (
              <div className="jc-retry">
                <span>No reply completed.</span>
                <button onClick={() => send(true)}>Retry selection</button>
                <button onClick={editPending}>Edit message</button>
              </div>
            ) : (
              suggested.length > 0 && (
                <div className="jc-followups">
                  {suggested.map((p) => (
                    <button
                      key={p}
                      onFocus={(event) =>
                        event.currentTarget.scrollIntoView({
                          block: "nearest",
                          inline: "nearest",
                        })
                      }
                      onClick={() => {
                        patch({ draft: p });
                        composer.current?.focus();
                      }}
                    >
                      {p}
                      <ChevronRight size={13} />
                    </button>
                  ))}
                </div>
              )
            )}
            <form
              className="jc-composer"
              onSubmit={(e) => {
                e.preventDefault();
                void send();
              }}
            >
              <textarea
                ref={composer}
                aria-label="Message Jev"
                placeholder={
                  pending
                    ? "Retry or edit the unanswered message above…"
                    : chat.space === "notes"
                      ? "Ask a question about your notes…"
                      : "Ask something. See how Jev chooses."
                }
                value={chat.draft}
                maxLength={2000}
                disabled={!ready || busy || pending || full}
                rows={2}
                onChange={(e) => patch({ draft: e.target.value })}
                onKeyDown={(e) => {
                  if (
                    e.key === "Enter" &&
                    !e.shiftKey &&
                    !e.nativeEvent.isComposing
                  ) {
                    e.preventDefault();
                    void send();
                  }
                }}
              />
              <div className="jc-composer-bottom">
                <label className="jc-mode-select">
                  <Zap size={13} />
                  <select
                    aria-label="Chat mode"
                    value={chat.mode}
                    disabled={busy || chat.messages.length > 0}
                    onChange={(e) =>
                      patch({ mode: e.target.value as "demo" | "live" })
                    }
                  >
                    <option value="demo">Local demo</option>
                    <option value="live">Live Jev</option>
                  </select>
                </label>
                <span className="jc-char-count">{chat.draft.length}/2,000</span>
                {busy ? (
                  <button
                    className="jc-send"
                    type="button"
                    aria-label="Stop selection"
                    onClick={() => {
                      controller.current?.abort();
                      setNotice("Selection stopped. No reply was completed.");
                    }}
                  >
                    <Square size={15} />
                  </button>
                ) : (
                  <button
                    className="jc-send"
                    type="submit"
                    aria-label="Send message"
                    disabled={!chat.draft.trim() || pending || full}
                  >
                    <ArrowUp size={19} />
                  </button>
                )}
              </div>
            </form>
            <div className="jc-composer-hint">
              <span>
                {chat.mode === "demo"
                  ? "Local demo · no API calls"
                  : "Live Jev · uses configured API key"}
              </span>
              <span>Enter to send · Shift + Enter for a new line</span>
            </div>
          </div>
        </section>
        {panel && (
          <aside
            className="jc-panel"
            ref={panelRef}
            aria-label={panel === "guide" ? "Chat guide" : "Source notes"}
          >
            <div className="jc-panel-heading">
              <span>
                {panel === "guide"
                  ? "A guide to Jev Chat"
                  : "Your source notes"}
              </span>
              <button
                className="jc-icon"
                data-close
                aria-label="Close guide panel"
                onClick={() => setPanel(null)}
              >
                <X size={18} />
              </button>
            </div>
            <div className="jc-panel-scroll">
              {panel === "notes" ? (
                <>
                  <span className="jc-eyebrow">THE ANSWER STARTS HERE</span>
                  <h2>Bring the context.</h2>
                  <p>
                    Add plain text with a blank line between passages. Jev can
                    select several relevant paragraphs and compose an answer
                    around exact quotations. It cannot independently fact-check
                    them.
                  </p>
                  <label className="jc-notes-label" htmlFor="jc-notes">
                    Source material
                  </label>
                  <textarea
                    id="jc-notes"
                    value={chat.notes}
                    maxLength={12000}
                    disabled={busy || chat.messages.length > 0}
                    onChange={(e) => patch({ notes: e.target.value })}
                    rows={15}
                  />
                  <p className="jc-small">
                    {chat.notes.length.toLocaleString()}/12,000 characters · up
                    to 40 paragraphs
                  </p>
                  {chat.messages.length > 0 ? (
                    <p>
                      Notes are locked to preserve this thread’s evidence. Start
                      a new conversation to change them.
                    </p>
                  ) : (
                    <button
                      className="jc-new"
                      onClick={() => patch({ notes: sampleNotes })}
                    >
                      Load synthetic shop policy
                    </button>
                  )}
                  <div className="jc-guide-callout">
                    Notes are saved in this browser. In Live Jev mode, they are
                    sent with every request. Do not paste secrets.
                  </div>
                </>
              ) : (
                <>
                  <span className="jc-eyebrow">
                    ONE MODEL. CLEAR BOUNDARIES.
                  </span>
                  <h2>Understand the choice.</h2>
                  <p>
                    Jev interprets your question and selects supported meanings.
                    Scripted language rules compose the response, and a content
                    hash records its exact parts.
                  </p>
                  <div className="jc-guide-flow">
                    <span>Your question</span>
                    <ChevronRight size={14} />
                    <span>Jev decisions</span>
                    <ChevronRight size={14} />
                    <span>Composition</span>
                  </div>
                  <h3>Find your starting point</h3>
                  <div className="jc-guide-item">
                    <Zap size={17} />
                    <div>
                      <strong>Meet Jev</strong>
                      <p>
                        Ask how this works, what it remembers, or where its
                        limits are.
                      </p>
                    </div>
                  </div>
                  <div className="jc-guide-item">
                    <MessageSquare size={17} />
                    <div>
                      <strong>Support desk</strong>
                      <p>
                        Try damaged deliveries and returns. All scenarios are
                        synthetic; no real action is taken.
                      </p>
                    </div>
                  </div>
                  <div className="jc-guide-item">
                    <FileText size={17} />
                    <div>
                      <strong>Your notes</strong>
                      <p>
                        Paste short, self-contained paragraphs. Answers quote
                        your text exactly, with a paragraph reference.
                      </p>
                    </div>
                  </div>
                  <h3>Get better answers</h3>
                  <ul>
                    <li>Ask one specific question at a time.</li>
                    <li>
                      Use follow-ups to clarify an existing topic in live mode.
                    </li>
                    <li>
                      Keep each source paragraph focused on one fact or policy.
                    </li>
                    <li>
                      If the answer is unsupported, add evidence instead of
                      repeating the question.
                    </li>
                  </ul>
                  <details open>
                    <summary>Demo versus live</summary>
                    <p>
                      Local demo uses scripted intent and relevance rules. It
                      does not measure Jev quality. Live mode batches semantic
                      decisions and can evaluate composed candidates in a second
                      request. Built-in help is scripted in either mode and
                      makes no Jev request. Set an API key in the playground
                      header, then choose Live Jev before the first message. The
                      baseline preserves the original whole-reply selector.
                    </p>
                  </details>
                  <details>
                    <summary>Choose a personality</summary>
                    <p>
                      In Compose, choose Default, Friendly, Playful, or
                      Professional. The setting applies to future replies and is
                      saved with this conversation. It changes greetings,
                      acknowledgements, and introductions to help and sources.
                      Source quotes, clarification wording, story tone, and
                      calculations stay intact. New conversations inherit your
                      current choice.
                    </p>
                  </details>
                  <details>
                    <summary>What does confidence mean?</summary>
                    <p>
                      Confidence is a model signal, not an accuracy guarantee.
                      For live model selections, missing confidence or a value
                      below 80% triggers clarification. Scripted help needs no
                      model confidence. Selected-option probability and
                      distribution confidence are shown separately; they are not
                      independent checks. Provider errors stay errors and never
                      become demo answers.
                    </p>
                  </details>
                  <details>
                    <summary>Where are my chats stored?</summary>
                    <p>
                      Up to 12 conversations are saved locally in this browser,
                      with 40 messages per thread. Exports include messages and
                      notes, but not the API key setting. Local storage is
                      unencrypted. Live requests send the thread and reply
                      material to TypeSafe.
                    </p>
                  </details>
                  <details>
                    <summary>Can it write anything?</summary>
                    <p>
                      Compose creates new combinations through scripted language
                      rules, including short fictional scenes. Factual content
                      comes from the guide or exact passages in your notes. It
                      cannot browse the web, run arbitrary code, or complete
                      purchases. Source text may itself be incorrect.
                    </p>
                  </details>
                  <div className="jc-guide-callout">
                    <ShieldCheck size={18} />
                    <p>
                      Typed output limits what can be selected. It does not
                      prove the selection is right.
                    </p>
                  </div>
                </>
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
