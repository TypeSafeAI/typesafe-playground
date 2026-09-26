export function BrowserAgentGuide() {
  return (
    <article
      className="agent-guide browser-quick-guide"
      aria-label="About this example"
    >
      <header className="guide-intro">
        <h2>From a goal to eight checked parts.</h2>
        <p>
          Your local browser reads Newegg. Jev ranks observed choices. Code
          checks the budget.
        </p>
      </header>
      <section aria-labelledby="guide-start">
        <h3 id="guide-start">Get started</h3>
        <ol className="guide-steps">
          <li>
            <span>01</span>
            <div>
              <strong>Set your goal</strong>
              <p>
                Choose the Newegg preset, edit the request, then select{" "}
                <b>Find PC parts</b>.
              </p>
            </div>
          </li>
          <li>
            <span>02</span>
            <div>
              <strong>Watch it browse</strong>
              <p>
                A local browser reads listings, selects eight parts within
                $2,500, and reopens each product page.
              </p>
            </div>
          </li>
          <li>
            <span>03</span>
            <div>
              <strong>Review the evidence</strong>
              <p>
                Open <b>Inspector</b> for prices, source links, verification
                gaps, and <b>Copy debug report</b>.
              </p>
            </div>
          </li>
        </ol>
      </section>
      <section aria-labelledby="guide-setup">
        <h3 id="guide-setup">Local setup</h3>
        <dl className="guide-fields">
          <div>
            <dt>Run locally</dt>
            <dd>
              Run the app on a machine with <code>uv</code> and Chromium
              installed. The browser launches on that server, so serverless
              hosts such as Vercel cannot run it.
            </dd>
          </div>
          <div>
            <dt>Jev key</dt>
            <dd>
              Configure <code>TYPESAFE_API_KEY</code>. No text-generation model
              is required.
            </dd>
          </div>
          <div>
            <dt>Chromium</dt>
            <dd>
              <code className="guide-command">
                pnpm exec playwright install chromium
              </code>
            </dd>
          </div>
          <div>
            <dt>First run</dt>
            <dd>
              Downloads the pinned browser-use Python package. Set{" "}
              <code>LOCAL_BROWSER_EXECUTABLE</code> to use another Chromium
              executable.
            </dd>
          </div>
        </dl>
      </section>
      <section aria-labelledby="guide-expect">
        <h3 id="guide-expect">What to expect</h3>
        <dl className="guide-fields">
          <div>
            <dt>Search scope</dt>
            <dd>
              Nine focused AM5/DDR5 listing searches and eight product checks.
              No cart or purchase actions.
            </dd>
          </div>
          <div>
            <dt>Browser view</dt>
            <dd>
              Captured page observations. Navigation is automated; the view is
              not an interactive remote desktop.
            </dd>
          </div>
          <div>
            <dt>Billing fallback</dt>
            <dd>
              If Jev reaches a billing or quota limit, a labeled local
              price-only baseline keeps research moving. Inspector retains the
              error. This baseline is not a performance ranking.
            </dd>
          </div>
        </dl>
      </section>
      <section aria-labelledby="guide-evidence">
        <h3 id="guide-evidence">Evidence & limits</h3>
        <dl className="guide-fields">
          <div>
            <dt>Debug report</dt>
            <dd>
              Candidate IDs, document URLs and hashes, exact Jev exchanges,
              timing, reported token usage, and unresolved checks.
            </dd>
          </div>
          <div>
            <dt>Budget</dt>
            <dd>Tower only. Prices exclude tax and shipping.</dd>
          </div>
          <div>
            <dt>Still to verify</dt>
            <dd>
              Full compatibility and gaming performance. This is a focused
              search, not a benchmark or exhaustive comparison. Challenges and
              unavailable listings stay marked as gaps.
            </dd>
          </div>
        </dl>
      </section>
      <section aria-labelledby="guide-native">
        <h3 id="guide-native">Native browser commands</h3>
        <p>
          <a href="/agents/jev-browser-agent/native">Open the native Jev workspace</a>{" "}
          to run batched form actions, inspect delta updates, and measure tokens
          per action. Synthetic benchmarks and live Newegg navigation are
          labeled separately.
        </p>
      </section>
      <details className="guide-flight">
        <summary>Optional: flight sandbox</summary>
        <dl className="guide-fields">
          <div>
            <dt>Process</dt>
            <dd>
              Observe → choose → validate → act on a synthetic page. Jev picks
              operations, target IDs, and literal goal spans for text fields.
            </dd>
          </div>
          <div>
            <dt>When blocked</dt>
            <dd>
              An independent completion check and one fresh observation run
              before stopping. Flight checks apply only to the flight preset.
            </dd>
          </div>
          <div>
            <dt>Reference</dt>
            <dd>
              The flight loop is based on{" "}
              <a
                href="https://github.com/browser-use/jev-ultrafast"
                target="_blank"
                rel="noreferrer"
              >
                browser-use/jev-ultrafast
              </a>
              . PC research uses browser-use directly for local navigation and
              observation.
            </dd>
          </div>
        </dl>
      </details>
    </article>
  );
}
