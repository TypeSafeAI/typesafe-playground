"use client";
import Link from "next/link";
import { UsageDashboard } from "./UsageDashboard";
import { QuotaWarningBanner } from "./QuotaWarningBanner";
import { ApiKeySettings } from "./ApiKeySettings";
import { API_KEY_EVENT, readApiKey } from "../lib/api-key";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  PanelLeftClose,
  PanelLeftOpen,
  Menu,
  X,
  ArrowUpRight,
  Moon,
  Sun,
  Sparkles,
} from "lucide-react";
import {
  homePage,
  playgroundGroups,
  playgroundPages as pages,
} from "../lib/playground";
const NARROW_RAIL_ROUTES = new Set(["/jev-chat"]);
export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const sidebarRef = useRef<HTMLElement>(null);
  // Seeded from the route during the first render, not in an effect: the route
  // is known on the server too, so this matches on hydration and the rail never
  // paints at full width and then animates down.
  const [collapsed, setCollapsed] = useState(() =>
    NARROW_RAIL_ROUTES.has(path),
  );
  const [mobileOpen, setMobileOpen] = useState(false);
  /**
   * The chat studio is a reading surface, so it starts with the rail collapsed
   * to its icon width rather than taking a second 224px column beside the
   * conversation list. This is a per-route starting point, not a stored
   * preference: the toggle still works here, and leaving the route restores
   * whatever the reader chose elsewhere.
   */
  useEffect(() => {
    try {
      setCollapsed(
        NARROW_RAIL_ROUTES.has(path) ||
          localStorage.getItem("typesafe-nav-collapsed") === "true",
      );
    } catch {
      setCollapsed(NARROW_RAIL_ROUTES.has(path));
    }
  }, [path]);
  useEffect(() => {
    setMobileOpen(false);
  }, [path]);
  useEffect(() => {
    if (!mobileOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    sidebarRef.current
      ?.querySelector<HTMLButtonElement>(".sidebar-mobile-close")
      ?.focus();
    const keyboard = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
      if (e.key !== "Tab") return;
      const controls = Array.from(
        sidebarRef.current?.querySelectorAll<HTMLElement>("button, a[href]") ??
          [],
      ).filter((el) => el.getClientRects().length);
      const first = controls[0],
        last = controls.at(-1);
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", keyboard);
    return () => {
      document.removeEventListener("keydown", keyboard);
      previous?.focus();
    };
  }, [mobileOpen]);
  const toggleSidebar = () => {
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem("typesafe-nav-collapsed", String(next));
    } catch {}
  };

  const [dark, setDark] = useState(false);
  const [health, setHealth] = useState("Connecting");
  const [personalKey, setPersonalKey] = useState(false);
  useEffect(() => {
    const sync = () => setPersonalKey(!!readApiKey());
    sync();
    window.addEventListener(API_KEY_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(API_KEY_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  useEffect(() => {
    setDark(document.documentElement.dataset.theme === "dark");
    fetch("/api/health")
      .then((r) => r.json())
      .then((d) => setHealth(d.configured ? "Jev connected" : "API key needed"))
      .catch(() => setHealth("Connection unavailable"));
  }, []);
  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.dataset.theme = next ? "dark" : "light";
    try {
      localStorage.setItem(
        "typesafe-playground-theme",
        next ? "dark" : "light",
      );
    } catch {}
  }
  return (
    <div
      className={`app-shell dashboard-shell${collapsed ? " nav-collapsed" : ""}${mobileOpen ? " nav-mobile-open" : ""}`}
    >
      <a href="#main" className="skip-link">
        Skip to workspace
      </a>
      {mobileOpen && (
        <button
          className="nav-backdrop"
          aria-label="Dismiss navigation overlay"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <aside
        ref={sidebarRef}
        className="sidebar"
        id="playground-navigation"
        aria-label="Playground sidebar"
      >
        <div className="sidebar-title-row">
          <Link
            className="brand"
            href="/"
            aria-label="TypeSafe AI community playground"
          >
            <span className="brand-mark">
              <img src="/brand/mark.jpg" width={32} height={32} alt="" />
            </span>
            <span>
              TypeSafe AI<span className="brand-sub">COMMUNITY PLAYGROUND</span>
            </span>
          </Link>
          <button
            className="sidebar-toggle icon-button"
            onClick={toggleSidebar}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!collapsed}
            aria-controls="playground-navigation"
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? (
              <PanelLeftOpen size={17} />
            ) : (
              <PanelLeftClose size={17} />
            )}
          </button>
          <button
            className="icon-button sidebar-mobile-close"
            aria-label="Close navigation"
            onClick={() => setMobileOpen(false)}
          >
            <X size={18} />
          </button>
        </div>
        <nav aria-label="Workspaces">
          <Link
            href="/"
            prefetch={false}
            aria-label="Home"
            title="Home"
            className={path === "/" ? "active" : ""}
            aria-current={path === "/" ? "page" : undefined}
          >
            <homePage.icon size={18} />
            <span>Home</span>
          </Link>
          {playgroundGroups.map((group) => (
            <div
              className="nav-group"
              key={group.id}
              role="group"
              aria-labelledby={`nav-${group.id}`}
            >
              <div className="nav-label" id={`nav-${group.id}`}>
                {group.label}
              </div>
              {group.examples.map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  prefetch={false}
                  aria-label={label}
                  title={label}
                  className={path === href ? "active" : ""}
                  aria-current={path === href ? "page" : undefined}
                >
                  <Icon size={18} />
                  <span>{label}</span>
                </Link>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="model-card">
            <Sparkles size={17} />
            <div>
              <strong>Small model. Clear choices.</strong>
              <p>Powered by Jev</p>
            </div>
          </div>
          <a
            href="https://docs.typesafe.ai/introduction/quickstart"
            target="_blank"
            rel="noreferrer"
            className="docs-link"
          >
            Docs <ArrowUpRight size={15} />
          </a>
        </div>
      </aside>
      <div className="app-body">
        <header className="workspace-topbar">
          <div className="workspace-breadcrumb">
            <button
              className="icon-button mobile-menu"
              aria-label="Open navigation"
              aria-expanded={mobileOpen}
              aria-controls="playground-navigation"
              onClick={() => setMobileOpen(!mobileOpen)}
            >
              <Menu size={18} />
            </button>
            <span>Playground</span>
            <span>/</span>
            <strong>
              {pages.find((page) => page.href === path)?.label ?? "Workspace"}
            </strong>
          </div>
          <div className="header-actions">
            <UsageDashboard />
            <ApiKeySettings />
            <a
              className="icon-button github-link"
              href="https://github.com/TypeSafeAI/typesafe-playground"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="View TypeSafe AI Playground on GitHub"
              title="View source on GitHub"
            >
              <svg
                width="19"
                height="19"
                viewBox="0 0 24 24"
                aria-hidden="true"
                fill="currentColor"
              >
                <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.56v-2.23c-3.2.7-3.88-1.36-3.88-1.36-.52-1.33-1.28-1.68-1.28-1.68-1.05-.72.08-.71.08-.71 1.16.08 1.77 1.19 1.77 1.19 1.03 1.76 2.7 1.25 3.36.95.1-.74.4-1.25.73-1.54-2.56-.29-5.25-1.28-5.25-5.69 0-1.26.45-2.28 1.19-3.08-.12-.29-.52-1.46.11-3.04 0 0 .97-.31 3.16 1.18a11 11 0 0 1 5.75 0c2.19-1.49 3.15-1.18 3.15-1.18.63 1.58.23 2.75.11 3.04.74.8 1.19 1.82 1.19 3.08 0 4.42-2.69 5.4-5.26 5.69.42.36.78 1.06.78 2.14v3.17c0 .31.21.67.79.56A11.5 11.5 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" />
              </svg>
            </a>
            <span
              title={
                personalKey
                  ? "Personal API key saved (not yet verified)"
                  : health
              }
              aria-label={personalKey ? "Personal API key saved" : health}
              className={`connection ${!personalKey && health === "Jev connected" ? "connected" : ""}`}
            >
              <i />
              {personalKey ? "Personal key saved · unverified" : health}
            </span>
            <button
              className="icon-button"
              onClick={toggle}
              aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
            >
              {dark ? <Sun size={18} /> : <Moon size={18} />}
            </button>
          </div>
        </header>
        <QuotaWarningBanner />
        <main id="main" tabIndex={-1}>
          {children}
        </main>
        <footer className="app-footer">
          <span>
            TypeSafe AI <span className="footer-dot">·</span> Community
            playground
          </span>
          <span>Choose with confidence.</span>
        </footer>
      </div>
    </div>
  );
}
