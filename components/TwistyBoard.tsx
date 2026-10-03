"use client";
import { useEffect, useRef, useState } from "react";
import type { ExperimentalSVGAnimator } from "cubing/twisty";
import { MEGAMINX_FACES, type PuzzleId } from "../lib/twisty/contracts";

export default function TwistyBoard({
  puzzle,
  algorithm,
}: {
  puzzle: PuzzleId;
  algorithm: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const diagram = useRef<ExperimentalSVGAnimator | null>(null);
  const latestAlgorithm = useRef(algorithm);
  latestAlgorithm.current = algorithm;
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  useEffect(() => {
    let disposed = false;
    setStatus("loading");
    diagram.current = null;
    host.current?.replaceChildren();
    async function load() {
      const [{ ExperimentalSVGAnimator }, { puzzles }] = await Promise.all([
        import("cubing/twisty"),
        import("cubing/puzzles"),
      ]);
      const [model, svg] = await Promise.all([
        puzzles[puzzle].kpuzzle(),
        puzzles[puzzle].svg(),
      ]);
      if (disposed || !host.current) return;
      const view = new ExperimentalSVGAnimator(model, svg);
      view.drawPattern(
        model.defaultPattern().applyAlg(latestAlgorithm.current),
      );
      if (puzzle === "megaminx") {
        // The upstream SVG uses internal face names. Label fixed face positions
        // with the public notation emitted by the solver, derived from its moves.
        for (const face of MEGAMINX_FACES) {
          const center = model
            .moveToTransformation(face)
            .transformationData.CENTERS.orientationDelta.findIndex(
              (value) => value !== 0,
            );
          const polygon = view.svgElement.querySelector(
            `[id="CENTERS-l${center}-o0"]`,
          );
          const coordinates = polygon
            ?.getAttribute("points")
            ?.trim()
            .split(/[\s,]+/)
            .map(Number);
          if (
            !coordinates?.length ||
            coordinates.length % 2 ||
            !coordinates.every(Number.isFinite)
          )
            throw Error("Missing Megaminx face center.");
          const points = Array.from(
            { length: coordinates.length / 2 },
            (_, i) => [coordinates[i * 2], coordinates[i * 2 + 1]],
          );
          const label = document.createElementNS(
            "http://www.w3.org/2000/svg",
            "text",
          );
          label.setAttribute(
            "x",
            String(
              points.reduce((sum, point) => sum + point[0], 0) / points.length,
            ),
          );
          label.setAttribute(
            "y",
            String(
              points.reduce((sum, point) => sum + point[1], 0) / points.length,
            ),
          );
          label.setAttribute("class", "twisty-face-label");
          label.setAttribute("data-face", face);
          label.textContent = face;
          view.svgElement.append(label);
        }
      }
      diagram.current = view;
      host.current.replaceChildren(view.svgElement);
      setStatus("ready");
    }
    void load().catch(() => {
      if (!disposed) setStatus("error");
    });
    return () => {
      disposed = true;
      diagram.current = null;
    };
  }, [puzzle]);
  useEffect(() => {
    const view = diagram.current;
    if (!view) return;
    try {
      view.drawPattern(view.kpuzzle.defaultPattern().applyAlg(algorithm));
    } catch {
      setStatus("error");
    }
  }, [algorithm]);
  return (
    <div className="twisty-board" data-status={status}>
      <div
        ref={host}
        role="img"
        aria-label={`${puzzle === "megaminx" ? "Megaminx" : puzzle} unfolded puzzle at the selected step`}
      />
      {status === "loading" && <p role="status">Loading puzzle diagram…</p>}
      {status === "error" && (
        <p role="alert">
          The puzzle diagram could not load. The written solution remains
          available.
        </p>
      )}
    </div>
  );
}
