/** Playground policy, not a TypeSafe plan allowance. */
export const REQUEST_POLICY = {
  intervalMs: 1200,
  maxQueued: 20,
  requestsPerWindow: 60,
  windowMs: 60_000,
  maxConcurrent: 2,
} as const;

export class RequestQueue {
  private nextStart = 0;
  private active = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private jobs: Array<{ run: () => void; cancel: () => void }> = [];
  constructor(
    private changed: () => void = () => {},
    private intervalMs = REQUEST_POLICY.intervalMs as number,
  ) {}
  status() {
    return {
      queued: this.jobs.length,
      active: this.active,
      nextStart: this.nextStart,
    };
  }
  run<T>(task: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    if (signal?.aborted)
      return Promise.reject(signal.reason ?? new Error("Request cancelled."));
    if (this.jobs.length >= REQUEST_POLICY.maxQueued)
      return Promise.reject(
        new Error(
          "Playground queue is full (20 waiting requests). Wait for it to drain before running again. Nothing was sent to TypeSafe.",
        ),
      );
    return new Promise<T>((resolve, reject) => {
      const cleanup = () => signal?.removeEventListener("abort", job.cancel);
      const job = {
        cancel: () => {
          const index = this.jobs.indexOf(job);
          if (index < 0) return;
          this.jobs.splice(index, 1);
          cleanup();
          reject(signal?.reason ?? new Error("Request cancelled."));
          this.pump();
        },
        run: () => {
          cleanup();
          this.active++;
          this.nextStart = Date.now() + this.intervalMs;
          this.changed();
          Promise.resolve()
            .then(task)
            .then(resolve, reject)
            .finally(() => {
              this.active--;
              this.pump();
            });
        },
      };
      this.jobs.push(job);
      signal?.addEventListener("abort", job.cancel, { once: true });
      this.pump();
    });
  }
  private pump() {
    clearTimeout(this.timer);
    if (this.jobs.length && this.active < REQUEST_POLICY.maxConcurrent) {
      const delay = this.nextStart - Date.now();
      if (delay > 0) this.timer = setTimeout(() => this.pump(), delay);
      else this.jobs.shift()!.run();
    }
    this.changed();
  }
}
