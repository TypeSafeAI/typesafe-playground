"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  BookOpen,
  Bot,
  Code2,
  ChevronDown,
  Gamepad2,
  House,
  Shapes,
  ArrowUpRight,
  X,
} from "lucide-react";
import { playgroundGroups } from "../lib/playground";
import { navigationSections } from "../lib/navigation";
import { type SectionId, workspacePath } from "../lib/routes";

const icons = {
  language: BookOpen,
  agents: Bot,
  governance: Code2,
  simulations: Shapes,
  arcade: Gamepad2,
};

export function WorkspaceNavigation({
  path,
  collapsed,
  mobileOpen,
}: {
  path: string;
  collapsed: boolean;
  mobileOpen: boolean;
}) {
  const current = playgroundGroups.find(
    (g) => path === g.href || path.startsWith(g.href + "/"),
  )?.id;
  const [expanded, setExpanded] = useState<string | null>(current ?? null);
  const [flyout, setFlyout] = useState<string | null>(null);
  const nav = useRef<HTMLElement>(null);
  useEffect(() => {
    setExpanded(current ?? null);
  }, [current, path]);
  useEffect(() => {
    nav.current?.querySelectorAll<HTMLElement>("[popover]").forEach((el) => {
      if (el.matches(":popover-open")) el.hidePopover();
    });
  }, [path, collapsed, mobileOpen]);
  useEffect(() => {
    const resize = () =>
      nav.current?.querySelectorAll<HTMLElement>("[popover]").forEach((el) => {
        if (el.matches(":popover-open")) el.hidePopover();
      });
    const query = matchMedia("(min-width: 761px) and (max-width: 1100px)");
    const mobile = matchMedia("(max-width: 760px)");
    query.addEventListener("change", resize);
    mobile.addEventListener("change", resize);
    return () => {
      query.removeEventListener("change", resize);
      mobile.removeEventListener("change", resize);
    };
  }, []);
  function links(id: SectionId) {
    const section = playgroundGroups.find((g) => g.id === id)!;
    return navigationSections[id].groups.map((group) => (
      <div
        className="nav-subsection"
        key={group.label}
        role="group"
        aria-label={group.label}
      >
        <p className="nav-subsection-label">{group.label}</p>
        {group.workspaces.map((slug) => {
          const item = section.examples.find(
            (item) => item.href === workspacePath(slug),
          )!;
          const Icon = item.icon;
          return (
            <div key={slug}>
              <Link
                href={item.href}
                prefetch={false}
                aria-label={item.label}
                aria-current={path === item.href ? "page" : undefined}
                className={path === item.href ? "active" : ""}
              >
                <Icon size={16} aria-hidden="true" />
                <span>{item.label}</span>
              </Link>
              {slug === "jev-browser-agent" && (
                <Link
                  href={`${item.href}/native`}
                  prefetch={false}
                  className={`nav-nested-link${path.endsWith("/native") ? " active" : ""}`}
                  aria-current={path.endsWith("/native") ? "page" : undefined}
                >
                  <span>Native browser</span>
                </Link>
              )}
            </div>
          );
        })}
      </div>
    ));
  }
  return (
    <nav ref={nav} aria-label="Workspaces" className="workspace-nav">
      <Link
        href="/"
        prefetch={false}
        aria-label="Home"
        title="Home"
        className={`nav-home${path === "/" ? " active" : ""}`}
        aria-current={path === "/" ? "page" : undefined}
      >
        <House size={19} aria-hidden="true" />
        <span>Home</span>
      </Link>
      {playgroundGroups.map((group) => {
        const id = group.id as SectionId;
        const Icon = icons[id];
        const open = expanded === id;
        return (
          <div
            className="nav-group"
            key={id}
            role="group"
            aria-label={group.label}
            data-current={current === id || undefined}
          >
            <div className="nav-section-heading">
              <Link
                href={group.href}
                prefetch={false}
                className={`nav-overview${path === group.href ? " active" : ""}`}
                aria-current={path === group.href ? "page" : undefined}
              >
                <Icon size={17} aria-hidden="true" />
                <span>{group.label}</span>
              </Link>
              <button
                className="nav-disclosure"
                aria-label={`${open ? "Hide" : "Show"} ${group.label} workspaces`}
                aria-expanded={open}
                aria-controls={`nav-children-${id}`}
                onClick={() => setExpanded(open ? null : id)}
              >
                <ChevronDown size={15} aria-hidden="true" />
              </button>
            </div>
            <div
              className="nav-section-children"
              id={`nav-children-${id}`}
              hidden={!open}
            >
              {links(id)}
            </div>
            <button
              className="nav-section-trigger"
              popoverTarget={`nav-flyout-${id}`}
              aria-label={`${group.label} workspaces`}
              aria-expanded={flyout === id}
              aria-controls={`nav-flyout-${id}`}
              aria-current={current === id ? "true" : undefined}
              title={group.label}
            >
              <Icon size={20} aria-hidden="true" />
              <span>{navigationSections[id].shortLabel}</span>
            </button>
            <div
              className="nav-flyout"
              id={`nav-flyout-${id}`}
              popover="auto"
              role="region"
              aria-label={`${group.label} navigation`}
              onToggle={(event) =>
                setFlyout(
                  event.newState === "open"
                    ? id
                    : (value) => (value === id ? null : value),
                )
              }
              onBlur={(event) => {
                const next = event.relatedTarget as HTMLElement | null;
                if (
                  next &&
                  !event.currentTarget.contains(next) &&
                  next.getAttribute("popoverTarget") !==
                    event.currentTarget.id &&
                  event.currentTarget.matches(":popover-open")
                )
                  event.currentTarget.hidePopover();
              }}
            >
              <div className="nav-flyout-heading">
                <Link
                  href={group.href}
                  prefetch={false}
                  aria-current={path === group.href ? "page" : undefined}
                >
                  {group.label}
                  <ArrowUpRight size={15} aria-hidden="true" />
                </Link>
                <button
                  className="icon-button"
                  popoverTarget={`nav-flyout-${id}`}
                  popoverTargetAction="hide"
                  aria-label={`Close ${group.label} navigation`}
                >
                  <X size={17} />
                </button>
              </div>
              {links(id)}
            </div>
          </div>
        );
      })}
    </nav>
  );
}
