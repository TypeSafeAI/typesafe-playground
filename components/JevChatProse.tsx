import { Fragment } from "react";
import type { Section } from "../lib/jev-chat/types";

/** Render plain text only; source markup never becomes HTML or active links. */
export function JevChatProse({
  text,
  sections,
  source,
}: {
  text: string;
  sections?: Section[];
  source?: string;
}) {
  const content = sections ?? [
    { text, provenance: source ? "source" : "authored", source },
  ];
  return (
    <div className="jc-message-text jc-prose">
      {content.map((section, index) => {
        // Retain separators in the DOM as well as the paragraph layout so
        // selecting/copying text does not join words or alter quoted evidence.
        const paragraphs = section.text
          .split(/(\r?\n[\t ]*\r?\n)/)
          .map((part, i) => (i % 2 ? part : <p key={i}>{part}</p>));
        return (
          <Fragment key={index}>
            {index > 0 ? "\n\n" : null}
            {section.provenance === "source" ? (
              <blockquote aria-label={section.source}>{paragraphs}</blockquote>
            ) : (
              paragraphs
            )}
          </Fragment>
        );
      })}
    </div>
  );
}
