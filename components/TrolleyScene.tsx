"use client";

import { useId, type CSSProperties } from "react";
import type {
  TrackOccupants,
  TrolleyCase,
  TrolleyDecision,
} from "../lib/trolley";

function Occupants({ occupants, y }: { occupants: TrackOccupants; y: number }) {
  return (
    <g transform={`translate(500 ${y})`} className="trolley-occupants">
      {occupants.kind === "empty" ? (
        <path d="M0 -11 h124" strokeDasharray="3 7" opacity=".4" />
      ) : (
        Array.from({ length: occupants.count }, (_, i) => (
          <g key={i} transform={`translate(${i * 29} 0)`}>
            {occupants.kind === "human" ? (
              <>
                <circle cx="0" cy="-27" r="6" />
                <path d="M0 -20 v18 M-9 -9 L0 -18 L9 -9 M0 -2 L-7 8 M0 -2 L7 8" />
              </>
            ) : occupants.kind === "robot" ? (
              <>
                <rect x="-8" y="-29" width="16" height="13" rx="3" />
                <path d="M0 -34 v5 M-4 -23 h1 M3 -23 h1 M-7 -13 h14 v14 h-14 z M-11 -11 v11 M11 -11 v11 M-4 1 v7 M4 1 v7" />
              </>
            ) : (
              <>
                <rect x="-10" y="-36" width="46" height="40" rx="5" />
                <circle cx="13" cy="-16" r="10" />
                <path d="M13 -22 v12 M7 -16 h12 M-5 -29 h2 M-5 -5 h2" />
              </>
            )}
          </g>
        ))
      )}
    </g>
  );
}

export function TrolleyScene({
  scenario,
  decision,
  paused,
}: {
  scenario: TrolleyCase;
  decision: TrolleyDecision | null;
  paused: boolean;
}) {
  const id = useId();
  const pull = decision?.action === "pull";
  const route = pull
    ? "M80 160 H230 C310 160 325 70 400 70 H450"
    : "M80 160 H450";
  const path =
    pull && scenario.uncertain
      ? "M80 160 H230 C280 160 295 140 312 115"
      : route;
  const description = `Main track: ${scenario.main.label}. Side track: ${scenario.side.label}. ${scenario.loop ? "The side track loops back to the main line." : "Pulling diverts to the side track."} ${decision ? scenario.outcomes[decision.action] : "No action has been chosen."}`;
  return (
    <svg
      className="trolley-scene"
      viewBox="0 0 720 240"
      role="img"
      aria-labelledby={`${id}-title ${id}-desc`}
      data-action={decision?.action ?? "ready"}
    >
      <title id={`${id}-title`}>{scenario.title}: trolley scene</title>
      <desc id={`${id}-desc`}>{description}</desc>
      <defs>
        <pattern
          id={`${id}-grid`}
          width="24"
          height="24"
          patternUnits="userSpaceOnUse"
        >
          <circle cx="1" cy="1" r=".8" fill="currentColor" opacity=".14" />
        </pattern>
      </defs>
      <rect width="720" height="240" fill={`url(#${id}-grid)`} />
      <g className="trolley-rails" fill="none">
        <path
          d="M30 160 H675 M230 160 C310 160 325 70 400 70 H675"
          className="trolley-rail-bed"
        />
        <path
          d="M30 160 H675 M230 160 C310 160 325 70 400 70 H675"
          className="trolley-rail-ties"
        />
        <path d="M30 154 H675 M30 166 H675 M230 154 C310 154 325 64 400 64 H675 M230 166 C310 166 325 76 400 76 H675" />
        {scenario.loop && (
          <path d="M665 70 C720 70 720 160 665 160" strokeDasharray="5 5" />
        )}
      </g>
      {decision && (
        <path d={path} className="trolley-chosen-rail" fill="none" />
      )}
      <text x="675" y="22" textAnchor="end" className="trolley-track-label">
        SIDE TRACK · {scenario.side.label}
      </text>
      <text x="675" y="215" textAnchor="end" className="trolley-track-label">
        MAIN TRACK · {scenario.main.label}
      </text>
      <Occupants occupants={scenario.side} y={70} />
      <Occupants occupants={scenario.main} y={160} />
      <g transform="translate(230 213)" className="trolley-lever">
        <path d="M-14 0 h28 M-8 0 l8 -8 l8 8" />
        <path
          d={pull ? "M0 -8 L17 -32" : "M0 -8 L-17 -32"}
          className="trolley-lever-arm"
        />
        <circle cx={pull ? 17 : -17} cy="-32" r="5" />
      </g>
      <text
        x="230"
        y="236"
        textAnchor="middle"
        className="trolley-switch-label"
      >
        {pull ? "LEVER PULLED" : "THE SWITCH"}
      </text>
      <g
        key={decision ? `${decision.source}-${decision.action}` : "ready"}
        className={decision ? "trolley-tram is-moving" : "trolley-tram"}
        transform={decision ? undefined : "translate(80 160)"}
        style={
          decision
            ? ({
                offsetPath: `path('${path}')`,
                offsetRotate: "0deg",
                animationPlayState: paused ? "paused" : "running",
              } as CSSProperties)
            : undefined
        }
      >
        <rect
          x="-32"
          y="-49"
          width="64"
          height="40"
          rx="9"
          className="trolley-car"
        />
        <path
          d="M-24 -15 h48 M-18 -53 h36 M0 -53 v-8"
          className="trolley-trim"
        />
        <rect
          x="-23"
          y="-41"
          width="17"
          height="15"
          rx="3"
          className="trolley-window"
        />
        <rect
          x="3"
          y="-41"
          width="17"
          height="15"
          rx="3"
          className="trolley-window"
        />
        <circle cx="-18" cy="-6" r="7" className="trolley-wheel" />
        <circle cx="18" cy="-6" r="7" className="trolley-wheel" />
      </g>
    </svg>
  );
}
