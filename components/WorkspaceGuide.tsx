"use client";
import { useRef, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import {
  ArrowRight,
  BookOpen,
  X,
  FileInput,
  Workflow,
  ScanEye,
  Lightbulb,
  ShieldCheck,
} from "lucide-react";
import { playgroundPages } from "../lib/playground";
import { workspaceGuides } from "../lib/workspace-guides";
import { workspaceDetails } from "../lib/workspace-details";

export function WorkspaceGuide({
  compact = false,
  children,
}: {
  compact?: boolean;
  children?: ReactNode;
}) {
  const path = usePathname();
  const dialog = useRef<HTMLDialogElement>(null);
  const guide = workspaceGuides[path];
  const detail = workspaceDetails[path];
  const page = playgroundPages.find((p) => p.href === path);
  if (!guide || !detail || !page) return null;
  const Icon = page.icon;
  const sections = [
    { title: "What you provide", text: detail.input, icon: FileInput },
    { title: "What happens", text: detail.process, icon: Workflow },
    { title: "What you get", text: detail.output, icon: ScanEye },
  ];
  return (
    <>
      <button
        className={compact ? "icon-button" : "button workspace-guide-trigger"}
        aria-label={compact ? "Open browser guide" : undefined}
        aria-haspopup="dialog"
        onClick={() => dialog.current?.showModal()}
      >
        <BookOpen size={compact ? 18 : 15} />
        {!compact && " Workspace guide"}
      </button>
      <dialog
        ref={dialog}
        className="workspace-guide-dialog"
        aria-label={`${page.label} guide`}
      >
        <header className="workspace-guide-header">
          <div className="workspace-guide-heading">
            <span className="workspace-guide-icon">
              <Icon size={23} strokeWidth={1.5} />
            </span>
            <div>
              <span className="eyebrow">WORKSPACE GUIDE</span>
              <h2>{page.label}</h2>
            </div>
            <button
              autoFocus
              className="icon-button"
              aria-label="Close workspace guide"
              onClick={() => dialog.current?.close()}
            >
              <X size={19} />
            </button>
          </div>
          <p>
            {detail.summary ??
              ("detail" in page && typeof page.detail === "string"
                ? page.detail
                : "Find an experiment, understand its decision, and inspect the evidence.")}
          </p>
        </header>
        <div
          className="workspace-guide-body"
          tabIndex={0}
          aria-label="Guide details"
        >
          <div className="workspace-guide-flow" aria-label="The flow">
            {guide.flow.map((step, i) => (
              <span key={step}>
                {i > 0 && <ArrowRight size={14} aria-hidden="true" />}
                <span>{step}</span>
              </span>
            ))}
          </div>
          <div className="workspace-guide-breakdown">
            {sections.map(({ title, text, icon: SectionIcon }) => (
              <section key={title}>
                <SectionIcon size={19} strokeWidth={1.5} aria-hidden="true" />
                <h3>{title}</h3>
                <p>{text}</p>
              </section>
            ))}
          </div>
          <section className="workspace-guide-walkthrough">
            <h3>Walk through a run</h3>
            <ol className="workspace-guide-steps">
              {guide.steps.map(([title, text], index) => (
                <li key={title}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <div>
                    <h4>{title}</h4>
                    <p>{text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>
          <section className="workspace-guide-experiment">
            <Lightbulb size={20} strokeWidth={1.5} aria-hidden="true" />
            <div>
              <h3>Try this</h3>
              <p>{detail.experiment}</p>
            </div>
          </section>
          <section className="workspace-guide-limits">
            <ShieldCheck size={20} strokeWidth={1.5} aria-hidden="true" />
            <div>
              <h3>Execution limits</h3>
              <p>{guide.boundary}</p>
            </div>
          </section>
          {children && (
            <details className="workspace-guide-more">
              <summary>Local setup and browser details</summary>
              {children}
            </details>
          )}
        </div>
        <footer className="workspace-guide-footer">
          <span>Explore the example. Check the evidence.</span>
          <button
            className="button primary"
            onClick={() => dialog.current?.close()}
          >
            Back to workspace <ArrowRight size={15} />
          </button>
        </footer>
      </dialog>
    </>
  );
}

export function DecisionPreview() {
  const path = usePathname();
  const guide = workspaceGuides[path];
  const page = playgroundPages.find((p) => p.href === path);
  if (!guide || !page) return null;
  const Icon = page.icon;
  return (
    <div className="decision-preview" aria-label="How this example works">
      <span className="decision-preview-icon">
        <Icon size={30} strokeWidth={1.25} />
      </span>
      <div className="decision-preview-flow">
        {guide.flow.map((step, i) => (
          <span key={step}>
            {i > 0 && <ArrowRight size={13} aria-hidden="true" />}
            <span>{step}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
