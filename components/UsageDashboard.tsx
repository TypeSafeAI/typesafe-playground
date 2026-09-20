"use client";
import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { API_KEY_EVENT, readApiKey } from "../lib/api-key";
import { fetchAccountUsage } from "../lib/fetchAccountUsage";
import {
  expireUsageBlock,
  initializeUsage,
  releaseUsageBlock,
  updateAccountUsage,
  useUsage,
} from "../lib/logUsageEntry";
import { useRequestQueue } from "../lib/browserRequestQueue";
import { REQUEST_POLICY } from "../lib/requestRateLimit";
import { UsageSummaryBadge } from "./UsageSummaryBadge";
import { UsageDetailPanel } from "./UsageDetailPanel";
export function UsageDashboard() {
  const usage = useUsage();
  const queue = useRequestQueue();
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const [personal, setPersonal] = useState(false),
    [now, setNow] = useState(Date.now());
  useEffect(() => {
    initializeUsage();
    const sync = () => setPersonal(!!readApiKey());
    sync();
    window.addEventListener(API_KEY_EVENT, sync);
    window.addEventListener("storage", sync);
    void fetchAccountUsage().then(updateAccountUsage);
    const timer = setInterval(() => {
      expireUsageBlock();
      setNow(Date.now());
    }, 1000);
    return () => {
      clearInterval(timer);
      window.removeEventListener(API_KEY_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  const left = usage.block?.resetAt
    ? Math.max(0, Math.ceil((Date.parse(usage.block.resetAt) - now) / 1000))
    : null;
  return (
    <>
      <UsageSummaryBadge
        queueCount={queue.queued}
        usage={usage}
        personal={personal}
        onClick={() => {
          setOpen(true);
          dialog.current?.showModal();
        }}
      />
      <dialog
        className="usage-dialog"
        ref={dialog}
        onClose={() => setOpen(false)}
        aria-labelledby="usage-title"
        onClick={(e) => {
          if (e.target === dialog.current) dialog.current.close();
        }}
      >
        <div className="usage-dialog-head">
          <div>
            <span className="eyebrow">API ACTIVITY</span>
            <h2 id="usage-title">Usage & budget</h2>
          </div>
          <button
            className="icon-button"
            aria-label="Close usage dashboard"
            onClick={() => dialog.current?.close()}
          >
            <X size={18} />
          </button>
        </div>
        <div className="usage-dialog-body">
          <section
            className="usage-rate-policy"
            aria-label="Request rate policy"
          >
            <span className="eyebrow">PLAYGROUND SAFETY LIMITS</span>
            <h3>Steady requests. Visible limits.</h3>
            <p>
              <strong>
                {queue.active} active · {queue.queued}/
                {REQUEST_POLICY.maxQueued} queued
              </strong>
              {queue.queued > 0 &&
                ` · ${queue.active >= REQUEST_POLICY.maxConcurrent ? "Waiting for a running request" : `Next slot in ${Math.max(0, Math.ceil((queue.nextStart - now) / 1000))}s`}`}
            </p>
            <p>
              Browser: one start every 1.2 seconds (at most 50/minute), up to 2
              active calls and 20 waiting. Shared by examples in this tab.
              Waiting requests cancel when their run is stopped; a full queue
              rejects new work without an API call.
            </p>
            <p>
              Server: 60 requests per rolling 60 seconds and 2 concurrent calls
              per key, per server instance. Other tabs using the same key share
              that instance’s allowance. This in-memory safeguard resets on
              restart and is not a distributed or account-wide quota.
            </p>
            {usage.rateLimit && (
              <p>
                Last server snapshot:{" "}
                <strong>
                  {usage.rateLimit.remaining}/{usage.rateLimit.limit} starts
                  remaining
                </strong>
                . This is a response-time snapshot, not a live account balance.
              </p>
            )}
            <p>
              Source: playground policy in <code>lib/requestRateLimit.ts</code>.
              TypeSafe may impose separate limits. Provider HTTP 429 pauses
              calls until its reported reset; without a reset time, retry
              requires your action. HTTP 402 is a budget/billing failure, not a
              pacing limit. No automatic retries or background replay.
            </p>
          </section>
          {usage.block && (
            <div className="quota-warning exhausted" role="status">
              <strong>
                {usage.block.kind === "rate_limit"
                  ? "Rate limited"
                  : "Budget unavailable"}
              </strong>
              <p>{usage.block.message}</p>
              <p>
                {left !== null
                  ? `Retry available in ${Math.floor(left / 60)}m ${left % 60}s.`
                  : "The API did not provide a reset time."}
              </p>
              {left === null && (
                <button className="button" onClick={releaseUsageBlock}>
                  Resume calls and retry
                </button>
              )}
            </div>
          )}
          {open && <UsageDetailPanel usage={usage} personal={personal} />}
        </div>
      </dialog>
    </>
  );
}
