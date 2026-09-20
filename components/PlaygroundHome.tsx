"use client";
import Link from "next/link";
import { WorkspaceGuide } from "./WorkspaceGuide";
import { useState, type CSSProperties } from "react";
import { ArrowRight, Search, X } from "lucide-react";
import { bentoSpans, flowEnds, playgroundGroups } from "../lib/playground";

export function PlaygroundHome() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const total = playgroundGroups.reduce(
    (sum, group) => sum + group.examples.length,
    0,
  );
  const groups = playgroundGroups
    .filter((group) => category === "all" || category === group.id)
    .map((group) => ({
      ...group,
      examples: group.examples.filter((example) =>
        `${example.label} ${example.detail} ${group.label}`
          .toLowerCase()
          .includes(query.trim().toLowerCase()),
      ),
    }))
    .filter((group) => group.examples.length);
  const count = groups.reduce((sum, group) => sum + group.examples.length, 0);
  return (
    <div className="workspace playground-home">
      <header className="home-intro">
        <div>
          <p className="home-eyebrow">TYPESAFE AI / COMMUNITY PLAYGROUND</p>
          <h1>
            Small model.
            <br />
            <span>Many possibilities.</span>
          </h1>
          <p className="home-description">
            Explore Jev through {total} hands-on examples. Give it context,
            define the choices, and watch a decision take shape.
          </p>
          <div className="home-guide">
            <WorkspaceGuide />
          </div>
        </div>
        <div
          className="home-signal"
          aria-label="How Jev works: context, fixed choices, decision"
        >
          <span>Context</span>
          <ArrowRight size={15} aria-hidden="true" />
          <span className="home-signal-core">Fixed choices</span>
          <ArrowRight size={15} aria-hidden="true" />
          <span>Decision</span>
          <p>
            A classifier at the center.
            <br />
            You control what happens next.
          </p>
        </div>
      </header>
      <div className="home-discovery">
        <div className="home-search">
          <Search size={17} aria-hidden="true" />
          <input
            aria-label="Search examples"
            type="search"
            placeholder="Find an example…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {query && (
            <button aria-label="Clear search" onClick={() => setQuery("")}>
              <X size={15} />
            </button>
          )}
        </div>
        <div
          className="home-filters"
          role="group"
          aria-label="Filter examples by type"
        >
          {[{ id: "all", label: "All examples" }, ...playgroundGroups].map(
            (group) => (
              <button
                key={group.id}
                aria-pressed={category === group.id}
                onClick={() => setCategory(group.id)}
              >
                {group.label}
              </button>
            ),
          )}
        </div>
      </div>
      <p className="home-count" role="status">
        {count} of {total} examples
      </p>
      <div className="home-sections">
        {groups.map((group) => {
          const spans = bentoSpans(group.examples.length);
          return (
            <section
              key={group.id}
              aria-labelledby={`home-${group.id}`}
              className="home-section"
            >
              <div className="home-section-heading">
                <h2 id={`home-${group.id}`}>
                  {group.label}
                  <span>{group.examples.length}</span>
                </h2>
                <p>{group.description}</p>
              </div>
              <div className="home-card-grid">
                {group.examples.map(
                  ({ href, label, detail, flow, icon: Icon }, index) => {
                    const { input, output } = flowEnds(flow);
                    const span = spans[index] ?? 2;
                    return (
                      <Link
                        href={href}
                        prefetch={false}
                        key={href}
                        className="home-example-card"
                        data-span={span}
                        style={{ "--bento-span": span } as CSSProperties}
                        aria-label={`Open ${label}`}
                      >
                        <div className="home-card-top">
                          <Icon
                            size={20}
                            strokeWidth={1.6}
                            aria-hidden="true"
                          />
                          <span className="home-card-ord" aria-hidden="true">
                            {String(index + 1).padStart(2, "0")}
                          </span>
                          <ArrowRight
                            size={16}
                            className="home-card-arrow"
                            aria-hidden="true"
                          />
                        </div>
                        <h3>{label}</h3>
                        <p>{detail}</p>
                        <dl className="home-card-flow">
                          <div>
                            <dt>in</dt>
                            <dd>{input}</dd>
                          </div>
                          {output && (
                            <div>
                              <dt>out</dt>
                              <dd>{output}</dd>
                            </div>
                          )}
                        </dl>
                      </Link>
                    );
                  },
                )}
              </div>
            </section>
          );
        })}
        {!count && (
          <div className="home-no-results">
            <h2>No matching examples</h2>
            <p>Try a different term, or browse the full playground.</p>
            <button
              onClick={() => {
                setQuery("");
                setCategory("all");
              }}
            >
              Show all examples
            </button>
          </div>
        )}
      </div>
      <footer className="home-note">
        <span>Built around choices, not generated answers.</span>
        <Link href="/examples" prefetch={false}>
          Build your own experiment <ArrowRight size={14} aria-hidden="true" />
        </Link>
      </footer>
    </div>
  );
}
