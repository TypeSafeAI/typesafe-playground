import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { playgroundGroups } from "../lib/playground";
import type { SectionId } from "../lib/routes";
import { WorkspaceCardGrid } from "./WorkspaceCardGrid";

/** A dedicated landing page for one section, in the home page's visual language. */
export function SectionPage({ id }: { id: SectionId }) {
  const group = playgroundGroups.find((g) => g.id === id);
  if (!group) throw Error(`Unknown section: ${id}`);
  const others = playgroundGroups.filter((g) => g.id !== id);
  const [lead, accent] = group.headline;
  const [input, core, output] = group.signal;
  const count = group.examples.length;
  return (
    <div className="workspace playground-home section-page" data-section={id}>
      <header className="home-intro">
        <div>
          <p className="home-eyebrow">
            TYPESAFE AI / {group.label.toUpperCase()}
          </p>
          <h1>
            {lead}
            <br />
            <span>{accent}</span>
          </h1>
          <p className="home-description">{group.description}</p>
        </div>
        <div
          className="home-signal"
          aria-label={`How this section works: ${input}, ${core}, ${output}`}
        >
          <span>{input}</span>
          <ArrowRight size={15} aria-hidden="true" />
          <span className="home-signal-core">{core}</span>
          <ArrowRight size={15} aria-hidden="true" />
          <span>{output}</span>
          <p>
            Jev chooses inside a fixed set.
            <br />
            Code decides what that choice may do.
          </p>
        </div>
      </header>
      <section
        aria-labelledby={`section-${id}-workspaces`}
        className="home-section section-workspaces"
      >
        <div className="home-section-heading">
          <h2 id={`section-${id}-workspaces`}>
            {id === "arcade" ? "Games" : "Workspaces"}
            <span>{count}</span>
          </h2>
          <p>
            {id === "arcade"
              ? "Each game runs the same seed for Jev and a random baseline, so you can see whether Jev's choices beat chance."
              : "Open one to try it. Every workspace keeps mock, live and failed results clearly labeled."}
          </p>
        </div>
        <WorkspaceCardGrid examples={group.examples} />
      </section>
      <nav className="section-others" aria-label="Other sections">
        <p className="home-eyebrow">MORE SECTIONS</p>
        <div className="home-filters">
          {others.map((other) => (
            <Link key={other.id} href={other.href} prefetch={false}>
              {other.label}
              <span className="section-others-count">
                {other.examples.length}
              </span>
            </Link>
          ))}
        </div>
      </nav>
      <footer className="home-note">
        <span>Built around choices, not generated answers.</span>
        <Link href="/" prefetch={false}>
          <ArrowLeft size={14} aria-hidden="true" /> All examples
        </Link>
      </footer>
    </div>
  );
}
