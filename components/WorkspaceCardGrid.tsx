import Link from "next/link";
import type { CSSProperties } from "react";
import { ArrowRight } from "lucide-react";
import { bentoSpans, flowEnds, type PlaygroundGroup } from "../lib/playground";

/** The bento card grid shared by the home page and every section page. */
export function WorkspaceCardGrid({
  examples,
}: {
  examples:
    | PlaygroundGroup["examples"]
    | readonly PlaygroundGroup["examples"][number][];
}) {
  const spans = bentoSpans(examples.length);
  return (
    <div className="home-card-grid">
      {examples.map(({ href, label, detail, flow, icon: Icon }, index) => {
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
              <Icon size={20} strokeWidth={1.6} aria-hidden="true" />
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
      })}
    </div>
  );
}
