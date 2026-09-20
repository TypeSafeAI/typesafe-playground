"use client";
import { useSyncExternalStore } from "react";
import { RequestQueue } from "./requestRateLimit";
const listeners = new Set<() => void>();
const initial = { queued: 0, active: 0, nextStart: 0 };
let snapshot = initial;
export const browserRequestQueue = new RequestQueue(() => {
  snapshot = browserRequestQueue.status();
  listeners.forEach((listener) => listener());
});
export function useRequestQueue() {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    () => snapshot,
    () => initial,
  );
}
