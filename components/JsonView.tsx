"use client";
import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Check, Copy, Search } from "lucide-react";

/**
 * A read-only viewer for values the app already holds as parsed JSON: provider
 * responses, question criteria, A/B comparison values. It renders the value it
 * is given and never reformats or re-parses it, so what you read here is what
 * the app received.
 *
 * Deliberately not an editor. Editing needs to tolerate transiently invalid
 * text, which a tree cannot represent, so the questions editor stays a
 * textarea.
 */
type Json = unknown;

const typeOf = (value: Json) =>
  value === null
    ? "null"
    : Array.isArray(value)
      ? "array"
      : typeof value === "object"
        ? "object"
        : typeof value;

const isBranch = (value: Json): value is object =>
  typeof value === "object" && value !== null;

const entriesOf = (value: object): [string, Json][] =>
  Array.isArray(value)
    ? value.map((v, i) => [String(i), v])
    : Object.entries(value);

/** "3 keys" / "2 items" — enough to judge whether opening it is worthwhile. */
function summarize(value: object) {
  const count = entriesOf(value).length;
  if (Array.isArray(value))
    return count === 1 ? "1 item" : `${count} items`;
  return count === 1 ? "1 key" : `${count} keys`;
}

/** Depth-first search over keys and rendered scalars, case-insensitive. */
function matches(value: Json, needle: string, key?: string): boolean {
  if (!needle) return true;
  const hay = needle.toLowerCase();
  if (key?.toLowerCase().includes(hay)) return true;
  if (!isBranch(value)) return String(value).toLowerCase().includes(hay);
  return entriesOf(value).some(([k, v]) => matches(v, needle, k));
}

function Scalar({ value }: { value: Json }) {
  const kind = typeOf(value);
  return (
    <span className={`json-scalar json-${kind}`}>
      {kind === "string" ? JSON.stringify(value) : String(value)}
    </span>
  );
}

function Node({
  name,
  value,
  depth,
  filter,
  defaultOpenDepth,
}: {
  name?: string;
  value: Json;
  depth: number;
  filter: string;
  defaultOpenDepth: number;
}) {
  // A filter that matches deeper down is only useful if the path is open, so
  // searching expands; clearing the box returns to the depth default.
  const [override, setOverride] = useState<boolean | null>(null);
  const open = override ?? (filter ? true : depth < defaultOpenDepth);
  if (!matches(value, filter, name)) return null;
  const label = name === undefined ? null : <span className="json-key">{name}</span>;
  if (!isBranch(value))
    return (
      <div className="json-row" style={{ paddingLeft: depth * 14 }}>
        {label}
        {label ? <span className="json-colon">:</span> : null}
        <Scalar value={value} />
      </div>
    );
  const entries = entriesOf(value);
  const [openChar, closeChar] = Array.isArray(value) ? ["[", "]"] : ["{", "}"];
  return (
    <div className="json-branch">
      <div className="json-row" style={{ paddingLeft: depth * 14 }}>
        <button
          type="button"
          className="json-caret"
          aria-expanded={open}
          aria-label={`${open ? "Collapse" : "Expand"} ${name ?? "root"}`}
          onClick={() => setOverride(!open)}
        >
          {open ? (
            <ChevronDown size={13} aria-hidden="true" />
          ) : (
            <ChevronRight size={13} aria-hidden="true" />
          )}
        </button>
        {label}
        {label ? <span className="json-colon">:</span> : null}
        <span className="json-punct">{openChar}</span>
        {!open && (
          <>
            <span className="json-summary">{summarize(value)}</span>
            <span className="json-punct">{closeChar}</span>
          </>
        )}
      </div>
      {open && (
        <>
          {entries.map(([k, v]) => (
            <Node
              key={k}
              name={k}
              value={v}
              depth={depth + 1}
              filter={filter}
              defaultOpenDepth={defaultOpenDepth}
            />
          ))}
          <div className="json-row" style={{ paddingLeft: depth * 14 }}>
            <span className="json-punct">{closeChar}</span>
          </div>
        </>
      )}
    </div>
  );
}

export function JsonView({
  value,
  label = "JSON",
  defaultOpenDepth = 2,
  searchable,
}: {
  value: Json;
  label?: string;
  defaultOpenDepth?: number;
  /** Defaults to on for values large enough that scanning is the slow part. */
  searchable?: boolean;
}) {
  const [filter, setFilter] = useState("");
  const [copied, setCopied] = useState(false);
  const text = useMemo(() => JSON.stringify(value, null, 2), [value]);
  const big = useMemo(
    () => isBranch(value) && entriesOf(value as object).length > 3,
    [value],
  );
  const showSearch = searchable ?? big;
  const empty = filter && !matches(value, filter);
  return (
    <div className="json-view">
      <div className="json-tools">
        {showSearch && (
          <label className="json-search">
            <Search size={13} aria-hidden="true" />
            <input
              type="search"
              value={filter}
              placeholder="Filter keys and values"
              aria-label={`Filter ${label}`}
              onChange={(e) => setFilter(e.target.value)}
            />
          </label>
        )}
        <button
          type="button"
          className="button quiet json-copy"
          aria-label={`Copy ${label}`}
          onClick={() => {
            // Clipboard access can be refused; the tree stays selectable, so a
            // silent failure is recoverable rather than a dead end.
            navigator.clipboard
              ?.writeText(text)
              .then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              })
              .catch(() => setCopied(false));
          }}
        >
          {copied ? (
            <Check size={13} aria-hidden="true" />
          ) : (
            <Copy size={13} aria-hidden="true" />
          )}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <div className="json-tree" role="tree" aria-label={label}>
        {empty ? (
          <p className="json-empty">No key or value matches “{filter}”.</p>
        ) : (
          <Node
            value={value}
            depth={0}
            filter={filter}
            defaultOpenDepth={defaultOpenDepth}
          />
        )}
      </div>
    </div>
  );
}
