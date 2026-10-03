"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Expand, Minimize, RotateCcw } from "lucide-react";
import type { World } from "../types/microduck";
import type { createDuckScene } from "../lib/microduck-scene";
import { DuckArena } from "./DuckArena";

export function MicroDuckStage({
  world,
  selected,
  onSelect,
  controls,
  busy,
}: {
  world: World;
  selected: string;
  onSelect: (id: string) => void;
  controls: ReactNode;
  busy: boolean;
}) {
  const root = useRef<HTMLDivElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<ReturnType<typeof createDuckScene> | null>(null);
  const latest = useRef({ world, selected, onSelect });
  latest.current = { world, selected, onSelect };
  const [status, setStatus] = useState<"loading" | "ready" | "fallback">(
    "loading",
  );
  const [full, setFull] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const element = host.current!;
    const lost = (event: Event) => {
      event.preventDefault();
      scene.current?.dispose();
      scene.current = null;
      setStatus("fallback");
    };
    element.addEventListener("webglcontextlost", lost, true);
    import("../lib/microduck-scene")
      .then(({ createDuckScene }) => {
        if (cancelled) return;
        try {
          scene.current = createDuckScene(element, latest.current.world, (id) =>
            latest.current.onSelect(id),
          );
          scene.current.update(latest.current.world, latest.current.selected);
          setStatus("ready");
        } catch {
          setStatus("fallback");
        }
      })
      .catch(() => {
        if (!cancelled) setStatus("fallback");
      });
    return () => {
      cancelled = true;
      element.removeEventListener("webglcontextlost", lost, true);
      scene.current?.dispose();
      scene.current = null;
    };
  }, []);
  useEffect(() => {
    scene.current?.update(world, selected);
  }, [world, selected]);
  useEffect(() => {
    const sync = () => setFull(document.fullscreenElement === root.current);
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !document.fullscreenElement) setFull(false);
    };
    document.addEventListener("fullscreenchange", sync);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("fullscreenchange", sync);
      document.removeEventListener("keydown", escape);
    };
  }, []);
  useEffect(() => {
    if (!full) return;
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const restoreFocus = document.activeElement as HTMLElement | null;
    root.current?.focus();
    return () => {
      document.body.style.overflow = old;
      restoreFocus?.focus();
    };
  }, [full]);
  async function toggleFullscreen() {
    if (full) {
      if (document.fullscreenElement === root.current)
        await document.exitFullscreen().catch(() => {});
      setFull(false);
      return;
    }
    setFull(true);
    try {
      await root.current?.requestFullscreen?.();
    } catch {
      /* CSS fullscreen also works on mobile. */
    }
  }
  const duck = world.ducks.find((d) => d.id === selected) ?? world.ducks[0];
  return (
    <div
      ref={root}
      tabIndex={-1}
      className={`microduck-stage${full ? " is-fullscreen" : ""}`}
      role={full ? "dialog" : undefined}
      aria-modal={full || undefined}
      aria-label="MicroDuck mission control"
      onKeyDown={(event) => {
        if (!full || event.key !== "Tab") return;
        const elements = Array.from(
          root.current!.querySelectorAll<HTMLElement>(
            "button:not(:disabled), select:not(:disabled), input:not(:disabled), summary",
          ),
        );
        const first = elements[0],
          last = elements.at(-1);
        if (
          event.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === root.current)
        ) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }}
    >
      <header className="microduck-stage-header">
        <div>
          <span className="microduck-kicker">
            JEV ROBOTICS / LIVE SIMULATION
          </span>
          <h2>
            MicroDuck<span> / arena</span>
          </h2>
        </div>
        <div className="microduck-stage-tools">
          <button
            className="button"
            aria-label="Reset camera"
            onClick={() => scene.current?.home()}
            disabled={status !== "ready"}
          >
            <RotateCcw size={16} />
          </button>
          <button
            className="button"
            onClick={toggleFullscreen}
            aria-label={full ? "Exit fullscreen" : "Enter fullscreen"}
          >
            {full ? <Minimize size={16} /> : <Expand size={16} />}
            <span>{full ? "Exit" : "Fullscreen"}</span>
          </button>
        </div>
      </header>
      <div className="microduck-scene-wrap">
        <div className="microduck-scene" ref={host} />
        {status === "loading" && (
          <p className="microduck-scene-status" role="status">
            Preparing the 3D test floor…
          </p>
        )}
        {status === "fallback" && (
          <div className="microduck-fallback">
            <p>3D is unavailable. The interactive tactical map is ready.</p>
            <DuckArena world={world} selected={selected} onSelect={onSelect} />
          </div>
        )}
        <div className="microduck-hud">
          <span>
            <i className={busy ? "active" : ""} />
            {busy ? "MISSION ACTIVE" : "STANDING BY"}
          </span>
          <span>
            TICK <b>{world.tick.toString().padStart(3, "0")}</b>
          </span>
        </div>
        <div className="microduck-scene-caption">
          {status === "ready"
            ? "Drag to orbit · Scroll or pinch to zoom · Tap a robot to inspect"
            : "Select a robot below to inspect its state"}
        </div>
      </div>
      <footer className="microduck-console">
        <div className="microduck-drive">{controls}</div>
        <div className="microduck-crew" aria-label="Select robot">
          {world.ducks.map((d, i) => (
            <button
              key={d.id}
              className="microduck-robot"
              aria-pressed={selected === d.id}
              onClick={() => onSelect(d.id)}
            >
              <span className={`microduck-dot duck-color-${i}`} />
              {d.name}
              <small>{d.battery}%</small>
            </button>
          ))}
        </div>
        <div className="microduck-status">
          <span>
            {duck.carrying ? "CARGO ABOARD" : "COLLECT CARGO → RETURN TO DOCK"}
          </span>
          <span>
            {duck.goals} delivered · {duck.collisions} dents
          </span>
        </div>
      </footer>
    </div>
  );
}
