import { solvePuzzle } from "./engine";
self.onmessage = async (event: MessageEvent) => {
  try {
    const result = await solvePuzzle(event.data.puzzle, event.data.scramble);
    self.postMessage({ result });
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.message : "Puzzle search failed.",
    });
  }
};
