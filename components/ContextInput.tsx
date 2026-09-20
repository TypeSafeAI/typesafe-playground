"use client";
import { BookOpen, MessageSquare } from "lucide-react";
import { ErrorNote } from "./ui";
import type { ChatMessage, DocSnippet } from "../types/triage";
export function ContextInput({
  transcript,
  onTranscript,
  format,
  onFormat,
  docs,
  onDocs,
  history,
  snippets,
  parseError,
  disabled,
  transcriptLabel,
  transcriptHint,
}: {
  transcript: string;
  onTranscript: (value: string) => void;
  format: string;
  onFormat: (value: string) => void;
  docs: string;
  onDocs: (value: string) => void;
  history: ChatMessage[];
  snippets: DocSnippet[];
  parseError: string;
  disabled?: boolean;
  transcriptLabel: string;
  transcriptHint: string;
}) {
  return (
    <fieldset disabled={disabled}>
      <label className="gate-label" htmlFor="gate-transcript">
        <MessageSquare size={14} /> {transcriptLabel}
      </label>
      <textarea
        id="gate-transcript"
        className="transcript"
        value={transcript}
        maxLength={40000}
        spellCheck={false}
        placeholder="Val — 09:02&#10;The API key stays server-side."
        onChange={(event) => onTranscript(event.target.value)}
      />
      <span className="field-hint">{transcriptHint}</span>
      <label className="gate-label" htmlFor="gate-docs">
        <BookOpen size={14} /> Additional docs or FAQ (optional)
      </label>
      <textarea
        id="gate-docs"
        value={docs}
        rows={6}
        maxLength={20000}
        spellCheck={false}
        placeholder="# Rate limits&#10;60 requests per minute per key."
        onChange={(event) => onDocs(event.target.value)}
      />
      <span className="field-hint">
        Official TypeSafe docs are retrieved automatically. Add optional local
        notes here. One line per fact. Headings starting with # name the section
        a citation points at.
      </span>
      <details className="disclosure">
        <summary>
          Parsed context{" "}
          <span>
            {history.length} messages · {snippets.length} doc lines
          </span>
        </summary>
        <label>
          Paste format
          <select
            value={format}
            onChange={(event) => onFormat(event.target.value)}
          >
            <option value="auto">Auto-detect</option>
            <option value="discord">Discord</option>
            <option value="labeled">Name: message</option>
            <option value="plain">Plain text</option>
          </select>
        </label>
        <ErrorNote message={parseError} />
        {history.map((message) => (
          <div className="parsed-message" key={message.id}>
            <strong>{message.speaker}</strong>
            <time>{message.timestamp}</time>
            <p>{message.content}</p>
          </div>
        ))}
        {snippets.map((snippet) => (
          <div className="parsed-message" key={snippet.id}>
            <strong>{snippet.title}</strong>
            <time>{snippet.id}</time>
            <p>{snippet.content}</p>
          </div>
        ))}
      </details>
    </fieldset>
  );
}
